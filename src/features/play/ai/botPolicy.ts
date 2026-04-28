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

/**
 * Personality profiles add per-bot variance to behavior independent of
 * difficulty. Each bot is deterministically assigned one based on its id.
 */
export type Personality =
  | 'cautious' // -risk tolerance, prefers deck draws, plays safe
  | 'balanced' // neutral
  | 'aggressive' // +risk tolerance, prefers discard pickups
  | 'opportunist' // hunts kills/nullifies, picks up Aces eagerly
  | 'gambler'; // very loose, accepts more risk, makes more mistakes

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
  /**
   * Optional explicit personality override. If absent, derived from botId.
   * Tests can pass this to make assertions deterministic.
   */
  personality?: Personality;
}

// ---------------------------------------------------------------------------
// Personality + deterministic RNG
// ---------------------------------------------------------------------------

const PERSONALITIES: Personality[] = [
  'cautious',
  'balanced',
  'aggressive',
  'opportunist',
  'gambler',
];

/** Deterministic personality assignment from bot id. */
export function getPersonality(botId: string): Personality {
  const h = hashString(botId);
  return PERSONALITIES[h % PERSONALITIES.length];
}

/** FNV-like hash returning a non-negative 32-bit int. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Seeded RNG so the same (botId, turn-state) always produces the same
 * randomness. Keeps tests reproducible while allowing variability.
 */
function seededRandom(seed: string): () => number {
  let h = hashString(seed);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    h = Math.imul(h ^ (h >>> 15), 1597334677);
    return ((h >>> 0) % 1000000) / 1000000;
  };
}

/** Stable per-turn seed for a bot. */
function turnSeed(state: RoundState, botId: string, label: string): string {
  return `${botId}|${state.discardPlies.length}|${label}`;
}

/** Risk-threshold offset (lower = calls less, higher = calls more). */
function personalityRiskBias(personality: Personality): number {
  switch (personality) {
    case 'cautious':
      return -2;
    case 'balanced':
      return 0;
    case 'aggressive':
      return 2;
    case 'opportunist':
      return 1;
    case 'gambler':
      return 3;
  }
}

/** Probability the bot ignores the best computed discard/draw and picks alt. */
function personalityNoise(personality: Personality, difficulty: Difficulty): number {
  if (difficulty === 'godlike') return 0;
  const base = difficulty === 'easy' ? 0.2 : 0.05;
  const bias =
    personality === 'gambler' ? 0.15 :
    personality === 'aggressive' ? 0.05 :
    personality === 'cautious' ? -0.05 :
    0;
  return Math.max(0, Math.min(0.5, base + bias));
}

/** Memory window: number of recent events the bot remembers. */
function memoryWindow(difficulty: Difficulty, personality: Personality): number {
  if (difficulty === 'godlike') return Infinity;
  const base = difficulty === 'easy' ? 4 : 12;
  const bias =
    personality === 'cautious' ? 2 :
    personality === 'opportunist' ? 2 :
    personality === 'gambler' ? -1 :
    0;
  return Math.max(2, base + bias);
}

/** Probability of "missing" each visible event entirely. */
function blindSpotRate(difficulty: Difficulty, personality: Personality): number {
  if (difficulty === 'godlike') return 0;
  const base = difficulty === 'easy' ? 0.3 : 0.1;
  const bias =
    personality === 'cautious' ? -0.05 :
    personality === 'opportunist' ? -0.05 :
    personality === 'gambler' ? 0.1 :
    0;
  return Math.max(0, Math.min(0.6, base + bias));
}

/**
 * Apply human-like memory limits + blind spots to a stream of round events.
 * Returns a filtered list the bot "actually remembers".
 *
 * When the caller explicitly provides a personality (test mode), blind-spot
 * dropping is disabled for determinism — only the memory window is enforced.
 */
