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
import { scoreRound, type RoundStatEvent } from '../engine/scoring';
import type { PlayerId, PlayAction, RoundEvent, RoundState } from '../engine/round';
import { EVENT_TO_STAT_NAME } from '../eventLabels';

export type Difficulty = 'easy' | 'normal' | 'godlike';

export interface BotPolicyContext {
  /** Tournament totals before this action (used for round scoring simulation). */
  totalsBefore?: Record<PlayerId, number>;
  /** Dynamic stat weights configured in stats view. */
  statWeights?: Array<{ statName: string; weight: number }>;
  /** Past round events for streak-bonus projection. */
  roundHistory?: Array<{
    perPlayer: Array<{ playerId: PlayerId; events: RoundStatEvent[] }>;
  }>;
  /** Publicly visible action history for the current round. */
  visibleRoundEvents?: RoundEvent[];
}

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
  context: BotPolicyContext = {},
): PlayAction {
  const me = state.players.find((p) => p.id === botId);
  if (!me) throw new Error('Bot not in state');
  if (state.players[state.currentPlayerIndex].id !== botId) {
    throw new Error('Not this bot turn');
  }

  // 1. Start-of-turn Yasat check.
  const myPoints = handPoints(me.hand);
  if (myPoints <= 7 && shouldDeclareYasat(state, botId, difficulty, context)) {
    return { type: 'declareYasat' };
  }

  if (difficulty === 'godlike') {
    const hard = chooseHardDiscardAndDraw(state, me.hand, context);
    return {
      type: 'discardThenDraw',
      discard: hard.cards,
      drawFrom: hard.drawFrom,
    };
  }

  // 2. Build candidate discards and pick the highest-value one.
  const candidates = enumerateDiscards(me.hand);
  const chosen = pickBestDiscard(candidates, me.hand, context);

  // 3. Choose draw source.
  const drawFrom = chooseDraw(state, me.hand, chosen.cards, context);

  return {
    type: 'discardThenDraw',
    discard: chosen.cards,
    drawFrom,
  };
}

function shouldDeclareYasat(
  state: RoundState,
  botId: string,
  difficulty: Difficulty,
  context: BotPolicyContext,
): boolean {
  const me = state.players.find((p) => p.id === botId)!;
  const myPts = handPoints(me.hand);

  // Godlike is intentionally omniscient: if we have full context, evaluate this
  // exact declare against weighted stats.
  if (difficulty === 'godlike') {
    const simulated = evaluateDeclareWeightedDelta(state, botId, context);
    if (simulated !== null) return simulated >= 0;
  }

  // Human-like heuristic: infer risk from visible actions + opponent card counts.
  const opponents = state.players.filter((p) => p.id !== botId);
  const lowHandRisk = estimateLowHandYasatRisk(
    myPts,
    botId,
    opponents,
    context.visibleRoundEvents ?? [],
  );
  // Rough "safe" thresholds:
  // - easy: mostly calls Yasat, only bails on very strong visible danger
  // - normal: more cautious on 1–2 card opponent scenarios
  // - godlike: stricter unless very low, prefers value-building turns
  if (difficulty === 'easy') {
    if (myPts <= 1) return true;
    if (myPts === 2) return lowHandRisk < 7;
    if (myPts <= 4) return lowHandRisk < 8;
    return true;
  }
  if (difficulty === 'godlike') {
    if (myPts <= 3) return true;
    if (myPts <= 5) return opponents.some((o) => o.hand.length >= 3);
    return false;
  }
  if (myPts <= 1) return true;
  if (myPts === 2) return lowHandRisk < 4;
  if (myPts === 3) return lowHandRisk < 5;
  if (myPts <= 4) return lowHandRisk < 6;
  if (lowHandRisk >= 4) return false;
  return opponents.some((o) => o.hand.length >= 3);
}

