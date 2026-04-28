/**
 * Redux slice for the Play feature.
 *
 * Ephemeral (not persisted, not undoable). All state for a play game lives
 * here — cumulative totals, round history, log — nothing leaks into the
 * existing scoreSlice/statsSlice/Firestore.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { nanoid } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import { Difficulty } from './ai/botPolicy';
import { PlayAction, PlayerId, RoundEvent, RoundState, applyAction, startRound } from './engine/round';
import { PerPlayerRoundResult, scoreRound } from './engine/scoring';
import type { GameLength } from '../game/gameLength';

export interface PlaySetupEntry {
  name: string;
  isBot: boolean;
}

export interface PlayLogEntry {
  /** Monotonic counter. */
  id: number;
  message: string;
}

export interface StoredRoundResult {
  roundIndex: number;
  callerId: PlayerId;
  callerWon: boolean;
  perPlayer: PerPlayerRoundResult[];
}

export interface PlayState {
  /** Null when no game is in progress. */
  round: RoundState | null;
  /** Stable id → display name, set at game init. */
  playerNames: Record<PlayerId, string>;
  /**
   * Friends-mode only: stable id → username (lowercased) used to write
   * per-participant stats at game-end. Empty for vs-AI games.
   */
  usernameByPlayerId: Record<PlayerId, string>;
  /** Ids in seating order. */
  seating: PlayerId[];
  humanId: PlayerId | null;
  /**
   * Username of the logged-in human player when this game started, used to
   * persist Play stats to Firestore at game end. Null when anonymous.
   */
  humanUsername: string | null;
  dealerId: PlayerId | null;
  /**
   * Distinguishes the two Play sub-modes:
   *   'ai'     — single human + bots (existing).
   *   'friends' — 2–4 humans, no bots.
   */
  mode: 'ai' | 'friends';
  difficulty: Difficulty;
  /** Configured length condition for this play game. */
  length: GameLength;
  /** True once the configured game-length threshold is met. */
  gameOver: boolean;
  cumulativeTotals: Record<PlayerId, number>;
  roundHistory: StoredRoundResult[];
  /** Set while the UI is waiting for a bot to move (to render "thinking"). */
  thinkingPlayerId: PlayerId | null;
  log: PlayLogEntry[];
  /** Toast / error message from last rejected action, if any. */
  lastError: string | null;
  /** Present when the round has just ended and the dialog should show. */
  lastRoundResult: StoredRoundResult | null;
  /** Structured events emitted by the most recent submitAction, for UI animations. */
  lastEvents: RoundEvent[];
  /** Public events emitted in the current round (observable by all players). */
  currentRoundEvents: RoundEvent[];
  nextLogId: number;
  /**
   * True when a round just ended and at least one player holds an ace,
   * meaning we need each such player to choose 1 or 11 before scoring.
   */
  awaitingAceChoices: boolean;
  /**
   * Collected ace overrides so far. Once every player with aces has
   * submitted, scoring runs with these overrides.
   */
  pendingAceChoices: Record<PlayerId, Record<string, 1 | 11>>;
  /** Player IDs that hold at least one ace and still owe a choice. */
  playersWithAces: PlayerId[];
}

const initialState: PlayState = {
  round: null,
  playerNames: {},
  usernameByPlayerId: {},
  seating: [],
  humanId: null,
  humanUsername: null,
  dealerId: null,
  mode: 'ai',
  difficulty: 'normal',
  length: 'classic',
  gameOver: false,
  cumulativeTotals: {},
  roundHistory: [],
  thinkingPlayerId: null,
  log: [],
  lastError: null,
  lastRoundResult: null,
  lastEvents: [],
  currentRoundEvents: [],
  nextLogId: 1,
  awaitingAceChoices: false,
  pendingAceChoices: {},
  playersWithAces: [],
};

