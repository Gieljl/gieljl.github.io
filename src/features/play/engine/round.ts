/**
 * Round state machine for Yasat.
 *
 * Pure / framework-free: given a state and an action, returns a new state and
 * a list of emitted events. All randomness flows through a caller-supplied seed
 * so the engine is deterministic.
 */
import { buildDeck, Card, handPoints, shuffle } from './cards';
import { classifyDiscard, pickableFromDiscard } from './combos';

export type PlayerId = string;

export interface RoundPlayer {
  id: PlayerId;
  name: string;
  isBot: boolean;
  hand: Card[];
}

export type RoundPhase = 'in-progress' | 'ended';

export interface RoundState {
  players: RoundPlayer[];
  /** Index into `players` whose turn it is. */
  currentPlayerIndex: number;
  /** Dealer's player id — winner of the previous round (or chosen at game start). */
  dealerId: PlayerId;
  drawPile: Card[];
  /**
   * The discard pile: a list of "plies" where each ply is the set of cards a
   * player dropped on that turn (most recent at the end). The next player may
   * only draw from `plies[plies.length - 1]`.
   */
  discardPlies: Card[][];
  phase: RoundPhase;
  /** Populated when phase === 'ended': the player who declared Yasat. */
  callerId: PlayerId | null;
  /**
   * When phase === 'in-progress', tracks whether the current player has
   * already discarded this turn. (True between discard and draw.)
   */
  awaitingDraw: boolean;
}

export type PlayAction =
  | {
      type: 'discardThenDraw';
      discard: Card[];
      drawFrom: 'deck' | { fromDiscardId: string };
    }
  | { type: 'declareYasat' };

export interface ApplyResult {
  state: RoundState;
  events: RoundEvent[];
  /** If the action was rejected, the reason. When set, `state` is unchanged. */
  error?: string;
}

export type RoundEvent =
  | { type: 'discarded'; playerId: PlayerId; cards: Card[] }
  | { type: 'drewFromDeck'; playerId: PlayerId }
  | { type: 'drewFromDiscard'; playerId: PlayerId; card: Card }
  | { type: 'yasatDeclared'; playerId: PlayerId }
  | { type: 'turnAdvanced'; fromId: PlayerId; toId: PlayerId }
  | { type: 'deckReshuffled' };

export interface StartRoundInput {
  players: Array<Pick<RoundPlayer, 'id' | 'name' | 'isBot'>>;
  dealerId: PlayerId;
  seed?: number;
}

/**
 * Deal a fresh round. Each player gets 4 cards. Top of deck goes to discard
 * face-up. First to act is the player to the left of the dealer (i.e. the
 * next index in the players array).
 */
export function startRound(input: StartRoundInput): RoundState {
  if (input.players.length < 2) {
    throw new Error('A round requires at least 2 players.');
  }
  const dealerIndex = input.players.findIndex((p) => p.id === input.dealerId);
  if (dealerIndex < 0) {
    throw new Error('dealerId not found in players list.');
  }
  const deck = shuffle(buildDeck(), input.seed);
  const dealt: RoundPlayer[] = input.players.map((p) => ({ ...p, hand: [] }));
  let cursor = 0;
  for (let c = 0; c < 4; c++) {
    for (let p = 0; p < dealt.length; p++) {
      dealt[p].hand.push(deck[cursor++]);
    }
  }
  const firstDiscard = deck[cursor++];
  const drawPile = deck.slice(cursor);
  const firstPlayerIndex = (dealerIndex + 1) % dealt.length;
  return {
    players: dealt,
    currentPlayerIndex: firstPlayerIndex,
    dealerId: input.dealerId,
    drawPile,
    discardPlies: [[firstDiscard]],
    phase: 'in-progress',
    callerId: null,
    awaitingDraw: false,
  };
}

/** The player whose turn it currently is. */
export function currentPlayer(state: RoundState): RoundPlayer {
  return state.players[state.currentPlayerIndex];
}

/** The card (or cards) the current player may legally pull from the open pile. */
export function pickableDiscardCards(state: RoundState): Card[] {
  const top = state.discardPlies[state.discardPlies.length - 1];
  return pickableFromDiscard(top ?? []);
}

