import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectSessionCode, selectSessionRole, clearSession } from './sessionSlice';
import { subscribeToSession, SessionDocument } from './sessionService';
import { resetScores } from '../game/scoreSlice';
import { resetPlayers } from '../players/playersSlice';
import { goHome } from '../game/gameSlice';
import { ActionCreators } from 'redux-undo';
import { enqueueSnackbar } from 'notistack';
import { HYDRATE_FROM_SESSION } from '../../app/store';

/**
 * Hook that runs on viewer devices. Subscribes to the Firestore session
 * document and overwrites local Redux state whenever the host pushes updates.
 *
 * Dispatches a single HYDRATE_FROM_SESSION action that the root reducer
 * intercepts to replace players, scores (with full undo history), stats,
 * and game state in one shot.
 */
export function useSessionSubscription() {
  const dispatch = useAppDispatch();
  const role = useAppSelector(selectSessionRole);
  const sessionCode = useAppSelector(selectSessionCode);

  useEffect(() => {
    if (role !== 'viewer' || !sessionCode) return;

    const unsubscribe = subscribeToSession(sessionCode, (data: SessionDocument | null) => {
      if (!data) {
        // Session deleted — host ended the game
        enqueueSnackbar('The host ended the game.', { variant: 'info' });
        dispatch(clearSession());
        dispatch(goHome());
        dispatch(resetPlayers());
        dispatch(resetScores());
        dispatch(ActionCreators.clearHistory());
        return;
      }

      dispatch({
        type: HYDRATE_FROM_SESSION,
        payload: {
          players: data.players,
          scores: data.scores,
          stats: data.stats,
          game: data.game,
        },
      });
    });

    return () => unsubscribe();
  }, [role, sessionCode, dispatch]);
}
