/**
 * Hook that drives NPC turns. When the current player is a bot, the hook
 * waits a randomized "think" delay and then dispatches the chosen action.
 *
 * Guards against stale dispatches when the round changes or the component
 * unmounts mid-think.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { chooseAction, chooseBotAceValues } from './ai/botPolicy';
import { selectStatsWeight } from '../stats/statsSlice';
import {
  selectPlayCurrentPlayerId,
  selectPlayHumanId,
  selectPlayMode,
  selectPlayRound,
  selectPlayCurrentRoundEvents,
  selectAwaitingAceChoices,
  selectPlayersWithAces,
  setThinking,
  submitAction,
  submitAceChoices,
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
  const currentRoundEvents = useAppSelector(selectPlayCurrentRoundEvents);

  const awaitingAceChoices = useAppSelector(selectAwaitingAceChoices);
  const playersWithAces = useAppSelector(selectPlayersWithAces);

  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(0);
  const aceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          visibleRoundEvents: currentRoundEvents,
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
  }, [round, currentId, humanId, mode, difficulty, totals, history, statWeights, currentRoundEvents, dispatch]);

  // --- Bot ace-value submission after round end ---
  useEffect(() => {
    if (aceTimerRef.current) {
      clearTimeout(aceTimerRef.current);
      aceTimerRef.current = null;
    }
    if (!awaitingAceChoices || mode !== 'ai' || !round) return;

    // Determine caller info for the strategy function.
    const callerId = round.callerId;
    if (!callerId) return;
    const callerPts = round.players
      .find((p) => p.id === callerId)
      ?.hand.reduce((s, c) => s + (c.rank === 'A' ? 1 : c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' ? 10 : Number(c.rank)), 0) ?? 0;
    const owners = round.players
      .filter((p) => p.id !== callerId && p.hand.reduce((s, c) => s + (c.rank === 'A' ? 1 : c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' ? 10 : Number(c.rank)), 0) < callerPts)
      .map((p) => p.id);
    const callerWon = owners.length === 0;

    // Submit choices for each bot that has aces with a staggered delay.
    const botIds = playersWithAces.filter((id) => id !== humanId);
    if (botIds.length === 0) return;

    aceTimerRef.current = setTimeout(() => {
      for (const botId of botIds) {
        const bot = round.players.find((p) => p.id === botId);
        if (!bot) continue;
        const choices = chooseBotAceValues(
          bot.hand,
          botId,
          totals[botId] ?? 0,
          callerWon,
          callerId,
          owners.includes(botId),
        );
        dispatch(submitAceChoices({ playerId: botId, choices }));
      }
    }, 600);

    return () => {
      if (aceTimerRef.current) {
        clearTimeout(aceTimerRef.current);
        aceTimerRef.current = null;
      }
    };
  }, [awaitingAceChoices, playersWithAces, mode, round, humanId, totals, dispatch]);
}
