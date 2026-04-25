/**
 * Compute a single-player Play-mode `GameStatsEntry` for the human player at
 * the end of a finished game. Used by `usePlayGameEnd` to persist Play stats
 * to Firestore when the user is logged in.
 *
 * - statCounts: aggregate stat events across all rounds (e.g. Kill, Yasat).
 * - longestStreak: longest consecutive-yasat streak the human achieved.
 * - weightedScore: their final weighted score for the game.
 * - won: true when this human is the determined winner.
 */
import type { GameStatsEntry } from '../identity/playerService';
import type { statWeight } from '../stats/statsSlice';
import type { PlayerId } from './engine/round';
import type { StoredRoundResult } from './playSlice';
import { EVENT_TO_STAT_NAME } from './eventLabels';
import { computePlayWeightedScores } from './weightedScore';

export interface ComputePlayGameResultArgs {
  username: string;
  humanId: PlayerId;
  history: StoredRoundResult[];
  seating: PlayerId[];
  weights: statWeight[];
  /** id of the determined winner */
  winnerId: PlayerId;
}

export function computePlayGameResult(
  args: ComputePlayGameResultArgs,
): GameStatsEntry {
  const { username, humanId, history, seating, weights, winnerId } = args;

  // Per-stat counts for the human across all rounds.
  const statCounts: Record<string, number> = {};
  let runningStreak = 0;
  let longestStreak = 0;

  for (const round of history) {
    const per = round.perPlayer.find((p) => p.playerId === humanId);
    const events = per?.events ?? [];

    let hadYasat = false;
    for (const e of events) {
      const name = EVENT_TO_STAT_NAME[e];
      if (!name) continue;
      statCounts[name] = (statCounts[name] ?? 0) + 1;
      if (e === 'yasat') hadYasat = true;
    }

    runningStreak = hadYasat ? runningStreak + 1 : 0;
    if (runningStreak > longestStreak) longestStreak = runningStreak;
  }

  const weightedById = computePlayWeightedScores(history, seating, weights);
  const weightedScore = weightedById[humanId] ?? 0;

  return {
    username,
    longestStreak,
    weightedScore,
    won: winnerId === humanId,
    statCounts,
  };
}
