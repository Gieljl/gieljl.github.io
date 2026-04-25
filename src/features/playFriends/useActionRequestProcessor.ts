/**
 * Host-only hook. Watches the action-request queue from the latest
 * subscription snapshot and processes them FIFO:
 *   - Validate that the request is from the player whose turn it currently is.
 *   - Dispatch the `submitAction` reducer locally (host-authoritative). The
 *     host-sync hook will broadcast the new round to guests.
 *   - Remove the request from the queue.
 *
 * Invalid requests (wrong player's turn, malformed) are removed silently to
 * keep the queue from clogging.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  consumeActionRequest,
  fetchPlaySession,
  type PlaySessionActionRequest,
} from './playSessionService';
import {
  selectPlayFriendsCode,
  selectPlayFriendsRole,
} from './playFriendsSlice';
import { selectPlayRound, submitAction } from '../play/playSlice';
import type { RootState } from '../../app/store';

const POLL_INTERVAL_MS = 600;

export function useActionRequestProcessor(): void {
  const dispatch = useAppDispatch();
  const role = useAppSelector(selectPlayFriendsRole);
  const code = useAppSelector(selectPlayFriendsCode);
  const round = useAppSelector(selectPlayRound);
  const usernameByPlayerId = useAppSelector(
    (s: RootState) => {
      // Read from playFriends.participants to derive the seating mapping. We
      // mirror the host's known seating via the slice's playerNames map kept
      // up-to-date by initFriendsGame; when guests join later, mapping comes
      // from the doc itself, but host always has the canonical mapping
      // because it produced it at start time.
      return s.play.seating;
    },
  );
  const seating = usernameByPlayerId; // alias for clarity below

  const busyRef = useRef(false);

  useEffect(() => {
    if (role !== 'host' || !code) return;
    let cancelled = false;
    const tick = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const doc = await fetchPlaySession(code);
        if (cancelled || !doc) return;
        const queue: PlaySessionActionRequest[] = doc.actionRequests ?? [];
        if (queue.length === 0) return;
        const next = queue[0];
        // Determine whose turn it currently is in our local round.
        const currentPlayerId =
          round?.players[round.currentPlayerIndex]?.id ?? null;
        const expectedUsername = currentPlayerId
          ? doc.usernameByPlayerId[currentPlayerId]
          : null;
        try {
          if (
            round &&
            round.phase === 'in-progress' &&
            expectedUsername === next.fromUsername &&
            seating.includes(currentPlayerId ?? '')
          ) {
            dispatch(submitAction(next.action));
          }
        } catch (err) {
          console.error('failed to apply guest action', err);
        }
        // Always consume the request (good or bad) to keep the queue moving.
        await consumeActionRequest(code, next).catch(() => undefined);
      } finally {
        busyRef.current = false;
      }
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [role, code, round, seating, dispatch]);
}
