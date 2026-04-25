/**
 * Hook that drives NPC turns. When the current player is a bot, the hook
 * waits a randomized "think" delay and then dispatches the chosen action.
 *
 * Guards against stale dispatches when the round changes or the component
 * unmounts mid-think.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { chooseAction } from './ai/botPolicy';
import { selectStatsWeight } from '../stats/statsSlice';
import {
  selectPlayCurrentPlayerId,
  selectPlayHumanId,
  selectPlayMode,
  selectPlayRound,
  setThinking,
  submitAction,
} from './playSlice';

const MIN_DELAY_MS = 1200;
const MAX_DELAY_MS = 1700;

export function useBotDriver(): void {
  const dispatch = useAppDispatch();
  const round = useAppSelector(selectPlayRound);
  const humanId = useAppSelector(selectPlayHumanId);
  const currentId = useAppSelector(selectPlayCurrentPlayerId);
  const mode = useAppSelector(selectPlayMode);
  const difficulty = useAppSelector((s) => s.play.difficulty);
  const totals = useAppSelector((s) => s.play.cumulativeTotals);
  const history = useAppSelector((s) => s.play.roundHistory);
  const statWeights = useAppSelector(selectStatsWeight);

  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    // Clean up any pending think when inputs change.
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    tokenRef.current += 1;

    if (!round || round.phase !== 'in-progress') {
      dispatch(setThinking(null));
      return;
    }
    if (mode !== 'ai') {
      dispatch(setThinking(null));
      return;
    }
    if (!currentId || currentId === humanId) {
      dispatch(setThinking(null));
      return;
    }

    const myToken = tokenRef.current;
    dispatch(setThinking(currentId));
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    pendingTimer.current = setTimeout(() => {
      if (myToken !== tokenRef.current) return; // stale
      try {
        const action = chooseAction(round, currentId, difficulty, {
          totalsBefore: totals,
          statWeights,
          roundHistory: history,
        });
        dispatch(submitAction(action));
      } catch {
        // Swallow — a fresh effect will re-drive the state.
      } finally {
        dispatch(setThinking(null));
      }
    }, delay);

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };
  }, [round, currentId, humanId, mode, difficulty, totals, history, statWeights, dispatch]);
}
