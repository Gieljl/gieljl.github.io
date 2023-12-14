import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import gameReducer from '../features/game/gameSlice';
import undoable from 'redux-undo';



export const store = configureStore({
  reducer: {
    counter: counterReducer,
    scores: undoable(scoresReducer),
    players: undoable(playersReducer),
    game: gameReducer
  },
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