function estimateLowHandYasatRisk(
  myPts: number,
  botId: string,
  opponents: Array<{ id: string; hand: readonly Card[] }>,
  visibleEvents: RoundEvent[],
): number {
  const observedByOpponent = observedDiscardCardsByOpponent(botId, visibleEvents);
  let risk = 0;

  for (const opp of opponents) {
    if (opp.hand.length > 2) continue;

    const known = observedByOpponent.get(opp.id) ?? [];
    const knownPoints = known.reduce((sum, c) => sum + cardValue(c, 1), 0);
    const knownCount = Math.min(known.length, opp.hand.length);
    const unknownCount = Math.max(0, opp.hand.length - knownCount);
    const minPossible = knownPoints + unknownCount;

    let oppRisk = opp.hand.length === 1 ? 1 : 0;
    if (minPossible < myPts) {
      oppRisk += knownCount > 0 ? 3 : 1;
    }
    if (known.some((c) => c.rank === 'A') && myPts <= 3) oppRisk += 2;
    if (known.some((c) => c.rank === '2') && myPts <= 4) oppRisk += 1;
    if (known.some((c) => cardValue(c, 1) >= 10) && minPossible >= myPts) oppRisk -= 1;

    risk += Math.max(0, oppRisk);
  }

  return risk;
}

function observedDiscardCardsByOpponent(
  botId: string,
  visibleEvents: RoundEvent[],
): Map<string, Card[]> {
  const held = new Map<string, Card[]>();

  for (const ev of visibleEvents) {
    if (ev.type === 'drewFromDiscard') {
      if (ev.playerId === botId) continue;
      const list = held.get(ev.playerId) ?? [];
      list.push(ev.card);
      held.set(ev.playerId, list);
    }
    if (ev.type === 'discarded') {
      if (ev.playerId === botId) continue;
      const list = held.get(ev.playerId);
      if (!list || list.length === 0) continue;
      const discardedIds = new Set(ev.cards.map((c) => c.id));
      held.set(
        ev.playerId,
        list.filter((c) => !discardedIds.has(c.id)),
      );
    }
  }

  return held;
}

function chooseHardDiscardAndDraw(
  state: RoundState,
  hand: readonly Card[],
  context: BotPolicyContext,
): {
  cards: Card[];
  shape: NonNullable<ReturnType<typeof classifyDiscard>>;
  drawFrom: 'deck' | { fromDiscardId: string };
} {
  const candidates = getAllDiscardCandidates(enumerateDiscards(hand), hand);
  const shapeWeight: Record<string, number> = {
    'four-of-a-kind': 2,
    'three-of-a-kind': 1.5,
    straight: 1,
    pair: 0.5,
    single: 0,
  };

  let best: {
    cards: Card[];
    shape: NonNullable<ReturnType<typeof classifyDiscard>>;
    drawFrom: 'deck' | { fromDiscardId: string };
    score: number;
  } | null = null;

  for (const cand of candidates) {
    const discardIds = new Set(cand.cards.map((x) => x.id));
    const remaining = hand.filter((x) => !discardIds.has(x.id));
    const bestDraw = evaluateBestDrawOption(state, remaining, context);
    const score = bestDraw.score + cand.value * 0.2 + shapeWeight[cand.shape];
    if (!best || score > best.score) {
      best = {
        cards: cand.cards,
        shape: cand.shape,
        drawFrom: bestDraw.drawFrom,
        score,
      };
    }
  }

  if (!best) {
    const fallback = [...hand].sort((a, b) => cardValue(b, 1) - cardValue(a, 1))[0];
    return { cards: [fallback], shape: 'single', drawFrom: 'deck' };
  }

  return {
    cards: best.cards,
    shape: best.shape,
    drawFrom: best.drawFrom,
  };
}

