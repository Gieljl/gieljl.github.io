import { configureStore, ThunkAction, Action, combineReducers } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import gameReducer from '../features/game/gameSlice';
import undoable from 'redux-undo';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const reducers = combineReducers({
  counter: counterReducer,
  scores: undoable(scoresReducer),
  players: playersReducer,
  game: gameReducer
});

const persistConfig = {
  key: 'root',
  storage
};
const persistedReducer = persistReducer(persistConfig, reducers);


export const store = configureStore({
  reducer: persistedReducer
  // devTools: process.env.NODE_ENV !== 'production'
});


export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