function applyMemoryFilter(
  events: RoundEvent[],
  difficulty: Difficulty,
  personality: Personality,
  rng: () => number,
  deterministic: boolean,
): RoundEvent[] {
  if (difficulty === 'godlike') return events;
  const window = memoryWindow(difficulty, personality);
  const recent = window === Infinity ? events : events.slice(-window);
  if (deterministic) return recent;
  const missRate = blindSpotRate(difficulty, personality);
  if (missRate <= 0) return recent;
  return recent.filter(() => rng() >= missRate);
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

  const personality = context.personality ?? getPersonality(botId);
  const deterministic = context.personality !== undefined;

  // Apply human-like memory limits + blind spots once per decision.
  const memoryRng = seededRandom(turnSeed(state, botId, 'memory'));
  const rememberedEvents = applyMemoryFilter(
    context.visibleRoundEvents ?? [],
    difficulty,
    personality,
    memoryRng,
    deterministic,
  );
  const effectiveContext: BotPolicyContext = {
    ...context,
    visibleRoundEvents: rememberedEvents,
    personality,
  };

  // 1. Start-of-turn Yasat check.
  const myPoints = handPoints(me.hand);
  if (myPoints <= 7 && shouldDeclareYasat(state, botId, difficulty, effectiveContext)) {
    return { type: 'declareYasat' };
  }

  if (difficulty === 'godlike') {
    const hard = chooseHardDiscardAndDraw(state, me.hand, effectiveContext);
    return {
      type: 'discardThenDraw',
      discard: hard.cards,
      drawFrom: hard.drawFrom,
    };
  }

  // 2. Build candidate discards and pick the highest-value one.
  const candidates = enumerateDiscards(me.hand);
  const chosen = pickBestDiscard(
    candidates,
    me.hand,
    effectiveContext,
    difficulty,
    personality,
    seededRandom(turnSeed(state, botId, 'discard')),
  );

  // 3. Choose draw source.
  const drawFrom = chooseDraw(
    state,
    me.hand,
    chosen.cards,
    effectiveContext,
    difficulty,
    personality,
    seededRandom(turnSeed(state, botId, 'draw')),
  );

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
  const personality = context.personality ?? getPersonality(botId);

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

  // Personality + tactical adjustments to the perceived risk.
  const riskBias = personalityRiskBias(personality);
  const survivalBias = survivalRiskBias(state, botId, context);
  const tacticalBonus = quickTacticalBonusForDeclare(state, botId, context);

  // Effective risk perception: visible-card risk minus personality/tactical
  // adjustments plus survival bias. Lower = safer to call.
  const effectiveRisk =
    lowHandRisk - riskBias - tacticalBonus + survivalBias;

  // Rough "safe" thresholds:
  // - easy: mostly calls Yasat, only bails on very strong perceived danger
  // - normal: more cautious on 1–2 card opponent scenarios
  // - godlike: stricter unless very low, prefers value-building turns
  if (difficulty === 'easy') {
    if (myPts <= 1) return true;
    if (myPts === 2) return effectiveRisk < 7;
    if (myPts <= 4) return effectiveRisk < 8;
    return true;
  }
  if (difficulty === 'godlike') {
    if (myPts <= 3) return true;
    if (myPts <= 5) return opponents.some((o) => o.hand.length >= 3);
    return false;
  }
  // Normal
  if (myPts <= 1) return true;
  if (myPts === 2) return effectiveRisk < 4;
  if (myPts === 3) return effectiveRisk < 5;
  if (myPts <= 4) return effectiveRisk < 6;
  if (effectiveRisk >= 4) return false;
  return opponents.some((o) => o.hand.length >= 3);
}

/**
 * Cheap stat-aware tactical bonus: adds positive value when declaring would
 * likely produce a Kill, Nullify, or own-Yasat-streak protection. Negative
 * when the bot already securely owns Longest Streak (less reason to call).
 *
 * Designed to mimic human pattern recognition without full scoring sim.
 */