function evaluateBestDrawOption(
  state: RoundState,
  remaining: readonly Card[],
  context: BotPolicyContext,
): { drawFrom: 'deck' | { fromDiscardId: string }; score: number } {
  const topPly = state.discardPlies[state.discardPlies.length - 1] ?? [];
  const pickable = pickableFromDiscard(topPly);

  let best: { drawFrom: 'deck' | { fromDiscardId: string }; score: number } | null = null;

  for (const cand of pickable) {
    const resulting = [...remaining, cand];
    const score = evaluateHandForStats(resulting, context) + drawSynergyBonus(remaining, cand);
    if (!best || score > best.score) {
      best = { drawFrom: { fromDiscardId: cand.id }, score };
    }
  }

  if (state.drawPile.length > 0) {
    const topDeck = state.drawPile[0];
    const deckScore =
      evaluateHandForStats([...remaining, topDeck], context) + drawSynergyBonus(remaining, topDeck);
    if (!best || deckScore >= best.score) {
      best = { drawFrom: 'deck', score: deckScore };
    }
  } else {
    const deckScore = estimateDeckDrawScore(remaining, context);
    if (!best || deckScore >= best.score) {
      best = { drawFrom: 'deck', score: deckScore };
    }
  }

  return best ?? { drawFrom: 'deck', score: -Infinity };
}

function getAllDiscardCandidates(
  candidates: DiscardCandidate[],
  hand: readonly Card[],
): DiscardCandidate[] {
  return [
    ...candidates,
    ...hand.map((c) => ({ cards: [c], shape: 'single' as const, value: cardValue(c, 1) })),
  ];
}

function evaluateDeclareWeightedDelta(
  state: RoundState,
  botId: string,
  context: BotPolicyContext,
): number | null {
  if (!context.totalsBefore || !context.statWeights) return null;

  const ended: RoundState = {
    ...state,
    phase: 'ended',
    callerId: botId,
  };

  let outcome;
  try {
    outcome = scoreRound({ state: ended, totalsBefore: context.totalsBefore });
  } catch {
    return null;
  }

  const mine = outcome.perPlayer.find((p) => p.playerId === botId);
  if (!mine) return null;

  const weightsByStat = new Map(context.statWeights.map((w) => [w.statName, w.weight]));
  let delta = 0;
  for (const ev of mine.events) {
    const statName = EVENT_TO_STAT_NAME[ev];
    delta += weightsByStat.get(statName) ?? 0;
  }

  // Project Longest Streak ownership change if this declare contributes a new
  // Yasat event. The weighted helper grants this bonus once to the first owner.
  const longestWeight = weightsByStat.get('Longest Streak') ?? 0;
  if (longestWeight !== 0 && context.roundHistory) {
    const beforeOwner = getLongestStreakOwnerFromHistory(context.roundHistory);
    const projectedRound = {
      perPlayer: outcome.perPlayer.map((p) => ({ playerId: p.playerId, events: p.events })),
    };
    const afterOwner = getLongestStreakOwnerFromHistory([...context.roundHistory, projectedRound]);
    const before = beforeOwner === botId ? longestWeight : 0;
    const after = afterOwner === botId ? longestWeight : 0;
    delta += after - before;
  }

  return delta;
}

function getLongestStreakOwnerFromHistory(
  rounds: Array<{ perPlayer: Array<{ playerId: PlayerId; events: RoundStatEvent[] }> }>,
): PlayerId | null {
  const allPlayerIds = new Set<PlayerId>();
  for (const r of rounds) {
    for (const p of r.perPlayer) allPlayerIds.add(p.playerId);
  }
  const playerIds = Array.from(allPlayerIds);

  const streakById: Record<string, number> = {};
  for (const id of playerIds) streakById[id] = 0;

  let best = 1;
  let owner: PlayerId | null = null;

  for (const r of rounds) {
    const byId = new Map(r.perPlayer.map((p) => [p.playerId, p]));
    for (const id of playerIds) {
      const hasYasat = byId.get(id)?.events.includes('yasat') ?? false;
      streakById[id] = hasYasat ? streakById[id] + 1 : 0;
      if (streakById[id] > best) {
        best = streakById[id];
        owner = id;
      }
    }
  }

  return owner;
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
  context: BotPolicyContext,
): { cards: Card[]; shape: NonNullable<ReturnType<typeof classifyDiscard>> } {
  const allCandidates: DiscardCandidate[] = getAllDiscardCandidates(candidates, hand);

  // Shape bias is now mild; resulting hand quality drives most of the choice.
  const shapeWeight: Record<string, number> = {
    'four-of-a-kind': 4,
    'three-of-a-kind': 3,
    straight: 2,
    pair: 1,
    single: 0,
  };

  let best: DiscardCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of allCandidates) {
    const discardIds = new Set(c.cards.map((x) => x.id));
    const remaining = hand.filter((x) => !discardIds.has(x.id));
    const handScore = evaluateHandForStats(remaining, context);
    const score = handScore + c.value * 0.35 + shapeWeight[c.shape];
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  if (!best) {
    const sorted = [...hand].sort((a, b) => cardValue(b, 1) - cardValue(a, 1));
    return { cards: [sorted[0]], shape: 'single' };
  }
  return { cards: best.cards, shape: best.shape };
}

