import scoreSlice, {
  addScores,
  setStartScores,
  resetScores,
  playerScore,
  ScoreState,
} from './scoreSlice';
import { player } from '../players/playersSlice';

describe('scoreSlice', () => {
  const initialState: ScoreState = {
    playerscores: [],
  };

  describe('initial state', () => {
    it('should have an empty initial state', () => {
      const state = scoreSlice(initialState, { type: 'unknown' });
      expect(state.playerscores).toEqual([]);
    });
  });

  describe('setStartScores', () => {
    it('should initialize scores for players at 0 with no stats', () => {
      const players: player[] = [
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ];

      const state = scoreSlice(initialState, setStartScores(players));

      expect(state.playerscores).toHaveLength(2);
      expect(state.playerscores[0]).toEqual({
        id: 1,
        score: 0,
        stats: [],
        yasatStreak: 0,
      });
      expect(state.playerscores[1]).toEqual({
        id: 2,
        score: 0,
        stats: [],
        yasatStreak: 0,
      });
    });

    it('should handle multiple players', () => {
      const players: player[] = [
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
        { id: 3, name: 'Charlie', color: '#0000FF' },
        { id: 4, name: 'David', color: '#FFFF00' },
      ];

      const state = scoreSlice(initialState, setStartScores(players));

      expect(state.playerscores).toHaveLength(4);
      expect(state.playerscores.every((ps) => ps.score === 0)).toBe(true);
      expect(state.playerscores.every((ps) => ps.yasatStreak === 0)).toBe(true);
      expect(state.playerscores.every((ps) => ps.stats.length === 0)).toBe(true);
    });

    it('should preserve player IDs', () => {
      const players: player[] = [
        { id: 5, name: 'Alice', color: '#FF0000' },
        { id: 10, name: 'Bob', color: '#00FF00' },
        { id: 15, name: 'Charlie', color: '#0000FF' },
      ];

      const state = scoreSlice(initialState, setStartScores(players));

      expect(state.playerscores[0].id).toBe(5);
      expect(state.playerscores[1].id).toBe(10);
      expect(state.playerscores[2].id).toBe(15);
    });
  });

  describe('addScores', () => {
    it('should replace all scores with new scores', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ]));

      const newScores: playerScore[] = [
        {
          id: 1,
          score: 10,
          stats: [{ name: 'Yasat' }],
          yasatStreak: 1,
        },
        {
          id: 2,
          score: 5,
          stats: [],
          yasatStreak: 0,
        },
      ];

      state = scoreSlice(state, addScores(newScores));

      expect(state.playerscores).toEqual(newScores);
      expect(state.playerscores[0].score).toBe(10);
      expect(state.playerscores[0].stats).toHaveLength(1);
      expect(state.playerscores[1].score).toBe(5);
    });

    it('should handle stats correctly', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
      ]));

      const newScores: playerScore[] = [
        {
          id: 1,
          score: 35,
          stats: [
            { name: 'Yasat' },
            { name: 'Owned' },
            { name: 'Multi-owned' },
          ],
          yasatStreak: 1,
        },
      ];

      state = scoreSlice(state, addScores(newScores));

      expect(state.playerscores[0].stats).toHaveLength(3);
      expect(state.playerscores[0].stats[0].name).toBe('Yasat');
      expect(state.playerscores[0].stats[1].name).toBe('Owned');
      expect(state.playerscores[0].stats[2].name).toBe('Multi-owned');
    });

    it('should track yasat streak', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
      ]));

      const newScores: playerScore[] = [
        {
          id: 1,
          score: 10,
          stats: [{ name: 'Yasat' }],
          yasatStreak: 3,
        },
      ];

      state = scoreSlice(state, addScores(newScores));

      expect(state.playerscores[0].yasatStreak).toBe(3);
    });
  });

  describe('resetScores', () => {
    it('should reset scores to initial empty state', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ]));

      expect(state.playerscores).toHaveLength(2);

      state = scoreSlice(state, resetScores());

      expect(state.playerscores).toEqual([]);
    });

    it('should work when called on already empty state', () => {
      let state = scoreSlice(initialState, resetScores());
      expect(state.playerscores).toEqual([]);
    });
  });

  describe('score progression flow', () => {
    it('should support a complete score progression', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
        { id: 3, name: 'Charlie', color: '#0000FF' },
      ]));

      // Round 1: Alice gets Yasat
      let scores: playerScore[] = [
        { id: 1, score: 0, stats: [{ name: 'Yasat' }], yasatStreak: 1 },
        { id: 2, score: 10, stats: [], yasatStreak: 0 },
        { id: 3, score: 15, stats: [], yasatStreak: 0 },
      ];
      state = scoreSlice(state, addScores(scores));
      expect(state.playerscores[0].yasatStreak).toBe(1);
      expect(state.playerscores[0].score).toBe(0);

      // Round 2: Bob gets Yasat (Alice loses streak)
      scores = [
        { id: 1, score: 10, stats: [], yasatStreak: 0 },
        { id: 2, score: 0, stats: [{ name: 'Yasat' }], yasatStreak: 1 },
        { id: 3, score: 15, stats: [], yasatStreak: 0 },
      ];
      state = scoreSlice(state, addScores(scores));
      expect(state.playerscores[1].yasatStreak).toBe(1);
      expect(state.playerscores[0].yasatStreak).toBe(0);
    });
  });

  describe('Yasat game mechanics', () => {
    it('should handle owned scores correctly', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ]));

      const scores: playerScore[] = [
        {
          id: 1,
          score: 35, // Owned score (Yasat + 1 owned)
          stats: [
            { name: 'Yasat' },
            { name: 'Owned' },
          ],
          yasatStreak: 1,
        },
        {
          id: 2,
          score: 0, // Owned by Alice
          stats: [{ name: 'Own' }],
          yasatStreak: 0,
        },
      ];

      state = scoreSlice(state, addScores(scores));

      expect(state.playerscores[0].score).toBe(35);
      expect(state.playerscores[0].stats).toContainEqual({ name: 'Owned' });
      expect(state.playerscores[1].score).toBe(0);
      expect(state.playerscores[1].stats).toContainEqual({ name: 'Own' });
    });

    it('should handle kills correctly', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ]));

      const scores: playerScore[] = [
        {
          id: 1,
          score: 5, // Yasat score
          stats: [
            { name: 'Yasat' },
            { name: 'Kill' },
          ],
          yasatStreak: 1,
        },
        {
          id: 2,
          score: 0, // Death (> 100 original)
          stats: [{ name: 'Death' }],
          yasatStreak: 0,
        },
      ];

      state = scoreSlice(state, addScores(scores));

      expect(state.playerscores[0].stats).toContainEqual({ name: 'Kill' });
      expect(state.playerscores[1].stats).toContainEqual({ name: 'Death' });
    });

    it('should handle contra-own correctly', () => {
      let state = scoreSlice(initialState, setStartScores([
        { id: 1, name: 'Alice', color: '#FF0000' },
        { id: 2, name: 'Bob', color: '#00FF00' },
      ]));

      const scores: playerScore[] = [
        {
          id: 1,
          score: 20,
          stats: [
            { name: 'Nullify 50' },
            { name: 'Contra-own 50' },
          ],
          yasatStreak: 0,
        },
        {
          id: 2,
          score: 0,
          stats: [{ name: 'Enable 50' }],
          yasatStreak: 0,
        },
      ];

      state = scoreSlice(state, addScores(scores));

      expect(state.playerscores[0].stats).toContainEqual(
        { name: 'Contra-own 50' }
      );
    });
  });
});
