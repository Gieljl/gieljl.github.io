/**
 * Regicide solo-mode engine (pure functions, framework-free).
 *
 * Reuses the Card primitives from the existing Yasat play engine. Jesters are
 * modelled separately as "flip credits" — in solo mode 2 are set aside (not in
 * the Tavern deck) and may be spent to discard the hand and refill to 8.
 *
 * Card mapping:
 *  - Aces (A) = Animal Companions (attack 1).
 *  - Jokers/Jesters are not in the Tavern in solo mode; tracked via
 *    `jesterFlipsRemaining`.
 */

import { Card, Rank, RANKS, Suit, SUITS } from "../play/engine/cards";

export type EnemyRank = "J" | "Q" | "K";

export interface Enemy {
  suit: Suit;
  rank: EnemyRank;
  maxHealth: number;
  baseAttack: number;
  currentHealth: number;
}

export type Phase = "play" | "damage" | "won" | "lost";

export interface RegicideState {
  phase: Phase;
  enemy: Enemy;
  /** Face-down remaining bosses (top of stack at index 0). */
  castle: Card[];
  /** Tavern deck — players draw from index 0 ("top"). */
  tavern: Card[];
  /** Face-up discard pile. */
  discard: Card[];
  /** Solo player hand (max 8). */
  hand: Card[];
  /** Cards played against the current enemy (face-up next to them). */
  field: Card[];
  /** Cumulative Spades attack value played vs current enemy. */
  shield: number;
  /** Cumulative damage dealt to current enemy. */
  damageDealt: number;
  /** Solo-only: Jester "flip" credits remaining (start = 2). */
  jesterFlipsRemaining: number;
  /** Most recent action message (for UI feedback). */
  message?: string;
}

export const SOLO_HAND_LIMIT = 8;
export const SOLO_JESTERS_AVAILABLE = 2;

// -------- card value helpers --------

/** Attack value when played from hand. */
export function attackValue(card: Card): number {
  switch (card.rank) {
    case "A":
      return 1;
    case "J":
      return 10;
    case "Q":
      return 15;
    case "K":
      return 20;
    default:
      return Number(card.rank);
  }
}

/** Discard value when used to soak enemy damage (same as attack value). */
export function discardValue(card: Card): number {
  return attackValue(card);
}

export function isAnimalCompanion(card: Card): boolean {
  return card.rank === "A";
}

// -------- deck construction --------

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCard(suit: Suit, rank: Rank): Card {
  return { id: `${suit}-${rank}`, suit, rank };
}

function buildCastle(): Card[] {
  // Bottom→top: Kings → Queens → Jacks. Top of stack (index 0) faces first.
  const jacks = shuffle(SUITS.map((s) => makeCard(s, "J")));
  const queens = shuffle(SUITS.map((s) => makeCard(s, "Q")));
  const kings = shuffle(SUITS.map((s) => makeCard(s, "K")));
  return [...jacks, ...queens, ...kings];
}

function buildTavern(): Card[] {
  const numbers: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const deck: Card[] = [];
  for (const s of SUITS) {
    deck.push(makeCard(s, "A"));
    for (const r of numbers) deck.push(makeCard(s, r));
  }
  return shuffle(deck);
}

export function enemyFor(card: Card): Enemy {
  const rank = card.rank as EnemyRank;
  const max = rank === "J" ? 20 : rank === "Q" ? 30 : 40;
  const atk = rank === "J" ? 10 : rank === "Q" ? 15 : 20;
  return {
    suit: card.suit,
    rank,
    maxHealth: max,
    currentHealth: max,
    baseAttack: atk,
  };
}

export function newSoloGame(): RegicideState {
  const castle = buildCastle();
  const first = castle.shift()!;
  const tavern = buildTavern();
  const hand: Card[] = [];
  for (let i = 0; i < SOLO_HAND_LIMIT; i++) {
    const c = tavern.shift();
    if (c) hand.push(c);
  }
  return {
    phase: "play",
    enemy: enemyFor(first),
    castle,
    tavern,
    discard: [],
    hand,
    field: [],
    shield: 0,
    damageDealt: 0,
    jesterFlipsRemaining: SOLO_JESTERS_AVAILABLE,
  };
}

// -------- play validation --------

export type PlayKind =
  | { kind: "single"; card: Card }
  | { kind: "combo"; cards: Card[] } // 2-4 of same rank, total ≤ 10, no Ace
  | { kind: "animal"; ace: Card; partner: Card } // Ace + 1 non-Ace partner
  | { kind: "animal-pair"; aces: [Card, Card] }; // 2 Aces

/**
 * Validate a selected set of cards and classify the play, or return an error.
 */