function chooseDraw(
  state: RoundState,
  hand: readonly Card[],
  discarding: readonly Card[],
  context: BotPolicyContext,
): 'deck' | { fromDiscardId: string } {
  const topPly = state.discardPlies[state.discardPlies.length - 1] ?? [];
  const pickable = pickableFromDiscard(topPly);
  // Simulate hand after discard (before draw).
  const discardIds = new Set(discarding.map((c) => c.id));
  const remaining = hand.filter((c) => !discardIds.has(c.id));

  const deckEstimate = estimateDeckDrawScore(remaining, context);

  let bestPick: Card | null = null;
  let bestScore = -Infinity;
  for (const cand of pickable) {
    const resulting = [...remaining, cand];
    const score = evaluateHandForStats(resulting, context) + drawSynergyBonus(remaining, cand);
    if (score > bestScore) {
      bestScore = score;
      bestPick = cand;
    }
  }

  // Only take from discard when it projects at least as good as deck on
  // weighted-stat hand quality; otherwise keep uncertainty upside via deck.
  if (bestPick && bestScore >= deckEstimate) return { fromDiscardId: bestPick.id };
  return 'deck';
}

function evaluateHandForStats(hand: readonly Card[], context: BotPolicyContext): number {
  const yasatWeight = getWeight(context, 'Yasat', 1);
  const ownWeight = getWeight(context, 'Own', 3);
  const ownedWeight = getWeight(context, 'Owned', -2);
  const deathWeight = getWeight(context, 'Death', -5);

  const pts = handPoints(hand);
  const lowCount = hand.filter((c) => cardValue(c, 1) <= 3).length;
  const highCount = hand.filter((c) => cardValue(c, 1) >= 10).length;

  // Yasat pressure combines direct Yasat reward with avoiding Owned/Death.
  const pointPressure =
    1 +
    Math.max(0, yasatWeight) * 0.7 +
    Math.max(0, -ownedWeight) * 0.5 +
    Math.max(0, -deathWeight) * 0.15 +
    Math.max(0, ownWeight) * 0.2;

  let score = -pts * pointPressure;
  score += lowCount * 2.5;
  score -= highCount * 1.5;

  if (pts <= 7) score += 8 + Math.max(0, yasatWeight) * 3;
  if (pts <= 4) score += 6 + Math.max(0, yasatWeight) * 2;

  const futureCombos = enumerateDiscards(hand);
  const comboPotential = futureCombos.reduce((acc, c) => {
    switch (c.shape) {
      case 'four-of-a-kind':
        return acc + 4;
      case 'three-of-a-kind':
        return acc + 3;
      case 'straight':
        return acc + 2;
      case 'pair':
        return acc + 1;
      default:
        return acc;
    }
  }, 0);
  score += comboPotential * 0.25;

  return score;
}

function estimateDeckDrawScore(remaining: readonly Card[], context: BotPolicyContext): number {
  // Deterministic sample approximating unknown deck quality.
  const samples: Card[] = [
    { id: '__sA', suit: 'spades', rank: 'A' },
    { id: '__h4', suit: 'hearts', rank: '4' },
    { id: '__d8', suit: 'diamonds', rank: '8' },
    { id: '__cK', suit: 'clubs', rank: 'K' },
  ];
  const total = samples.reduce((acc, s) => acc + evaluateHandForStats([...remaining, s], context), 0);
  return total / samples.length;
}

