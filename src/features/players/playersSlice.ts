import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState} from '../../app/store';
import { v4 as uuidv4 } from "uuid";

export interface player {
  id: string;
  name: string;
  score: number;
}


const initialState = [{
  id: '10000',
  name: 'Giel',
  score: 99,
}] as player[] 
// const initialState = [] as player[] 

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
          score: 0,
        } as player,
      })
    },
    removePlayer(state, action: PayloadAction<string>) {
      const index = state.findIndex((player) => player.id === action.payload);
      state.splice(index, 1);
    },
  },

});

export const { addPlayer, removePlayer } = playerSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`
export const selectPlayers = (state: RootState) => state.players;

// We can also write thunks by hand, which may contain both sync and async logic.
// Here's an example of conditionally dispatching actions based on current state.


export default playerSlice.reducer;