export function classifyPlay(cards: Card[]): PlayKind | { error: string } {
  if (cards.length === 0) return { error: "Select at least one card to play." };

  if (cards.length === 1) return { kind: "single", card: cards[0] };

  const aces = cards.filter(isAnimalCompanion);
  const nonAces = cards.filter((c) => !isAnimalCompanion(c));

  // Two Animal Companions
  if (cards.length === 2 && aces.length === 2) {
    return { kind: "animal-pair", aces: [aces[0], aces[1]] };
  }

  // Ace + 1 partner
  if (cards.length === 2 && aces.length === 1 && nonAces.length === 1) {
    return { kind: "animal", ace: aces[0], partner: nonAces[0] };
  }

  // Combo: 2-4 same-rank, no Aces, sum ≤ 10
  if (aces.length === 0 && cards.length >= 2 && cards.length <= 4) {
    const rank = cards[0].rank;
    if (cards.some((c) => c.rank !== rank)) {
      return {
        error: "Combos must be the same rank, or pair an Ace with one card.",
      };
    }
    const sum = cards.reduce((s, c) => s + attackValue(c), 0);
    if (sum > 10) return { error: "Combo total must be 10 or less." };
    return { kind: "combo", cards };
  }

  return { error: "Invalid selection." };
}

/**
 * Total attack value for a play.
 */
export function playAttackValue(play: PlayKind): number {
  switch (play.kind) {
    case "single":
      return attackValue(play.card);
    case "combo":
      return play.cards.reduce((s, c) => s + attackValue(c), 0);
    case "animal":
      return 1 + attackValue(play.partner);
    case "animal-pair":
      return 2;
  }
}

/**
 * Distinct suits in the play (Animal-pair of same suit counts once).
 */
export function playSuits(play: PlayKind): Suit[] {
  const cards = playCards(play);
  return Array.from(new Set(cards.map((c) => c.suit))) as Suit[];
}

export function playCards(play: PlayKind): Card[] {
  switch (play.kind) {
    case "single":
      return [play.card];
    case "combo":
      return play.cards;
    case "animal":
      return [play.ace, play.partner];
    case "animal-pair":
      return [...play.aces];
  }
}

// -------- engine actions --------

/** Apply the chosen play. Returns updated state or `{ error }`. */
export function applyPlay(
  state: RegicideState,
  selection: Card[],
): RegicideState | { error: string } {
  if (state.phase !== "play") return { error: "Not in play phase." };

  const cls = classifyPlay(selection);
  if ("error" in cls) return cls;

  // Remove played cards from hand
  const playedIds = new Set(playCards(cls).map((c) => c.id));
  if (playCards(cls).some((c) => !state.hand.find((h) => h.id === c.id))) {
    return { error: "Selected card not in hand." };
  }

  let s: RegicideState = {
    ...state,
    hand: state.hand.filter((c) => !playedIds.has(c.id)),
    field: [...state.field, ...playCards(cls)],
    message: undefined,
  };

  const total = playAttackValue(cls);
  const suits = playSuits(cls);
  const enemyImmuneTo = state.enemy.suit;

  // Step 2 — apply suit powers in fixed order (Hearts before Diamonds).
  const order: Suit[] = ["hearts", "diamonds", "spades", "clubs"];
  for (const suit of order) {
    if (!suits.includes(suit)) continue;
    if (suit === enemyImmuneTo) continue; // immunity (no Jester in solo to cancel)

    if (suit === "hearts") {
      s = resolveHeartsHeal(s, total);
    } else if (suit === "diamonds") {
      s = resolveDiamondsDraw(s, total);
    } else if (suit === "spades") {
      s = { ...s, shield: s.shield + total };
    }
    // Clubs handled below as part of damage step.
  }

  // Step 3 — deal damage. Clubs double (only if not immune).
  const clubsDouble =
    suits.includes("clubs") && enemyImmuneTo !== "clubs" ? total : 0;
  const damage = total + clubsDouble;
  const newHealth = s.enemy.currentHealth - damage;
  s = {
    ...s,
    damageDealt: s.damageDealt + damage,
    enemy: { ...s.enemy, currentHealth: newHealth },
  };

  if (newHealth <= 0) {
    return defeatEnemy(s, newHealth === 0);
  }

  // Move to damage phase.
  return enterDamagePhase(s);
}

/** Solo Jester flip — discard entire hand and refill to 8. */
export function applyJesterFlip(
  state: RegicideState,
): RegicideState | { error: string } {
  if (state.jesterFlipsRemaining <= 0) {
    return { error: "No Jester flips remaining." };
  }
  if (state.phase !== "play" && state.phase !== "damage") {
    return { error: "Cannot flip Jester right now." };
  }
  let tavern = state.tavern.slice();
  const discard = [...state.discard, ...state.hand];
  const hand: Card[] = [];
  for (let i = 0; i < SOLO_HAND_LIMIT; i++) {
    const c = tavern.shift();
    if (c) hand.push(c);
  }
  return {
    ...state,
    tavern,
    discard,
    hand,
    jesterFlipsRemaining: state.jesterFlipsRemaining - 1,
    message: `Jester used — refilled to ${hand.length} cards.`,
  };
}

