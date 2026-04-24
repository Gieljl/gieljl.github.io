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
import { PlayAction, PlayerId, RoundState, applyAction, startRound } from './engine/round';
import { PerPlayerRoundResult, scoreRound } from './engine/scoring';

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
  /** Ids in seating order. */
  seating: PlayerId[];
  humanId: PlayerId | null;
  dealerId: PlayerId | null;
  difficulty: Difficulty;
  cumulativeTotals: Record<PlayerId, number>;
  roundHistory: StoredRoundResult[];
  /** Set while the UI is waiting for a bot to move (to render "thinking"). */
  thinkingPlayerId: PlayerId | null;
  log: PlayLogEntry[];
  /** Toast / error message from last rejected action, if any. */
  lastError: string | null;
  /** Present when the round has just ended and the dialog should show. */
  lastRoundResult: StoredRoundResult | null;
  nextLogId: number;
}

const initialState: PlayState = {
  round: null,
  playerNames: {},
  seating: [],
  humanId: null,
  dealerId: null,
  difficulty: 'normal',
  cumulativeTotals: {},
  roundHistory: [],
  thinkingPlayerId: null,
  log: [],
  lastError: null,
  lastRoundResult: null,
  nextLogId: 1,
};

export const playSlice = createSlice({
  name: 'play',
  initialState,
  reducers: {
    initGame: (
      state,
      action: PayloadAction<{ players: PlaySetupEntry[]; humanIndex: number; difficulty?: Difficulty; seed?: number }>,
    ) => {
      const { players, humanIndex, difficulty = 'normal', seed } = action.payload;
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
      state.seating = seating;
      state.humanId = humanId;
      state.dealerId = dealerId;
      state.difficulty = difficulty;
      state.cumulativeTotals = totals;
      state.roundHistory = [];
      state.thinkingPlayerId = null;
      state.log = [];
      state.lastError = null;
      state.lastRoundResult = null;
      state.nextLogId = 1;
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
      for (const ev of result.events) {
        const msg = formatEvent(ev, state.playerNames);
        if (msg) {
          state.log.push({ id: state.nextLogId++, message: msg });
        }
      }
      // Cap log length to avoid unbounded growth.
      if (state.log.length > 40) state.log.splice(0, state.log.length - 40);

      // If the round just ended, compute + store the outcome.
      if (state.round.phase === 'ended' && state.round.callerId) {
        const outcome = scoreRound({
          state: state.round,
          totalsBefore: state.cumulativeTotals,
        });
        const stored: StoredRoundResult = {
          roundIndex: state.roundHistory.length,
          callerId: outcome.callerId,
          callerWon: outcome.callerWon,
          perPlayer: outcome.perPlayer,
        };
        state.roundHistory.push(stored);
        // Update cumulative totals.
        for (const r of outcome.perPlayer) {
          state.cumulativeTotals[r.playerId] = r.newTotal;
        }
        state.lastRoundResult = stored;
        state.dealerId = outcome.callerWon ? outcome.callerId : state.dealerId;
        state.thinkingPlayerId = null;
      }
    },

    beginNextRound: (state, action: PayloadAction<{ seed?: number } | undefined>) => {
      if (!state.seating.length || !state.dealerId) return;
      state.round = startRound({
        players: state.seating.map((id) => ({
          id,
          name: state.playerNames[id],
          isBot: id !== state.humanId,
        })),
        dealerId: state.dealerId,
        seed: action.payload?.seed,
      });
      state.lastError = null;
      state.lastRoundResult = null;
      state.thinkingPlayerId = null;
    },

    setThinking: (state, action: PayloadAction<PlayerId | null>) => {
      state.thinkingPlayerId = action.payload;
    },

    clearError: (state) => {
      state.lastError = null;
    },

    clearRoundResult: (state) => {
      state.lastRoundResult = null;
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
      const shape =
        ev.cards.length === 1
          ? 'discarded'
          : `discarded ${ev.cards.length}×${ev.cards[0].rank}`;
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

export const {
  initGame,
  submitAction,
  beginNextRound,
  setThinking,
  clearError,
  clearRoundResult,
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
export const selectPlayTotals = (s: RootState) => s.play.cumulativeTotals;
export const selectPlayNames = (s: RootState) => s.play.playerNames;
export const selectPlayLastError = (s: RootState) => s.play.lastError;
export const selectPlayLastRoundResult = (s: RootState) => s.play.lastRoundResult;
export const selectPlayLog = (s: RootState) => s.play.log;