/** Primary reducer. Does not mutate inputs. */
export function applyAction(state: RoundState, action: PlayAction): ApplyResult {
  if (state.phase === 'ended') {
    return { state, events: [], error: 'Round has ended.' };
  }
  const actor = currentPlayer(state);

  if (action.type === 'declareYasat') {
    if (state.awaitingDraw) {
      return { state, events: [], error: 'Yasat can only be declared at the start of your turn.' };
    }
    const pts = handPoints(actor.hand);
    if (pts > 7) {
      return { state, events: [], error: `Cannot declare Yasat with ${pts} points (max 7).` };
    }
    return {
      state: { ...state, phase: 'ended', callerId: actor.id },
      events: [{ type: 'yasatDeclared', playerId: actor.id }],
    };
  }

  // discardThenDraw — enforce discard-before-draw atomically.
  if (state.awaitingDraw) {
    return { state, events: [], error: 'Already discarded this turn.' };
  }
  const { discard, drawFrom } = action;
  const shape = classifyDiscard(discard);
  if (!shape) return { state, events: [], error: 'Invalid discard combination.' };

  // Verify all discarded cards are actually in the actor's hand.
  const handIds = new Set(actor.hand.map((c) => c.id));
  for (const c of discard) {
    if (!handIds.has(c.id)) {
      return { state, events: [], error: `Card ${c.id} is not in your hand.` };
    }
  }
  const discardIds = new Set(discard.map((c) => c.id));
  if (discardIds.size !== discard.length) {
    return { state, events: [], error: 'Discard contains duplicate cards.' };
  }

  const events: RoundEvent[] = [];
  // Resolve the draw first (against the pre-discard discard pile) so fromDiscard
  // references a valid top-ply card.
  let drawnCard: Card | null = null;
  let newDrawPile = state.drawPile;
  let newDiscardPlies = state.discardPlies.map((p) => p.slice());

  if (drawFrom === 'deck') {
    const pulled = pullFromDeck(newDrawPile, newDiscardPlies);
    if (!pulled) return { state, events: [], error: 'Draw pile is empty.' };
    newDrawPile = pulled.drawPile;
    newDiscardPlies = pulled.discardPlies;
    drawnCard = pulled.card;
    if (pulled.reshuffled) events.push({ type: 'deckReshuffled' });
  } else {
    const topPly = newDiscardPlies[newDiscardPlies.length - 1] ?? [];
    const pickable = pickableFromDiscard(topPly);
    const target = pickable.find((c) => c.id === drawFrom.fromDiscardId);
    if (!target) {
      return { state, events: [], error: 'That card is not available to draw from the discard pile.' };
    }
    // remove target from the top ply
    const idx = topPly.findIndex((c) => c.id === target.id);
    const updatedTop = topPly.slice(0, idx).concat(topPly.slice(idx + 1));
    newDiscardPlies[newDiscardPlies.length - 1] = updatedTop;
    drawnCard = target;
  }

  // Remove discarded cards from hand and push them as the new top ply.
  const newHand = actor.hand.filter((c) => !discardIds.has(c.id));
  newHand.push(drawnCard!);
  newDiscardPlies.push(discard.slice());

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
  );

  events.push({ type: 'discarded', playerId: actor.id, cards: discard.slice() });
  if (drawFrom === 'deck') {
    events.push({ type: 'drewFromDeck', playerId: actor.id });
  } else {
    events.push({ type: 'drewFromDiscard', playerId: actor.id, card: drawnCard! });
  }

  // Advance turn.
  const nextIdx = (state.currentPlayerIndex + 1) % state.players.length;
  events.push({
    type: 'turnAdvanced',
    fromId: actor.id,
    toId: state.players[nextIdx].id,
  });

  return {
    state: {
      ...state,
      players: newPlayers,
      drawPile: newDrawPile,
      discardPlies: newDiscardPlies,
      currentPlayerIndex: nextIdx,
      awaitingDraw: false,
    },
    events,
  };
}

/**
 * Pulls the top card off the draw pile. If empty, reshuffles all-but-the-top
 * discard ply back into the draw pile.
 */
function pullFromDeck(
  drawPile: Card[],
  discardPlies: Card[][],
): { card: Card; drawPile: Card[]; discardPlies: Card[][]; reshuffled: boolean } | null {
  if (drawPile.length > 0) {
    return {
      card: drawPile[0],
      drawPile: drawPile.slice(1),
      discardPlies,
      reshuffled: false,
    };
  }
  // Reshuffle: keep the top ply as the face-up discard, merge the rest into
  // the draw pile and shuffle.
  if (discardPlies.length <= 1) return null;
  const keep = discardPlies[discardPlies.length - 1];
  const merged = discardPlies.slice(0, -1).flat();
  const reshuffled = shuffle(merged);
  if (reshuffled.length === 0) return null;
  return {
    card: reshuffled[0],
    drawPile: reshuffled.slice(1),
    discardPlies: [keep],
    reshuffled: true,
  };
}