export const playSlice = createSlice({
  name: 'play',
  initialState,
  reducers: {
    initGame: (
      state,
      action: PayloadAction<{ players: PlaySetupEntry[]; humanIndex: number; difficulty?: Difficulty; length?: GameLength; humanUsername?: string | null; seed?: number }>,
    ) => {
      const { players, humanIndex, difficulty = 'normal', length = 'classic', humanUsername = null, seed } = action.payload;
      const seating: PlayerId[] = players.map(() => nanoid(6));
      const playerNames: Record<PlayerId, string> = {};
      const totals: Record<PlayerId, number> = {};
      players.forEach((p, i) => {
        playerNames[seating[i]] = p.name;
        totals[seating[i]] = 0;
      });
      const humanId = seating[humanIndex] ?? null;
      const dealerId = seating[0];
      state.round = startRound({
        players: players.map((p, i) => ({ id: seating[i], name: p.name, isBot: p.isBot })),
        dealerId,
        seed,
      });
      state.playerNames = playerNames;
      state.usernameByPlayerId = {};
      state.seating = seating;
      state.humanId = humanId;
      state.humanUsername = humanUsername;
      state.dealerId = dealerId;
      state.mode = 'ai';
      state.difficulty = difficulty;
      state.length = length;
      state.gameOver = false;
      state.cumulativeTotals = totals;
      state.roundHistory = [];
      state.thinkingPlayerId = null;
      state.log = [];
      state.lastError = null;
      state.lastRoundResult = null;
      state.lastEvents = [];
      state.currentRoundEvents = [];
      state.nextLogId = 1;
      state.awaitingAceChoices = false;
      state.pendingAceChoices = {};
      state.playersWithAces = [];
    },

    /**
     * Initialise a Play vs Friends game. All participants are humans; seating
     * is provided externally by the host so every device computes the same
     * order. The local device's `humanId` is the entry whose username matches
     * `humanUsername`.
     */
    initFriendsGame: (
      state,
      action: PayloadAction<{
        seating: PlayerId[];
        playerNames: Record<PlayerId, string>;
        usernameByPlayerId: Record<PlayerId, string>;
        humanUsername: string;
        length: GameLength;
        seed?: number;
      }>,
    ) => {
      const {
        seating,
        playerNames,
        usernameByPlayerId,
        humanUsername,
        length,
        seed,
      } = action.payload;
      const totals: Record<PlayerId, number> = {};
      seating.forEach((id) => {
        totals[id] = 0;
      });
      const dealerId = seating[0] ?? null;
      const humanId =
        seating.find((id) => usernameByPlayerId[id] === humanUsername) ?? null;
      state.round = dealerId
        ? startRound({
            players: seating.map((id) => ({
              id,
              name: playerNames[id] ?? id,
              isBot: false,
            })),
            dealerId,
            seed,
          })
        : null;
      state.playerNames = { ...playerNames };
      state.seating = [...seating];
      state.humanId = humanId;
      state.humanUsername = humanUsername;
      state.dealerId = dealerId;
      state.mode = 'friends';
      state.usernameByPlayerId = { ...usernameByPlayerId };
      // 'normal' is unused for vs-friends but required by the slice shape.
      state.difficulty = 'normal';
      state.length = length;
      state.gameOver = false;
      state.cumulativeTotals = totals;
      state.roundHistory = [];
      state.thinkingPlayerId = null;
      state.log = [];
      state.lastError = null;
      state.lastRoundResult = null;
      state.lastEvents = [];
      state.currentRoundEvents = [];
      state.nextLogId = 1;
      state.awaitingAceChoices = false;
      state.pendingAceChoices = {};
      state.playersWithAces = [];
    },

    submitAction: (state, action: PayloadAction<PlayAction>) => {
      if (!state.round) return;
      const result = applyAction(state.round, action.payload);
      if (result.error) {
        state.lastError = result.error;
        return;
      }
      state.lastError = null;
      state.round = result.state;
      state.lastEvents = result.events;
      state.currentRoundEvents.push(...result.events);
      for (const ev of result.events) {
        const msg = formatEvent(ev, state.playerNames);
        if (msg) {
          state.log.push({ id: state.nextLogId++, message: msg });
        }
      }
      // Cap log length to avoid unbounded growth.
      if (state.log.length > 40) state.log.splice(0, state.log.length - 40);

      // If the round just ended, check for aces before scoring.
      if (state.round.phase === 'ended' && state.round.callerId) {
        // The caller's pointsAdded is always 0 (yasat) or 35 (owned),
        // independent of hand value, so skip their ace choice.
        const callerId = state.round.callerId;
        const withAces = state.round.players
          .filter((p) => p.id !== callerId && p.hand.some((c) => c.rank === 'A'))
          .map((p) => p.id);

        if (withAces.length > 0) {
          // Defer scoring — wait for all ace holders to submit choices.
          state.awaitingAceChoices = true;
          state.pendingAceChoices = {};
          state.playersWithAces = withAces;
          state.thinkingPlayerId = null;
        } else {
          // No aces — score immediately.
          finaliseRoundScoring(state);
        }
      }
    },

    /**
     * Submit one player's ace-value choices. Once every player with aces
     * has submitted, scoring is finalised automatically.
     */
    submitAceChoices: (
      state,
      action: PayloadAction<{ playerId: PlayerId; choices: Record<string, 1 | 11> }>,
    ) => {
      if (!state.awaitingAceChoices) return;
      const { playerId, choices } = action.payload;
      state.pendingAceChoices[playerId] = choices;

      // Check if all players with aces have submitted.
      const allSubmitted = state.playersWithAces.every(
        (id) => id in state.pendingAceChoices,
      );
      if (allSubmitted) {
        finaliseRoundScoring(state, state.pendingAceChoices);
        state.awaitingAceChoices = false;
        state.pendingAceChoices = {};
        state.playersWithAces = [];
      }
    },

    beginNextRound: (state, action: PayloadAction<{ seed?: number } | undefined>) => {
      if (!state.seating.length || !state.dealerId) return;
      state.round = startRound({
        players: state.seating.map((id) => ({
          id,
          name: state.playerNames[id],
          isBot: state.mode === 'ai' ? id !== state.humanId : false,
        })),
        dealerId: state.dealerId,
        seed: action.payload?.seed,
      });
      state.lastError = null;
      state.lastRoundResult = null;
      state.lastEvents = [];
      state.currentRoundEvents = [];
      state.thinkingPlayerId = null;
      state.awaitingAceChoices = false;
      state.pendingAceChoices = {};
      state.playersWithAces = [];
    },

    setThinking: (state, action: PayloadAction<PlayerId | null>) => {
      state.thinkingPlayerId = action.payload;
    },

    markGameOver: (state) => {
      state.gameOver = true;
    },

    clearError: (state) => {
      state.lastError = null;
    },

    clearRoundResult: (state) => {
      state.lastRoundResult = null;
    },

    clearLastEvents: (state) => {
      state.lastEvents = [];
    },

    endGame: () => initialState,
  },
});

