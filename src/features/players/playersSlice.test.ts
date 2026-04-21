import playerSlice, {
  addPlayer,
  removePlayer,
  resetPlayers,
  player,
} from './playersSlice';

describe('playerSlice', () => {
  const initialState: player[] = [];

  describe('initial state', () => {
    it('should have an empty initial state', () => {
      const state = playerSlice(undefined, { type: 'unknown' });
      expect(state).toEqual([]);
    });
  });

  describe('addPlayer', () => {
    it('should add a single player', () => {
      const state = playerSlice(initialState, addPlayer('Alice', '#FF0000'));
      expect(state).toHaveLength(1);
      expect(state[0].name).toBe('Alice');
      expect(state[0].color).toBe('#FF0000');
      expect(typeof state[0].id).toBe('number');
    });

    it('should increment player ID for each new player', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      const firstId = state[0].id;

      state = playerSlice(state, addPlayer('Bob', '#00FF00'));
      const secondId = state[1].id;

      state = playerSlice(state, addPlayer('Charlie', '#0000FF'));
      const thirdId = state[2].id;

      expect(state).toHaveLength(3);
      expect(secondId).toBe(firstId + 1);
      expect(thirdId).toBe(secondId + 1);
    });

    it('should handle multiple players with different colors', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      const firstId = state[0].id;

      state = playerSlice(state, addPlayer('Bob', '#00FF00'));
      state = playerSlice(state, addPlayer('Charlie', '#0000FF'));

      expect(state).toHaveLength(3);
      expect(state[0]).toEqual({ id: firstId, name: 'Alice', color: '#FF0000' });
      expect(state[1]).toEqual({ id: firstId + 1, name: 'Bob', color: '#00FF00' });
      expect(state[2]).toEqual({ id: firstId + 2, name: 'Charlie', color: '#0000FF' });
    });
  });

  describe('removePlayer', () => {
    it('should remove a player by ID', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));
      state = playerSlice(state, addPlayer('Charlie', '#0000FF'));

      const bobId = state[1].id;
      state = playerSlice(state, removePlayer(bobId));

      expect(state).toHaveLength(2);
      expect(state[0].name).toBe('Alice');
      expect(state[1].name).toBe('Charlie');
    });

    it('should handle removing the first player', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));

      const aliceId = state[0].id;
      state = playerSlice(state, removePlayer(aliceId));

      expect(state).toHaveLength(1);
      expect(state[0].name).toBe('Bob');
    });

    it('should handle removing the last player', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));

      const bobId = state[1].id;
      state = playerSlice(state, removePlayer(bobId));

      expect(state).toHaveLength(1);
      expect(state[0].name).toBe('Alice');
    });

    it('should work correctly with non-sequential removals', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));
      state = playerSlice(state, addPlayer('Charlie', '#0000FF'));
      state = playerSlice(state, addPlayer('David', '#FFFF00'));

      const aliceId = state[0].id;
      const charlieId = state[2].id;

      state = playerSlice(state, removePlayer(aliceId));
      state = playerSlice(state, removePlayer(charlieId));

      expect(state).toHaveLength(2);
      expect(state[0].name).toBe('Bob');
      expect(state[1].name).toBe('David');
    });
  });

  describe('resetPlayers', () => {
    it('should reset players to empty array', () => {
      let state = initialState;
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));

      expect(state).toHaveLength(2);

      state = playerSlice(state, resetPlayers());

      expect(state).toEqual([]);
    });

    it('should work when called on already empty state', () => {
      let state = initialState;
      state = playerSlice(state, resetPlayers());
      expect(state).toEqual([]);
    });
  });

  describe('player management flow', () => {
    it('should support adding, removing, and resetting players', () => {
      let state = initialState;

      // Add players
      state = playerSlice(state, addPlayer('Alice', '#FF0000'));
      state = playerSlice(state, addPlayer('Bob', '#00FF00'));
      state = playerSlice(state, addPlayer('Charlie', '#0000FF'));
      expect(state).toHaveLength(3);

      // Remove a player
      const bobId = state.find((p) => p.name === 'Bob')?.id;
      state = playerSlice(state, removePlayer(bobId!));
      expect(state).toHaveLength(2);
      expect(state.find((p) => p.name === 'Bob')).toBeUndefined();

      // Reset all players
      state = playerSlice(state, resetPlayers());
      expect(state).toEqual([]);
    });
  });
});
