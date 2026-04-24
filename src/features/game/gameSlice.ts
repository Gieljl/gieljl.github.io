import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';


export interface GameState {
  status: 'home' | 'new' | 'started';
  /** Scoring view: 'classic' (points & stats), 'new' (weighted stats), or 'play' (live card game). */
  view: 'classic' | 'new' | 'play';
  /** Game type: 'ranked' (online stats), 'unranked' (local), or 'play' (live NPC game). */
  type: 'unranked' | 'ranked' | 'play';
}

const initialState: GameState = {
  status: 'home',
  view: 'new',
  type: 'unranked',
};


export const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    startGame: (state) => {
      state.status = 'started';
    },
    startNewGame: (state) => {
      state.status = 'new';
    },
    goHome: (state) => {
      state.status = 'home';
    },
    setGameView: (state, action: PayloadAction<'classic' | 'new' | 'play'>) => {
      state.view = action.payload;
    },
    setGameType: (state, action: PayloadAction<'unranked' | 'ranked' | 'play'>) => {
      state.type = action.payload;
      if (action.payload === 'ranked') {
        state.view = 'new';
      } else if (action.payload === 'play') {
        state.view = 'play';
      }
    },
  },
});

export const { startGame, startNewGame, goHome, setGameView, setGameType } =
  gameSlice.actions;

export const selectGameStatus = (state: RootState) => state.game.status;
export const selectGameView = (state: RootState) => state.game.view;
export const selectGameType = (state: RootState) => state.game.type;

export default gameSlice.reducer;