function formatEvent(
  ev: import('./engine/round').RoundEvent,
  names: Record<PlayerId, string>,
): string | null {
  const name = (id: PlayerId) => names[id] ?? id;
  switch (ev.type) {
    case 'discarded': {
      const cardStr = (c: { rank: string; suit: string }) =>
        `${c.rank}${suitSymbol(c.suit)}`;
      const shape =
        ev.cards.length === 1
          ? `discarded ${cardStr(ev.cards[0])}`
          : `discarded ${ev.cards.map(cardStr).join(' ')}`;
      return `${name(ev.playerId)} ${shape}`;
    }
    case 'drewFromDeck':
      return `${name(ev.playerId)} drew from deck`;
    case 'drewFromDiscard':
      return `${name(ev.playerId)} took ${ev.card.rank}${suitSymbol(ev.card.suit)}`;
    case 'yasatDeclared':
      return `${name(ev.playerId)} declared YASAT!`;
    case 'deckReshuffled':
      return 'Deck was reshuffled';
    default:
      return null;
  }
}

function suitSymbol(s: string): string {
  switch (s) {
    case 'spades':
      return '♠';
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
      return '♣';
  }
  return '';
}

/**
 * Shared helper: run scoreRound with optional ace overrides, store results,
 * and update cumulative totals. Called from submitAction (no aces) and
 * submitAceChoices (all ace holders responded).
 */
function finaliseRoundScoring(
  state: PlayState,
  aceChoices?: Record<PlayerId, Record<string, 1 | 11>>,
): void {
  if (!state.round || state.round.phase !== 'ended' || !state.round.callerId) return;
  const outcome = scoreRound({
    state: state.round,
    totalsBefore: state.cumulativeTotals,
    aceChoices,
  });
  const stored: StoredRoundResult = {
    roundIndex: state.roundHistory.length,
    callerId: outcome.callerId,
    callerWon: outcome.callerWon,
    perPlayer: outcome.perPlayer,
  };
  state.roundHistory.push(stored);
  for (const r of outcome.perPlayer) {
    state.cumulativeTotals[r.playerId] = r.newTotal;
  }
  state.lastRoundResult = stored;
  state.dealerId = outcome.callerWon ? outcome.callerId : state.dealerId;
  state.thinkingPlayerId = null;
}

export const {
  initGame,
  initFriendsGame,
  submitAction,
  submitAceChoices,
  beginNextRound,
  setThinking,
  markGameOver,
  clearError,
  clearRoundResult,
  clearLastEvents,
  endGame,
} = playSlice.actions;

export default playSlice.reducer;

// Selectors
export const selectPlayState = (s: RootState): PlayState => s.play;
export const selectPlayRound = (s: RootState) => s.play.round;
export const selectPlayCurrentPlayerId = (s: RootState): PlayerId | null => {
  const r = s.play.round;
  if (!r) return null;
  return r.players[r.currentPlayerIndex]?.id ?? null;
};
export const selectPlayHumanId = (s: RootState) => s.play.humanId;
export const selectPlayHumanUsername = (s: RootState) => s.play.humanUsername;
export const selectPlayTotals = (s: RootState) => s.play.cumulativeTotals;
export const selectPlayCumulativeTotals = (s: RootState) =>
  s.play.cumulativeTotals;
export const selectPlayNames = (s: RootState) => s.play.playerNames;
export const selectPlayLastError = (s: RootState) => s.play.lastError;
export const selectPlayLastRoundResult = (s: RootState) => s.play.lastRoundResult;
export const selectPlayLog = (s: RootState) => s.play.log;
export const selectPlayLastEvents = (s: RootState) => s.play.lastEvents;
export const selectPlayCurrentRoundEvents = (s: RootState) => s.play.currentRoundEvents;
export const selectPlayLength = (s: RootState) => s.play.length;
export const selectPlayMode = (s: RootState) => s.play.mode;
export const selectPlayGameOver = (s: RootState) => s.play.gameOver;
export const selectAwaitingAceChoices = (s: RootState) => s.play.awaitingAceChoices;
export const selectPlayersWithAces = (s: RootState) => s.play.playersWithAces;
export const selectPendingAceChoices = (s: RootState) => s.play.pendingAceChoices;