/** Yield = skip Steps 2-3, take enemy damage. */
export function applyYield(state: RegicideState): RegicideState {
  if (state.phase !== "play") return state;
  return enterDamagePhase({ ...state, message: "You yielded." });
}

/**
 * Resolve the damage step by discarding cards. Returns updated state with
 * `phase = play` (or `lost` if insufficient).
 */
export function resolveDamage(
  state: RegicideState,
  toDiscard: Card[],
): RegicideState | { error: string } {
  if (state.phase !== "damage") return { error: "Not in damage phase." };

  const required = Math.max(0, state.enemy.baseAttack - state.shield);
  const ids = new Set(toDiscard.map((c) => c.id));
  if (toDiscard.some((c) => !state.hand.find((h) => h.id === c.id))) {
    return { error: "Selected card not in hand." };
  }
  const sum = toDiscard.reduce((acc, c) => acc + discardValue(c), 0);
  if (sum < required) {
    return {
      error: `Need to discard at least ${required}. Selected ${sum}.`,
    };
  }
  return {
    ...state,
    hand: state.hand.filter((c) => !ids.has(c.id)),
    discard: [...state.discard, ...toDiscard],
    phase: "play",
    message:
      required === 0
        ? "Shields absorbed the attack."
        : `Took ${required} damage.`,
  };
}

// -------- internal helpers --------

function enterDamagePhase(s: RegicideState): RegicideState {
  const required = Math.max(0, s.enemy.baseAttack - s.shield);
  // Auto-resolve when no damage to take.
  if (required === 0) {
    return {
      ...s,
      phase: "play",
      message: "Shields absorbed the attack.",
    };
  }
  // Loss check: total deck value of hand < required
  const handTotal = s.hand.reduce((acc, c) => acc + discardValue(c), 0);
  if (handTotal < required) {
    return {
      ...s,
      phase: "lost",
      message: `Defeated — couldn't cover ${required} damage (you have ${handTotal}).`,
    };
  }
  return { ...s, phase: "damage" };
}

function defeatEnemy(s: RegicideState, exactKill: boolean): RegicideState {
  // Move enemy + field to discard, or enemy onto Tavern if exact kill.
  const enemyCard: Card = makeCard(s.enemy.suit, s.enemy.rank);
  let tavern = s.tavern.slice();
  let discard = [...s.discard, ...s.field];
  if (exactKill) {
    tavern = [enemyCard, ...tavern];
  } else {
    discard = [...discard, enemyCard];
  }

  if (s.castle.length === 0) {
    return {
      ...s,
      tavern,
      discard,
      field: [],
      shield: 0,
      damageDealt: 0,
      phase: "won",
      message: "Victory! All Kings defeated.",
    };
  }
  const nextCastle = s.castle.slice();
  const next = nextCastle.shift()!;
  return {
    ...s,
    tavern,
    discard,
    field: [],
    shield: 0,
    damageDealt: 0,
    castle: nextCastle,
    enemy: enemyFor(next),
    phase: "play",
    message: `Defeated ${s.enemy.rank}${suitSymbol(s.enemy.suit)}. New enemy approaches.`,
  };
}

function resolveHeartsHeal(s: RegicideState, value: number): RegicideState {
  if (s.discard.length === 0) return s;
  const shuffled = shuffle(s.discard);
  const taken = shuffled.slice(0, value);
  const rest = shuffled.slice(value);
  // Take cards go to BOTTOM of tavern face-down; remaining stays as discard face-up.
  return {
    ...s,
    discard: rest,
    tavern: [...s.tavern, ...taken],
  };
}

function resolveDiamondsDraw(s: RegicideState, value: number): RegicideState {
  // Solo: draw up to value, capped at hand limit.
  const room = SOLO_HAND_LIMIT - s.hand.length;
  const take = Math.min(room, value, s.tavern.length);
  if (take <= 0) return s;
  const drawn = s.tavern.slice(0, take);
  return {
    ...s,
    tavern: s.tavern.slice(take),
    hand: [...s.hand, ...drawn],
  };
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case "spades":
      return "♠";
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
  }
}

/**
 * Total damage value of the player's hand (used to telegraph upcoming loss in
 * the UI).
 */
export function handTotalValue(state: RegicideState): number {
  return state.hand.reduce((acc, c) => acc + discardValue(c), 0);
}

/** Required damage to soak from current enemy after shields. */
export function damageRequired(state: RegicideState): number {
  return Math.max(0, state.enemy.baseAttack - state.shield);
}

// Suppress unused-warning if RANKS is otherwise unreferenced in some compilers.
export const _RANKS = RANKS;
