/**
 * Subscribes the local device to a Play vs Friends session in Firestore and
 * mirrors the document into Redux:
 *   - `playFriendsSlice` summary fields (status, participants, host, ...).
 *   - For guests, the play-slice's round / log / cumulativeTotals via the
 *     `HYDRATE_PLAY_FROM_FRIENDS_SESSION` root action.
 *
 * Also detects:
 *   - Stale host heartbeat (> HOST_STALE_MS) → snackbar + clear session.
 *   - `status === 'cancelled' | 'ended'` → snackbar + return home.
 */
import { useEffect, useRef } from 'react';
import { enqueueSnackbar } from 'notistack';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  hydrateFromSession,
  selectPlayFriendsCode,
  selectPlayFriendsRole,
  clearFriendsSession,
} from './playFriendsSlice';
import { subscribeToPlaySession, type PlaySessionDocument } from './playSessionService';
import { goHome, setGameType } from '../game/gameSlice';
import {
  HYDRATE_PLAY_FROM_FRIENDS_SESSION,
  type RootState,
} from '../../app/store';
import { endGame } from '../play/playSlice';

const HOST_STALE_MS = 15000;
const STALE_CHECK_INTERVAL_MS = 3000;

export function usePlayFriendsSession(): void {
  const dispatch = useAppDispatch();
  const role = useAppSelector(selectPlayFriendsRole);
  const code = useAppSelector(selectPlayFriendsCode);
  const localUsername = useAppSelector(
    (s: RootState) => s.identity.currentPlayer?.username ?? null,
  );
  const lastHeartbeatRef = useRef<number | null>(null);
  const lastDocRef = useRef<PlaySessionDocument | null>(null);

  // Subscribe to the session doc.
  useEffect(() => {
    if (!code) return;
    const unsub = subscribeToPlaySession(code, (data) => {
      lastDocRef.current = data;
      if (!data) {
        enqueueSnackbar('Game session was deleted.', { variant: 'info' });
        dispatch(clearFriendsSession());
        dispatch(goHome());
        return;
      }
      dispatch(hydrateFromSession(data));
      lastHeartbeatRef.current = data.hostHeartbeatAt ?? null;

      if (data.status === 'cancelled') {
        enqueueSnackbar('Host cancelled the game.', { variant: 'warning' });
        dispatch(clearFriendsSession());
        dispatch(endGame());
        dispatch(goHome());
        return;
      }

      if (data.status === 'ended' && data.winner === null) {
        enqueueSnackbar('Game ended because a player left.', {
          variant: 'warning',
        });
        dispatch(clearFriendsSession());
        dispatch(endGame());
        dispatch(goHome());
        return;
      }

      // Hydrate play-slice for guests on every snapshot during in-progress play.
      if (
        role === 'guest' &&
        (data.status === 'in-progress' || data.status === 'ended') &&
        data.round &&
        data.seating.length > 0
      ) {
        const humanId =
          localUsername
            ? data.seating.find(
                (id) => data.usernameByPlayerId[id] === localUsername,
              ) ?? null
            : null;
        dispatch({
          type: HYDRATE_PLAY_FROM_FRIENDS_SESSION,
          payload: {
            round: data.round,
            seating: data.seating,
            playerNames: data.playerNames,
            usernameByPlayerId: data.usernameByPlayerId,
            humanId,
            humanUsername: localUsername,
            cumulativeTotals: data.cumulativeTotals,
            roundHistory: data.roundHistory,
            log: data.log,
            lastEvents: data.lastEvents,
            gameOver: data.gameOver,
            length: data.length,
            dealerId: data.seating[0] ?? null,
          },
        });
      }
    });
    return () => unsub();
  }, [code, dispatch, role, localUsername]);

  // Detect stale host heartbeat (guests only).
  useEffect(() => {
    if (role !== 'guest' || !code) return;
    const id = window.setInterval(() => {
      const last = lastHeartbeatRef.current;
      const status = lastDocRef.current?.status;
      if (status !== 'in-progress' && status !== 'lobby') return;
      if (last && Date.now() - last > HOST_STALE_MS) {
        enqueueSnackbar('Host disconnected. Returning home.', {
          variant: 'warning',
        });
        dispatch(clearFriendsSession());
        dispatch(endGame());
        dispatch(setGameType('unranked'));
        dispatch(goHome());
      }
    }, STALE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [role, code, dispatch]);
}
