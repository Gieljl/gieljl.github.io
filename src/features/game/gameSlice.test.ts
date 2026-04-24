import gameSlice, {
  startGame,
  startNewGame,
  setGameView,
} from './gameSlice';
import { GameState } from './gameSlice';

describe('gameSlice', () => {
  const initialState: GameState = {
    status: 'home',
    view: 'new',
    type: 'unranked',
    length: 'classic',
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

    it('should preserve the game view', () => {
      const state = gameSlice(initialState, startGame());
      expect(state.view).toBe('new');
    });

    it('should work when game view is classic', () => {
      const classicState: GameState = { status: 'new', view: 'classic', type: 'unranked' };
      const state = gameSlice(classicState, startGame());
      expect(state.status).toBe('started');
      expect(state.view).toBe('classic');
    });
  });

  describe('startNewGame', () => {
    it('should reset status to "new"', () => {
      const startedState: GameState = { status: 'started', view: 'new', type: 'unranked' };
      const state = gameSlice(startedState, startNewGame());
      expect(state.status).toBe('new');
    });

    it('should preserve the game view when resetting', () => {
      const startedState: GameState = { status: 'started', view: 'classic', type: 'unranked' };
      const state = gameSlice(startedState, startNewGame());
      expect(state.status).toBe('new');
      expect(state.view).toBe('classic');
    });
  });

  describe('setGameView', () => {
    it('should change game view to classic', () => {
      const state = gameSlice(initialState, setGameView('classic'));
      expect(state.view).toBe('classic');
    });

    it('should change game view to new', () => {
      const classicState: GameState = { status: 'new', view: 'classic', type: 'unranked' };
      const state = gameSlice(classicState, setGameView('new'));
      expect(state.view).toBe('new');
    });

    it('should preserve the status when changing view', () => {
      const startedState: GameState = { status: 'started', view: 'new', type: 'unranked' };
      const state = gameSlice(startedState, setGameView('classic'));
      expect(state.status).toBe('started');
      expect(state.view).toBe('classic');
    });
  });

  describe('game flow', () => {
    it('should support a complete game flow', () => {
      let state = initialState;

      // Move from home to new
      state = gameSlice(state, startNewGame());
      expect(state.status).toBe('new');

      // Set to classic
      state = gameSlice(state, setGameView('classic'));
      expect(state.view).toBe('classic');
      expect(state.status).toBe('new');

      // Start the game
      state = gameSlice(state, startGame());
      expect(state.status).toBe('started');
      expect(state.view).toBe('classic');

      // Start a new game
      state = gameSlice(state, startNewGame());
      expect(state.status).toBe('new');
      expect(state.view).toBe('classic');
    });
  });
});
