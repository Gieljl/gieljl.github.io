import { player } from '../players/playersSlice';
import { ScoreState } from './scoreSlice';
import { statWeight } from '../stats/statsSlice';
import { GameStatsEntry } from '../identity/playerService';

export interface PlayerGameResult {
  player: player;
  /** Per-stat counts for this game, keyed by stat name. */
  statCounts: Record<string, number>;
  /** Best yasat streak achieved in this game. */
  longestStreak: number;
  weightedScore: number;
  won: boolean;
}

/**
 * Count occurrences of a named stat for a player across all rounds.
 */
const countStat = (
  playerId: number,
  statName: string,
  rounds: ScoreState[]
): number =>
  rounds.reduce((total, round) => {
    const pr = round.playerscores.find((p) => p.id === playerId);
    return (
      total +
      (pr ? pr.stats.filter((s) => s.name === statName).length : 0)
    );
  }, 0);

const longestStreak = (
  playerId: number,
  rounds: ScoreState[]
): number =>
  rounds.reduce((longest, round) => {
    const pr = round.playerscores.find((p) => p.id === playerId);
    return pr ? Math.max(longest, pr.yasatStreak) : longest;
  }, 0);

const longestStreakOfGame = (rounds: ScoreState[]): number =>
  rounds.reduce(
    (longest, round) =>
      Math.max(longest, Math.max(...round.playerscores.map((p) => p.yasatStreak), 0)),
    0
  );

/**
 * Compute per-player results and weighted scores for a finished ranked game.
 * Returns the list sorted by weightedScore desc, with `won` set on the leader.
 */
export function computeRankedGameResults(
  players: player[],
  rounds: ScoreState[],
  weights: statWeight[]
): PlayerGameResult[] {
  const gameLongestStreak = longestStreakOfGame(rounds);

  const results: PlayerGameResult[] = players.map((p) => {
    const statCounts: Record<string, number> = {};
    let weightedScore = 0;

    weights.forEach((w) => {
      if (w.statName === 'Longest Streak') {
        const streak = longestStreak(p.id, rounds);
        if (streak > 1 && streak === gameLongestStreak) {
          weightedScore += w.weight;
        }
      } else {
        const count = countStat(p.id, w.statName, rounds);
        if (count > 0) statCounts[w.statName] = count;
        weightedScore += count * w.weight;
      }
    });

    return {
      player: p,
      statCounts,
      longestStreak: longestStreak(p.id, rounds),
      weightedScore,
      won: false,
    };
  });

  results.sort((a, b) => b.weightedScore - a.weightedScore);
  if (results.length > 0) results[0].won = true;
  return results;
}

export function resultsToStatsEntries(
  results: PlayerGameResult[]
): GameStatsEntry[] {
  return results
    .filter((r) => r.player.username)
    .map((r) => ({
      username: r.player.username!,
      statCounts: r.statCounts,
      longestStreak: r.longestStreak,
      weightedScore: r.weightedScore,
      won: r.won,
    }));
}
