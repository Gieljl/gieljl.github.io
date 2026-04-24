/**
 * NPC policy for Yasat play.
 *
 * Pure function: given a RoundState and a bot player id, returns the action
 * the bot should take. Deliberately heuristic and deterministic (no RNG) so
 * behavior is reproducible in tests.
 */
import { Card, handPoints, cardValue } from '../engine/cards';
import {
  classifyDiscard,
  isFourOfAKind,
  isPair,
  isStraight,
  isThreeOfAKind,
  pickableFromDiscard,
} from '../engine/combos';
import { PlayAction, RoundState } from '../engine/round';

export type Difficulty = 'easy' | 'normal';

interface DiscardCandidate {
  cards: Card[];
  shape: NonNullable<ReturnType<typeof classifyDiscard>>;
  value: number;
}

/** Main entry: choose the bot's action. */
export function chooseAction(
  state: RoundState,
  botId: string,
  difficulty: Difficulty = 'normal',
): PlayAction {
  const me = state.players.find((p) => p.id === botId);
  if (!me) throw new Error('Bot not in state');
  if (state.players[state.currentPlayerIndex].id !== botId) {
    throw new Error('Not this bot turn');
  }

  // 1. Start-of-turn Yasat check.
  const myPoints = handPoints(me.hand);
  if (myPoints <= 7 && shouldDeclareYasat(state, botId, difficulty)) {
    return { type: 'declareYasat' };
  }

  // 2. Build candidate discards and pick the highest-value one.
  const candidates = enumerateDiscards(me.hand);
  // Always fall back to discarding the single highest card.
  const chosen = pickBestDiscard(candidates, me.hand);

  // 3. Choose draw source.
  const drawFrom = chooseDraw(state, me.hand, chosen.cards);

  return {
    type: 'discardThenDraw',
    discard: chosen.cards,
    drawFrom,
  };
}

function shouldDeclareYasat(state: RoundState, botId: string, difficulty: Difficulty): boolean {
  const me = state.players.find((p) => p.id === botId)!;
  const myPts = handPoints(me.hand);
  // Opponents' card counts: more cards → higher chance we're ahead.
  const opponents = state.players.filter((p) => p.id !== botId);
  // Rough "safe" thresholds:
  // - easy: call at ≤ 7 whenever possible
  // - normal: call when we have ≤ 4, OR ≤ 7 and at least one opponent holds ≥ 3 cards
  if (difficulty === 'easy') return true;
  if (myPts <= 4) return true;
  return opponents.some((o) => o.hand.length >= 3);
}

function enumerateDiscards(hand: readonly Card[]): DiscardCandidate[] {
  const out: DiscardCandidate[] = [];

  // Groups by rank for of-a-kind detection.
  const byRank = new Map<string, Card[]>();
  for (const c of hand) {
    const list = byRank.get(c.rank) ?? [];
    list.push(c);
    byRank.set(c.rank, list);
  }
  for (const group of Array.from(byRank.values())) {
    if (group.length === 4 && isFourOfAKind(group)) {
      out.push({ cards: group, shape: 'four-of-a-kind', value: sum(group) });
    }
    if (group.length >= 3) {
      // all triples
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          for (let k = j + 1; k < group.length; k++) {
            const trio = [group[i], group[j], group[k]];
            if (isThreeOfAKind(trio)) {
              out.push({ cards: trio, shape: 'three-of-a-kind', value: sum(trio) });
            }
          }
        }
      }
    }
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const pair = [group[i], group[j]];
          if (isPair(pair)) {
            out.push({ cards: pair, shape: 'pair', value: sum(pair) });
          }
        }
      }
    }
  }

  // Straights — brute force over all subsets of size 3..hand.length with same color.
  const reds = hand.filter((c) => c.suit === 'hearts' || c.suit === 'diamonds');
  const blacks = hand.filter((c) => c.suit === 'spades' || c.suit === 'clubs');
  for (const pool of [reds, blacks]) {
    const subs = subsetsAtLeast(pool, 3);
    for (const sub of subs) {
      if (isStraight(sub)) {
        out.push({ cards: sub, shape: 'straight', value: sum(sub) });
      }
    }
  }

  return out;
}

function subsetsAtLeast<T>(items: readonly T[], minSize: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let cnt = 0;
    const sub: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        cnt++;
        sub.push(items[i]);
      }
    }
    if (cnt >= minSize) out.push(sub);
  }
  return out;
}

function sum(cards: readonly Card[]): number {
  return cards.reduce((s, c) => s + cardValue(c, 1), 0);
}

function pickBestDiscard(
  candidates: DiscardCandidate[],
  hand: readonly Card[],
): { cards: Card[]; shape: NonNullable<ReturnType<typeof classifyDiscard>> } {
  // Shape preference weights ensure we prefer bigger removals first.
  const shapeWeight: Record<string, number> = {
    'four-of-a-kind': 1000,
    'three-of-a-kind': 500,
    straight: 250,
    pair: 100,
    single: 0,
  };

  let best: DiscardCandidate | null = null;
  for (const c of candidates) {
    const score = shapeWeight[c.shape] + c.value + c.cards.length * 0.1;
    const bestScore = best ? shapeWeight[best.shape] + best.value + best.cards.length * 0.1 : -Infinity;
    if (score > bestScore) best = c;
  }
  if (best) return { cards: best.cards, shape: best.shape };

  // Fallback: discard the single highest card.
  const sorted = [...hand].sort((a, b) => cardValue(b, 1) - cardValue(a, 1));
  return { cards: [sorted[0]], shape: 'single' };
}

function chooseDraw(
  state: RoundState,
  hand: readonly Card[],
  discarding: readonly Card[],
): 'deck' | { fromDiscardId: string } {
  const topPly = state.discardPlies[state.discardPlies.length - 1] ?? [];
  const pickable = pickableFromDiscard(topPly);
  // Simulate hand after discard (before draw).
  const discardIds = new Set(discarding.map((c) => c.id));
  const remaining = hand.filter((c) => !discardIds.has(c.id));

  let bestPick: Card | null = null;
  let bestScore = -Infinity;
  for (const cand of pickable) {
    const candValue = cardValue(cand, 1);
    // Good: makes a pair with something in remaining
    const makesPair = remaining.some((r) => r.rank === cand.rank);
    // Good: low point card (≤ 3)
    const isLow = candValue <= 3;
    if (!makesPair && !isLow) continue;
    const score = (makesPair ? 50 : 0) + (isLow ? 10 : 0) - candValue;
    if (score > bestScore) {
      bestScore = score;
      bestPick = cand;
    }
  }
  if (bestPick) return { fromDiscardId: bestPick.id };
  return 'deck';
}
