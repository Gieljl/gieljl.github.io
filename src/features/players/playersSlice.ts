import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState} from '../../app/store';
import { v4 as uuidv4 } from "uuid";

export type player = {
  id: string;
  name: string;
  roundScores: roundScores[];
  score: number;
  yasat: number;
  yasatStreak: number;
  kill: number;
  ge0wned: number;
  nullify50: number;
  nullify100: number;
  enable50: number;
  enable100: number;
  contraOwn50: number;
  contraOwn100: number;
  fth: number;
  ftph: number;
  doubleKill: number;
  multiKill: number;
  megaKill: number;
  monsterKill: number;
}

export type roundScores = {
  round: number;
  score: number;
}

const initialState = [] as player[] 

export const playerSlice = createSlice({
  name: 'players',
  initialState,
  // The `reducers` field lets us define reducers and generate associated actions
  reducers: {
    addPlayer: {
      reducer: (state, action: PayloadAction<player>) => {
        state.push(action.payload);
      },
      prepare: (name: string) => ({
        payload: {
          id: uuidv4(),
          name,
          roundScores: [{round:0, score:0}],
          score: 0,
          yasat: 0,
          yasatStreak: 0,
          kill: 0,
          ge0wned: 0,
          nullify50: 0,
          nullify100: 0,
          enable50: 0,
          enable100: 0,
          contraOwn50: 0,
          contraOwn100: 0,
          fth: 0,
          ftph: 0,
          doubleKill: 0,
          multiKill: 0,
          megaKill: 0,
          monsterKill: 0,
        } as player,
      })
    },
    removePlayer(state, action: PayloadAction<string>) {
      const index = state.findIndex((player) => player.id === action.payload);
      state.splice(index, 1);
    },
    resetPlayers() {
      return initialState;
    },
    addScore(state, action: PayloadAction<{id: string, score: number}>) {
      const index = state.findIndex((player) => player.id === action.payload.id);
      state[index].score += action.payload.score;
    },
    addRoundScore: {
      reducer: (state, action: PayloadAction<{ id: string; score: number }>) => {
        const { id, score } = action.payload;
        const playerIndex = state.findIndex((player) => player.id === id);

        // Increment the round number and add the new round score
        const newRound = state[playerIndex].roundScores.length;
        state[playerIndex].roundScores.push({ round: newRound, score });

        // Update the total score for the player
        state[playerIndex].score += score;
      },
      prepare: (id: string, score: number) => ({
        payload: { id, score },
      }),
    },
    addYasat(state, action: PayloadAction<{id: string}>) {
      const index = state.findIndex((player) => player.id === action.payload.id);
      state[index].yasat += 1;
    },
  },

});

export const { addPlayer, removePlayer, resetPlayers, addScore, addRoundScore, addYasat } = playerSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`
export const selectPlayers = (state: RootState) => state.players.present;
// export const selectPlayersWithHistory = (state: RootState) => state.players;

// We can also write thunks by hand, which may contain both sync and async logic.
// Here's an example of conditionally dispatching actions based on current state.


export default playerSlice.reducer;
