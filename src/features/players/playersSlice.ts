import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState} from '../../app/store';
import { v4 as uuidv4 } from "uuid";

export type player = {
  id: string;
  name: string;
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
          name
        } as player,
      })
    },
    removePlayer(state, action: PayloadAction<string>) {
      const index = state.findIndex((player) => player.id === action.payload);
      state.splice(index, 1);
    },
    resetPlayers() {
      return initialState;
    }
  },

});

export const { addPlayer, removePlayer, resetPlayers } = playerSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`
export const selectPlayers = (state: RootState) => state.players;

// export const selectPlayersWithHistory = (state: RootState) => state.players;

// We can also write thunks by hand, which may contain both sync and async logic.
// Here's an example of conditionally dispatching actions based on current state.


export default playerSlice.reducer;
