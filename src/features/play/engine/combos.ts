/**
 * Combination validators for discards and draw-from-discard rules.
 */
import { Card, colorOf, rankOrdinal } from './cards';

function sameRank(cards: readonly Card[]): boolean {
  return cards.every((c) => c.rank === cards[0].rank);
}

export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && sameRank(cards);
}

export function isThreeOfAKind(cards: readonly Card[]): boolean {
  return cards.length === 3 && sameRank(cards);
}

export function isFourOfAKind(cards: readonly Card[]): boolean {
  return cards.length === 4 && sameRank(cards);
}

export function isOfAKind(cards: readonly Card[]): boolean {
  return cards.length >= 2 && sameRank(cards);
}

/**
 * Straight validator.
 *
 * Rules (mirroring RulesText.tsx):
 * - At least 3 cards.
 * - All of the same color (red or black).
 * - Consecutive ranks. Ace may wrap: A-2-3 (low) or Q-K-A (high).
 */
export function isStraight(cards: readonly Card[]): boolean {
  if (cards.length < 3) return false;
  const color = colorOf(cards[0]);
  if (!cards.every((c) => colorOf(c) === color)) return false;

  const hasAce = cards.some((c) => c.rank === 'A');
  const nonAces = cards.filter((c) => c.rank !== 'A');
  const ordsNoAce = nonAces.map((c) => rankOrdinal(c.rank)).sort((a, b) => a - b);
  // reject duplicate ranks
  for (let i = 1; i < ordsNoAce.length; i++) {
    if (ordsNoAce[i] === ordsNoAce[i - 1]) return false;
  }

  if (!hasAce) {
    return isConsecutive(ordsNoAce);
  }

  // Try ace = 1 (low) and ace = 14 (high). With both options, duplicates in
  // ordinals would already have been rejected (two aces cannot both fit a
  // same-color straight because same-color aces cannot coexist in one suit
  // pair, but defensive check anyway).
  const aceCount = cards.length - nonAces.length;
  if (aceCount >= 2) return false; // can't use two aces in one straight
  return (
    isConsecutive([1, ...ordsNoAce].sort((a, b) => a - b)) ||
    isConsecutive([...ordsNoAce, 14].sort((a, b) => a - b))
  );
}

function isConsecutive(sortedOrds: readonly number[]): boolean {
  for (let i = 1; i < sortedOrds.length; i++) {
    if (sortedOrds[i] !== sortedOrds[i - 1] + 1) return false;
  }
  return true;
}

export type DiscardShape =
  | 'single'
  | 'pair'
  | 'three-of-a-kind'
  | 'four-of-a-kind'
  | 'straight';

/** Classifies a valid discard, or returns null if the set is not a legal discard. */
export function classifyDiscard(cards: readonly Card[]): DiscardShape | null {
  if (cards.length === 1) return 'single';
  if (isPair(cards)) return 'pair';
  if (isThreeOfAKind(cards)) return 'three-of-a-kind';
  if (isFourOfAKind(cards)) return 'four-of-a-kind';
  if (isStraight(cards)) return 'straight';
  return null;
}

export function isValidDiscard(cards: readonly Card[]): boolean {
  return classifyDiscard(cards) !== null;
}

/**
 * Given the cards most recently placed on the discard pile, return which of
 * those cards the *next* player is allowed to draw from the open pile.
 *
 * Rules:
 * - Single card: that one card.
 * - Of-a-kind (pair / 3 / 4): any one of the cards.
 * - Straight: only the two edge cards (lowest-ordinal and highest-ordinal,
 *   accounting for ace wrap).
 */
export function pickableFromDiscard(lastDiscard: readonly Card[]): Card[] {
  const shape = classifyDiscard(lastDiscard);
  if (!shape) return [];
  if (shape === 'single' || shape === 'pair' || shape === 'three-of-a-kind' || shape === 'four-of-a-kind') {
    return lastDiscard.slice();
  }
  // straight — pick edge cards
  return straightEdges(lastDiscard);
}

function straightEdges(cards: readonly Card[]): Card[] {
  if (cards.length < 2) return cards.slice();
  const hasAce = cards.some((c) => c.rank === 'A');
  const nonAces = cards.filter((c) => c.rank !== 'A');
  const sortedNonAce = [...nonAces].sort((a, b) => rankOrdinal(a.rank) - rankOrdinal(b.rank));
  if (!hasAce) {
    return [sortedNonAce[0], sortedNonAce[sortedNonAce.length - 1]];
  }
  const ace = cards.find((c) => c.rank === 'A')!;
  if (sortedNonAce.length === 0) return [ace];
  const lowOrd = rankOrdinal(sortedNonAce[0].rank);
  const highOrd = rankOrdinal(sortedNonAce[sortedNonAce.length - 1].rank);
  // Ace is low if the sequence starts at 2 (i.e. low end is 2), else high.
  if (lowOrd === 2) {
    // ace-low: edges are ace and highest
    return [ace, sortedNonAce[sortedNonAce.length - 1]];
  }
  if (highOrd === 13) {
    // ace-high: edges are lowest and ace
    return [sortedNonAce[0], ace];
  }
  // fallback (shouldn't happen for valid straights)
  return [sortedNonAce[0], sortedNonAce[sortedNonAce.length - 1]];
}
