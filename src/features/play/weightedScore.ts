/**
 * Computes per-player weighted scores from Play history using the same stat
 * weights as Ranked/Unranked games. Mirrors the logic in `PlayerRanking` /
 * `PlayPlayerRanking` so `PlayTable` shows identical numbers.
 */
import type { statWeight } from '../stats/statsSlice';
import type { PlayerId } from './engine/round';
import type { RoundStatEvent } from './engine/scoring';
import type { StoredRoundResult } from './playSlice';
import { EVENT_TO_STAT_NAME } from './eventLabels';

/**
 * Returns `{ [playerId]: weightedScore }` for every player in `allPlayerIds`,
 * applying:
 *  - sum of (count × weight) for every event that maps to a weighted stat
 *  - a single "Longest Streak" bonus, awarded to the player who first reaches
 *    the highest yasat streak (> 1) across the whole game
 */
export function computePlayWeightedScores(
  history: readonly StoredRoundResult[],
  allPlayerIds: readonly PlayerId[],
  weights: readonly statWeight[],
): Record<PlayerId, number> {
  const weightByName = new Map<string, number>();
  for (const w of weights) weightByName.set(w.statName, w.weight);

  const scores: Record<PlayerId, number> = {};
  const runningStreak: Record<PlayerId, number> = {};
  const longestStreak: Record<PlayerId, number> = {};
  for (const id of allPlayerIds) {
    scores[id] = 0;
    runningStreak[id] = 0;
    longestStreak[id] = 0;
  }

  // Track the first player to reach each streak length (for tie-break).
  let bestStreak = 1;
  let longestOwner: PlayerId | null = null;

  for (const r of history) {
    const seenThisRound: Record<PlayerId, boolean> = {};
    for (const per of r.perPlayer) {
      const events = per.events as RoundStatEvent[];
      const hasYasat = events.includes('yasat');
      runningStreak[per.playerId] = hasYasat
        ? (runningStreak[per.playerId] ?? 0) + 1
        : 0;
      if (runningStreak[per.playerId] > (longestStreak[per.playerId] ?? 0)) {
        longestStreak[per.playerId] = runningStreak[per.playerId];
      }
      if (runningStreak[per.playerId] > bestStreak) {
        bestStreak = runningStreak[per.playerId];
        longestOwner = per.playerId;
      }
      seenThisRound[per.playerId] = true;

      for (const ev of events) {
        const name = EVENT_TO_STAT_NAME[ev];
        if (!name) continue;
        const w = weightByName.get(name);
        if (typeof w === 'number') {
          scores[per.playerId] = (scores[per.playerId] ?? 0) + w;
        }
      }
    }
    // Any player not listed for this round resets their running streak.
    for (const pid of allPlayerIds) {
      if (!seenThisRound[pid]) runningStreak[pid] = 0;
    }
  }

  // Apply longest-streak bonus once, to the owner.
  const longestWeight = weightByName.get('Longest Streak') ?? 0;
  if (longestOwner !== null && longestWeight) {
    scores[longestOwner] = (scores[longestOwner] ?? 0) + longestWeight;
  }

  return scores;
}
