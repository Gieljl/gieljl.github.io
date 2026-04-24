/**
 * Watches a Play game's progress and triggers the game-end transition once
 * the configured `length` threshold is met:
 *  - switches view to the stats view (`new`)
 *  - shows a snackbar announcing the winner + final weighted score
 *  - sets `play.gameOver = true` (does NOT clear state, so users can keep
 *    browsing stats until they explicitly return to home)
 *
 * Mount this hook in any component rendered while a play game is "started"
 * (currently `PlayTable` and `PlayPlayerRanking`). A ref guard ensures the
 * transition fires only once per game.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { setGameView } from '../game/gameSlice';
import { isGameLengthMet } from '../game/gameLength';
import { selectStatsWeight } from '../stats/statsSlice';
import {
  markGameOver,
  selectPlayGameOver,
  selectPlayLength,
  selectPlayNames,
  selectPlayTotals,
} from './playSlice';
import { computePlayWeightedScores } from './weightedScore';
import type { RootState } from '../../app/store';
import { enqueueSnackbar } from 'notistack';

export function usePlayGameEnd(): void {
  const dispatch = useAppDispatch();
  const gameOver = useAppSelector(selectPlayGameOver);
  const length = useAppSelector(selectPlayLength);
  const totals = useAppSelector(selectPlayTotals);
  const names = useAppSelector(selectPlayNames);
  const seating = useAppSelector((s: RootState) => s.play.seating);
  const history = useAppSelector((s: RootState) => s.play.roundHistory);
  const round = useAppSelector((s: RootState) => s.play.round);
  const weights = useAppSelector(selectStatsWeight);
  const triggeredRef = useRef(false);

  useEffect(() => {
    // Reset the latch when a new game starts (no history yet & not over).
    if (!gameOver && history.length === 0) {
      triggeredRef.current = false;
    }
  }, [gameOver, history.length]);

  useEffect(() => {
    if (gameOver) return;
    if (triggeredRef.current) return;
    if (!seating.length) return;

    const weighted = computePlayWeightedScores(history, seating, weights);
    const highest = seating.reduce(
      (best, id) => Math.max(best, weighted[id] ?? 0),
      0,
    );
    const reached = isGameLengthMet(length, history.length, highest);

    // Only trigger after the round has been fully scored to avoid firing
    // mid-turn. For 'firstTo10' / 'bo10' both rely on completed rounds.
    if (!reached) return;

    // Determine winner: highest weighted score, ties broken by lowest cumulative.
    let winnerId = seating[0];
    for (const id of seating) {
      const wScore = weighted[id] ?? 0;
      const wBest = weighted[winnerId] ?? 0;
      if (wScore > wBest) {
        winnerId = id;
      } else if (wScore === wBest) {
        const tCur = totals[id] ?? 0;
        const tBest = totals[winnerId] ?? 0;
        if (tCur < tBest) winnerId = id;
      }
    }

    triggeredRef.current = true;
    dispatch(markGameOver());
    dispatch(setGameView('new'));

    const winnerName = names[winnerId] ?? 'Winner';
    const winnerScore = weighted[winnerId] ?? 0;
    enqueueSnackbar(
      `Game over! Winner: ${winnerName} \u2014 final score ${winnerScore}.`,
      { variant: 'success', autoHideDuration: 6000 },
    );
  }, [
    gameOver,
    length,
    history,
    seating,
    weights,
    totals,
    names,
    dispatch,
    round,
  ]);
}

export default usePlayGameEnd;
