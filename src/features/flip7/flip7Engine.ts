/**
 * Flip 7 score-keeping engine.
 *
 * The rulebook scoring per round (per player):
 *   round = 0                                          if the player busted
 *   round = (sum_of_number_cards * (x2 ? 2 : 1))
 *           + sum_of_added_modifiers (+2 / +4 / +6 / +8 / +10)
 *           + (flip7 ? 15 : 0)                         otherwise
 *
 * x2 doubles only the number-card sum, NOT the added-modifier cards
 * (per the rulebook: "The x2 does not double the points gained from
 *  other Modifier cards.").
 *
 * The first player to 200 points at the end of a round wins.
 */

export type ModifierBonus = 2 | 4 | 6 | 8 | 10;

export const MODIFIER_BONUSES: readonly ModifierBonus[] = [2, 4, 6, 8, 10];

export interface Flip7RoundEntry {
  /** Sum of the player's face-up number cards (0..78). Ignored if busted. */
  numberSum: number;
  /** Which +N modifier cards the player held this round. */
  modifiers: ModifierBonus[];
  /** Whether the x2 multiplier card was held. */
  doubled: boolean;
  /** Whether the player completed Flip 7 (seven number cards). */
  flip7: boolean;
  /** Whether the player busted (round score is 0). */
  busted: boolean;
}

export interface Flip7Player {
  id: string;
  name: string;
}

export interface Flip7State {
  players: Flip7Player[];
  /** rounds[r][playerId] = entry */
  rounds: Record<string, Flip7RoundEntry>[];
  targetScore: number;
}

export function makeEmptyEntry(): Flip7RoundEntry {
  return {
    numberSum: 0,
    modifiers: [],
    doubled: false,
    flip7: false,
    busted: false,
  };
}

export function entryScore(entry: Flip7RoundEntry): number {
  if (entry.busted) return 0;
  const base = entry.numberSum * (entry.doubled ? 2 : 1);
  const mods = entry.modifiers.reduce((acc, m) => acc + m, 0);
  const flip7Bonus = entry.flip7 ? 15 : 0;
  return base + mods + flip7Bonus;
}

export function totalScore(state: Flip7State, playerId: string): number {
  return state.rounds.reduce(
    (acc, round) => acc + (round[playerId] ? entryScore(round[playerId]) : 0),
    0,
  );
}

export function leaderboard(
  state: Flip7State,
): Array<{ player: Flip7Player; total: number }> {
  return state.players
    .map((p) => ({ player: p, total: totalScore(state, p.id) }))
    .sort((a, b) => b.total - a.total);
}

export function isGameOver(state: Flip7State): boolean {
  return state.players.some((p) => totalScore(state, p.id) >= state.targetScore);
}

export function winners(state: Flip7State): Flip7Player[] {
  if (!isGameOver(state)) return [];
  const board = leaderboard(state);
  const top = board[0]?.total ?? 0;
  return board.filter((row) => row.total === top).map((row) => row.player);
}

export function newGame(
  players: Flip7Player[],
  targetScore = 200,
): Flip7State {
  return { players, rounds: [], targetScore };
}
