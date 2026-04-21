import gameSlice, {
  startGame,
  startNewGame,
  setGameType,
} from './gameSlice';
import { GameState } from './gameSlice';

describe('gameSlice', () => {
  const initialState: GameState = {
    status: 'home',
    type: 'ranked',
    mode: 'unranked',
  };

  describe('initial state', () => {
    it('should have the correct initial state', () => {
      const state = gameSlice(undefined, { type: 'unknown' });
      expect(state).toEqual(initialState);
    });
  });

  describe('startGame', () => {
    it('should change status from "new" to "started"', () => {
      const state = gameSlice(initialState, startGame());
      expect(state.status).toBe('started');
    });

    it('should preserve the game type', () => {
      const state = gameSlice(initialState, startGame());
      expect(state.type).toBe('ranked');
    });

    it('should work when game type is classic', () => {
      const classicState: GameState = { status: 'new', type: 'classic', mode: 'unranked' };
      const state = gameSlice(classicState, startGame());
      expect(state.status).toBe('started');
      expect(state.type).toBe('classic');
    });
  });

  describe('startNewGame', () => {
    it('should reset status to "new"', () => {
      const startedState: GameState = { status: 'started', type: 'ranked', mode: 'unranked' };
      const state = gameSlice(startedState, startNewGame());
      expect(state.status).toBe('new');
    });

    it('should preserve the game type when resetting', () => {
      const startedState: GameState = { status: 'started', type: 'classic', mode: 'unranked' };
      const state = gameSlice(startedState, startNewGame());
      expect(state.status).toBe('new');
      expect(state.type).toBe('classic');
    });
  });

  describe('setGameType', () => {
    it('should change game type to classic', () => {
      const state = gameSlice(initialState, setGameType('classic'));
      expect(state.type).toBe('classic');
    });

    it('should change game type to ranked', () => {
      const classicState: GameState = { status: 'new', type: 'classic', mode: 'unranked' };
      const state = gameSlice(classicState, setGameType('ranked'));
      expect(state.type).toBe('ranked');
    });

    it('should preserve the status when changing type', () => {
      const startedState: GameState = { status: 'started', type: 'ranked', mode: 'unranked' };
      const state = gameSlice(startedState, setGameType('classic'));
      expect(state.status).toBe('started');
      expect(state.type).toBe('classic');
    });
  });

  describe('game flow', () => {
    it('should support a complete game flow', () => {
      let state = initialState;

      // Move from home to new
      state = gameSlice(state, startNewGame());
      expect(state.status).toBe('new');

      // Set to classic
      state = gameSlice(state, setGameType('classic'));
      expect(state.type).toBe('classic');
      expect(state.status).toBe('new');

      // Start the game
      state = gameSlice(state, startGame());
      expect(state.status).toBe('started');
      expect(state.type).toBe('classic');

      // Start a new game
      state = gameSlice(state, startNewGame());
      expect(state.status).toBe('new');
      expect(state.type).toBe('classic');
    });
  });
});