function getWeight(context: BotPolicyContext, statName: string, fallback: number): number {
  return context.statWeights?.find((w) => w.statName === statName)?.weight ?? fallback;
}

function drawSynergyBonus(remaining: readonly Card[], cand: Card): number {
  const resulting = [...remaining, cand];
  let bonus = 0;

  if (remaining.some((c) => c.rank === cand.rank)) bonus += 3;
  if (cardValue(cand, 1) <= 3) bonus += 1.5;

  const formsStraight = enumerateDiscards(resulting).some(
    (d) => d.shape === 'straight' && d.cards.some((c) => c.id === cand.id),
  );
  if (formsStraight) bonus += 4;

  return bonus;
}

// ---------------------------------------------------------------------------
// Bot ace-value choice (post-round)
// ---------------------------------------------------------------------------

/**
 * For a bot holding aces at round end, choose each ace as 1 or 11.
 *
 * Strategy: enumerate all 2^n combinations (max 4 aces), simulate scoring for
 * each, and pick the combo that produces the best outcome:
 *   1. Triggers nullify-50 or nullify-100 (reset to 0) — best
 *   2. Triggers lullify (reset to 0 from 69→100) — equally best
 *   3. Lowest resulting newTotal (avoid death: death resets to 0 but costs a
 *      weighted stat; plain low total is preferable)
 *   4. Tie-break: prefer aces as 1 (lower hand display).
 */
export function chooseBotAceValues(
  hand: readonly Card[],
  botId: string,
  totalBefore: number,
  callerWon: boolean,
  callerId: string,
  isOwner: boolean,
): Record<string, 1 | 11> {
  const aces = hand.filter((c) => c.rank === 'A');
  if (aces.length === 0) return {};

  // If this bot's pointsAdded is guaranteed to be 0 (caller who won, or owner),
  // the ace choice doesn't affect the score. Default all to 1.
  if ((botId === callerId && callerWon) || isOwner) {
    const choices: Record<string, 1 | 11> = {};
    for (const a of aces) choices[a.id] = 1;
    return choices;
  }

  // If the bot is the owned caller, pointsAdded is always 35 regardless of
  // hand value. But the *displayed* handPoints may differ — still, the only
  // impact on newTotal is via the fixed 35 penalty. So ace value doesn't
  // change anything strategically. Default to 1.
  if (botId === callerId && !callerWon) {
    const choices: Record<string, 1 | 11> = {};
    for (const a of aces) choices[a.id] = 1;
    return choices;
  }

  // Enumerate all 2^n combos of ace values.
  const n = aces.length;
  let bestChoices: Record<string, 1 | 11> = {};
  let bestScore = Infinity;
  let bestHasNullify = false;

  for (let mask = 0; mask < (1 << n); mask++) {
    const choices: Record<string, 1 | 11> = {};
    for (let i = 0; i < n; i++) {
      choices[aces[i].id] = (mask >> i) & 1 ? 11 : 1;
    }
    // Compute hand points with these choices.
    let hp = 0;
    for (const c of hand) {
      if (c.rank === 'A') {
        hp += choices[c.id] ?? 1;
      } else {
        hp += cardValue(c, 1);
      }
    }
    const pointsAdded = hp; // regular non-caller, non-owner
    const provisional = totalBefore + pointsAdded;

    // Check for beneficial events.
    const isNullify =
      provisional === 50 || provisional === 100 ||
      (totalBefore === 69 && provisional === 100);
    const isDeath = provisional > 100;

    // Score: lower is better.
    // Nullify/lullify → effective newTotal 0 and positive event → best.
    // Death → newTotal 0 but negative event → treat as worse than surviving.
    let effectiveScore: number;
    if (isNullify) {
      effectiveScore = -1; // best possible
    } else if (isDeath) {
      effectiveScore = 1000; // very bad
    } else {
      effectiveScore = provisional;
    }

    if (
      effectiveScore < bestScore ||
      (effectiveScore === bestScore && !bestHasNullify && isNullify)
    ) {
      bestScore = effectiveScore;
      bestChoices = choices;
      bestHasNullify = isNullify;
    }
  }

  return bestChoices;
}
