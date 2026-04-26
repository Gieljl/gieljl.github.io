/**
 * Core card primitives for the Yasat play engine.
 *
 * This module is intentionally pure and framework-free so it can be
 * unit-tested in isolation and later reused by an authoritative online host.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** Rank codes — 'A', '2'..'10', 'J', 'Q', 'K'. */
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  /** Stable identifier of the form "suit-rank" (unique within a deck). */
  id: string;
  suit: Suit;
  rank: Rank;
}

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

/** True if the card is red (hearts or diamonds). */
export function isRed(card: Card): boolean {
  return card.suit === 'hearts' || card.suit === 'diamonds';
}

/** Returns the "color group" used for same-color straight validation. */
export function colorOf(card: Card): 'red' | 'black' {
  return isRed(card) ? 'red' : 'black';
}

/**
 * Ordinal index used for straight detection. Ace has no fixed ordinal — callers
 * must handle the wrap cases (A-2-3 and Q-K-A) explicitly.
 */
export function rankOrdinal(rank: Rank): number {
  switch (rank) {
    case 'A':
      return 1;
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    default:
      return Number(rank);
  }
}

/**
 * Point value of a card in Yasat hand-scoring.
 *
 * Ace is 1 by default; callers may pass `aceAs: 11` when they want to evaluate
 * the alternate aces-count-as-11 line (used for hitting exactly 50/100).
 */
export function cardValue(card: Card, aceAs: 1 | 11 = 1): number {
  if (card.rank === 'A') return aceAs;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

/** Sum hand points with all aces counted as 1. */
export function handPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c, 1), 0);
}

/**
 * Sum hand points using per-ace overrides.
 *
 * @param aceChoices  Map of cardId → 1 | 11 for aces the player chose as 11.
 *                    Aces not in the map default to 1.
 */
export function handPointsWithChoices(
  cards: readonly Card[],
  aceChoices: Record<string, 1 | 11>,
): number {
  return cards.reduce((sum, c) => {
    if (c.rank === 'A') return sum + (aceChoices[c.id] ?? 1);
    return sum + cardValue(c, 1);
  }, 0);
}

/** Builds a fresh, ordered 52-card deck. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

/**
 * Deterministic shuffle. If `seed` is provided, the result is reproducible
 * (required for the engine to be deterministic for tests and future replays).
 */
export function shuffle<T>(input: readonly T[], seed?: number): T[] {
  const arr = input.slice();
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Small, fast seeded PRNG (public domain). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
