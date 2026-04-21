import { configureStore, ThunkAction, Action, combineReducers } from '@reduxjs/toolkit';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import statsReducer from '../features/stats/statsSlice';
import gameReducer from '../features/game/gameSlice';
import identityReducer from '../features/identity/identitySlice';
import undoable, { ActionCreators } from 'redux-undo';
import {
  persistReducer,
  persistStore,
  createMigrate,
  PersistedState,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const reducers = combineReducers({
  scores: undoable(scoresReducer),
  players: playersReducer,
  game: gameReducer,
  stats: statsReducer,
  identity: identityReducer,
});

/**
 * Bump `PERSIST_VERSION` whenever the persisted state shape changes in a way
 * that older clients' storage cannot satisfy. The matching migration should
 * repair the state (or return `undefined` to force a fresh initial state).
 */
const PERSIST_VERSION = 1;

type PersistedRootState = PersistedState &
  Partial<ReturnType<typeof reducers>>;

const migrations = {
  // v1: introduced 'home' status and game.mode. Reset users back to the
  // new home screen so they see the new landing page instead of a blank
  // screen when their persisted state is missing `game.mode`.
  1: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    return {
      ...state,
      game: {
        status: 'home',
        type: state.game?.type ?? 'ranked',
        mode: state.game?.mode ?? 'unranked',
      },
    } as PersistedRootState;
  },
};

const persistConfig = {
  timeout: 1000, //Set the timeout function to 1 seconds
  key: 'root',
  storage,
  version: PERSIST_VERSION,
  migrate: createMigrate(migrations, { debug: false }),
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