function quickTacticalBonusForDeclare(
  state: RoundState,
  botId: string,
  context: BotPolicyContext,
): number {
  const totals = context.totalsBefore ?? {};
  const myTotal = totals[botId] ?? 0;
  const me = state.players.find((p) => p.id === botId);
  if (!me) return 0;
  const myPts = handPoints(me.hand);

  let bonus = 0;

  // Kill potential: an opponent's total + their *minimum possible* hand > 100.
  for (const opp of state.players) {
    if (opp.id === botId) continue;
    const oppTotal = totals[opp.id] ?? 0;
    const oppMinHand = Math.max(opp.hand.length, 0);
    if (oppTotal + oppMinHand > 100) {
      bonus += 2; // strong incentive to lock in the kill
    } else if (oppTotal + oppMinHand >= 95) {
      bonus += 1; // possible kill if their hand is high
    }
  }

  // Nullify-on-50/100 setup: if my own provisional total would land on 50/100.
  const provisional = myTotal + 0; // pointsAdded === 0 when we win
  if (provisional === 50 || provisional === 100) bonus += 2;

  // Lullify pattern: at 69 with hand pts that sum to 100 isn't possible by
  // declaring (we'd reset to 0), but reaching 100 on a fail would Lullify.
  // Skip — too situational for cheap heuristic.

  // Streak ownership: if I currently own the streak, slightly less eager
  // to call (already have the bonus). If I'm one Yasat from taking it, more eager.
  const streakOwner = currentStreakOwner(context.roundHistory ?? []);
  if (streakOwner === botId) bonus -= 1;
  else if (myStreakLength(botId, context.roundHistory ?? []) >= 1) bonus += 1;

  // Multi-card hand at high points: wanting Yasat is a stretch — slight penalty.
  if (myPts >= 6 && me.hand.length >= 4) bonus -= 1;

  return bonus;
}

/** Risk amplification when bot is near the death threshold (>90 cumulative). */
function survivalRiskBias(
  state: RoundState,
  botId: string,
  context: BotPolicyContext,
): number {
  const total = context.totalsBefore?.[botId] ?? 0;
  if (total >= 95) return 3; // very close to dying — call sooner
  if (total >= 85) return 1;
  if (total <= 10) return -1; // safe, allow more aggressive plays
  return 0;
}

function currentStreakOwner(
  history: Array<{ perPlayer: Array<{ playerId: PlayerId; events: RoundStatEvent[] }> }>,
): PlayerId | null {
  return getLongestStreakOwnerFromHistory(history);
}

function myStreakLength(
  botId: PlayerId,
  history: Array<{ perPlayer: Array<{ playerId: PlayerId; events: RoundStatEvent[] }> }>,
): number {
  let streak = 0;
  for (const r of history) {
    const mine = r.perPlayer.find((p) => p.playerId === botId);
    if (mine?.events.includes('yasat')) streak += 1;
    else streak = 0;
  }
  return streak;
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
    // Worst case for the bot = opponent's minimum possible hand points.
    const minPossible = knownPoints + unknownCount;

    if (minPossible < myPts) {
      // Opponent could have lower points → genuine Own/Owned threat.
      // Strength scales with how confident the threat signal is:
      //   - known cards = high confidence
      //   - 1-card opp = stronger than 2-card
      const observed = knownCount > 0;
      let oppRisk = 0;
      if (opp.hand.length === 1) {
        oppRisk += observed ? 4 : 2;
      } else {
        oppRisk += observed ? 2 : 1;
      }
      // Fully observed = high-confidence threat.
      if (knownCount === opp.hand.length && knownCount > 0) oppRisk += 2;
      // Specific known low cards add danger when our points are small.
      if (known.some((c) => c.rank === 'A') && myPts <= 3) oppRisk += 1;
      risk += oppRisk;
    } else if (minPossible === myPts) {
      // Tie or we win. Caller wins ties on Yasat call → no real risk.
      // (Leaving 0 here keeps the bot willing to call against equal-point opps.)
    }
    // else: opponent must lose → no risk added.
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
  difficulty: Difficulty,
  personality: Personality,
  rng: () => number,
): { cards: Card[]; shape: NonNullable<ReturnType<typeof classifyDiscard>> } {
  // Difficulty-tuned candidate pool: easier bots consider fewer options.
  let allCandidates: DiscardCandidate[] = getAllDiscardCandidates(candidates, hand);
  if (difficulty === 'easy') {
    // Easy considers only singles + pairs (skips triples/quads/straights).
    allCandidates = allCandidates.filter(
      (c) => c.shape === 'single' || c.shape === 'pair',
    );
  }

  // Shape bias is now mild; resulting hand quality drives most of the choice.
  const shapeWeight: Record<string, number> = {
    'four-of-a-kind': 4,
    'three-of-a-kind': 3,
    straight: 2,
    pair: 1,
    single: 0,
  };

  // Score every candidate.
  const scored: Array<{ cand: DiscardCandidate; score: number }> = [];
  for (const c of allCandidates) {
    const discardIds = new Set(c.cards.map((x) => x.id));
    const remaining = hand.filter((x) => !discardIds.has(x.id));
    const handScore = evaluateHandForStats(remaining, context);
    const score = handScore + c.value * 0.35 + shapeWeight[c.shape];
    scored.push({ cand: c, score });
  }

  if (scored.length === 0) {
    const sorted = [...hand].sort((a, b) => cardValue(b, 1) - cardValue(a, 1));
    return { cards: [sorted[0]], shape: 'single' };
  }

  scored.sort((a, b) => b.score - a.score);

  // ε-greedy: with personality+difficulty noise, pick second/third best.
  const noise = personalityNoise(personality, difficulty);
  if (noise > 0 && scored.length >= 2 && rng() < noise) {
    const altIndex = scored.length >= 3 && rng() < 0.3 ? 2 : 1;
    const alt = scored[altIndex] ?? scored[1];
    return { cards: alt.cand.cards, shape: alt.cand.shape };
  }

  const best = scored[0].cand;
  return { cards: best.cards, shape: best.shape };
}

