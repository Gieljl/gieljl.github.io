import { configureStore, ThunkAction, Action, combineReducers } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import statsReducer from '../features/stats/statsSlice';
import gameReducer from '../features/game/gameSlice';
import undoable, { ActionCreators } from 'redux-undo';
import { persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const reducers = combineReducers({
  counter: counterReducer,
  scores: undoable(scoresReducer),
  players: playersReducer,
  game: gameReducer,
  stats: statsReducer
});

const persistConfig = {
  timeout: 1000, //Set the timeout function to 2 seconds
  key: 'root',
  storage
};
const persistedReducer = persistReducer(persistConfig, reducers);


export const store = configureStore({
  reducer: persistedReducer,
  // devTools: process.env.NODE_ENV !== 'production'
});

export const persistor = persistStore(store, null, () => {
  // This callback is called after rehydration is finished
  store.dispatch(ActionCreators.undo()); 
  store.dispatch(ActionCreators.redo()); 

});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
