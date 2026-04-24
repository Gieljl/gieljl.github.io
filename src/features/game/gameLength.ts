/**
 * Shared game-length configuration used across ranked, unranked, and play.
 */

export type GameLength = 'bo10' | 'firstTo10' | 'classic';

export interface GameLengthOption {
  value: GameLength;
  label: string;
  description: string;
}

export const GAME_LENGTH_OPTIONS: readonly GameLengthOption[] = [
  {
    value: 'bo10',
    label: 'Best of 10',
    description: 'Game ends after 10 hands. Highest weighted score wins.',
  },
  {
    value: 'firstTo10',
    label: 'First to 10',
    description: 'Game ends when a player reaches a weighted score of 10.',
  },
  {
    value: 'classic',
    label: 'Classic',
    description: 'Infinite play. End the game manually from the menu.',
  },
];

export const GAME_LENGTH_DESCRIPTION: Record<GameLength, string> =
  GAME_LENGTH_OPTIONS.reduce(
    (acc, opt) => ({ ...acc, [opt.value]: opt.description }),
    {} as Record<GameLength, string>,
  );

/**
 * Pure check of whether the configured game-length condition is currently met.
 *
 * @param length          configured game length
 * @param roundsPlayed    completed rounds (excluding any in-progress round)
 * @param highestWeighted highest weighted score across all players
 */
export function isGameLengthMet(
  length: GameLength,
  roundsPlayed: number,
  highestWeighted: number,
): boolean {
  switch (length) {
    case 'bo10':
      return roundsPlayed >= 10;
    case 'firstTo10':
      return highestWeighted >= 10;
    case 'classic':
    default:
      return false;
  }
}