function chooseDraw(
  state: RoundState,
  hand: readonly Card[],
  discarding: readonly Card[],
  context: BotPolicyContext,
  difficulty: Difficulty,
  personality: Personality,
  rng: () => number,
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

  // Personality-driven preference: aggressive/opportunist favor discard pickups,
  // cautious favors deck (less info revealed).
  const draftPreference =
    personality === 'aggressive' || personality === 'opportunist' ? 1 :
    personality === 'cautious' ? -1 :
    0;

  // ε-greedy noise: occasionally take the worse option (humans sometimes do).
  const noise = personalityNoise(personality, difficulty);
  if (bestPick && rng() < noise) return 'deck';
  if (!bestPick && rng() < noise && pickable.length > 0) {
    return { fromDiscardId: pickable[0].id };
  }

  // Take from discard when it scores >= deck (shifted by personality preference).
  if (bestPick && bestScore + draftPreference >= deckEstimate) {
    return { fromDiscardId: bestPick.id };
  }
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
  difficulty: Difficulty = 'normal',
  personality: Personality = getPersonality(botId),
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
  // hand value. So ace value doesn't matter strategically. Default to 1.
  if (botId === callerId && !callerWon) {
    const choices: Record<string, 1 | 11> = {};
    for (const a of aces) choices[a.id] = 1;
    return choices;
  }

  // Personality + difficulty-driven simplification.
  // Easy bots and gamblers often miss optimal Ace play (humans do too).
  const skipOptimization =
    difficulty === 'easy' &&
    (personality === 'cautious' || personality === 'gambler' || personality === 'aggressive');

  if (skipOptimization) {
    // Default everything to 1 — misses some Nullifies but very human.
    const choices: Record<string, 1 | 11> = {};
    for (const a of aces) choices[a.id] = 1;
    return choices;
  }

  // Normal-easy or normal: try to optimize but with a chance of missing.
  const rng = seededRandom(`${botId}|ace|${totalBefore}`);
  const missChance =
    difficulty === 'easy' ? 0.4 :
    difficulty === 'normal' ? 0.1 :
    0;
  if (rng() < missChance) {
    const choices: Record<string, 1 | 11> = {};
    for (const a of aces) choices[a.id] = 1;
    return choices;
  }

  // Enumerate all 2^n combos of ace values (full optimization).
  const n = aces.length;
  let bestChoices: Record<string, 1 | 11> = {};
  let bestScore = Infinity;
  let bestHasNullify = false;

  for (let mask = 0; mask < (1 << n); mask++) {
    const choices: Record<string, 1 | 11> = {};
    for (let i = 0; i < n; i++) {
      choices[aces[i].id] = (mask >> i) & 1 ? 11 : 1;
    }
    let hp = 0;
    for (const c of hand) {
      if (c.rank === 'A') {
        hp += choices[c.id] ?? 1;
      } else {
        hp += cardValue(c, 1);
      }
    }
    const pointsAdded = hp;
    const provisional = totalBefore + pointsAdded;

    const isNullify =
      provisional === 50 || provisional === 100 ||
      (totalBefore === 69 && provisional === 100);
    const isDeath = provisional > 100;

    let effectiveScore: number;
    if (isNullify) {
      effectiveScore = -1;
    } else if (isDeath) {
      effectiveScore = 1000;
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
