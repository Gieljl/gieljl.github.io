import { configureStore, ThunkAction, Action, combineReducers } from '@reduxjs/toolkit';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import statsReducer from '../features/stats/statsSlice';
import gameReducer from '../features/game/gameSlice';
import playReducer from '../features/play/playSlice';
import undoable, { ActionCreators } from 'redux-undo';
import {
  persistReducer,
  persistStore,
  createMigrate,
  PersistedState,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const reducers = combineReducers({
  scores: undoable(scoresReducer),
  players: playersReducer,
  game: gameReducer,
  stats: statsReducer,
  play: playReducer,
});

/**
 * Bump `PERSIST_VERSION` whenever the persisted state shape changes in a way
 * that older clients' storage cannot satisfy. The matching migration should
 * repair the state (or return `undefined` to force a fresh initial state).
 */
const PERSIST_VERSION = 6;

type PersistedRootState = PersistedState &
  Record<string, any>;

const migrations: Record<number, (state: any) => any> = {
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
        mode: (state.game as any)?.mode ?? 'unranked',
      },
    } as PersistedRootState;
  },
  // v2: renamed game.mode → game.type, game.type → game.view.
  // The old game.type value 'ranked' becomes 'new'.
  2: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    const oldGame = state.game as any;
    const oldType = oldGame?.type as string | undefined;  // was 'classic' | 'ranked'
    const oldMode = oldGame?.mode as string | undefined;  // was 'unranked' | 'ranked'
    return {
      ...state,
      game: {
        status: 'home',
        view: oldType === 'ranked' ? 'new' : (oldType === 'classic' ? 'classic' : 'new'),
        type: oldMode ?? 'unranked',
      },
    } as PersistedRootState;
  },
  // v3: introduced the 'play' game type + view. If a previously-persisted
  // state somehow carries those values it's fine; otherwise snap invalid
  // values back to a safe default and always land on home.
  3: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    const g = (state.game as any) ?? {};
    const allowedTypes = ['unranked', 'ranked', 'play'];
    const allowedViews = ['classic', 'new', 'play'];
    return {
      ...state,
      game: {
        status: 'home',
        view: allowedViews.includes(g.view) ? g.view : 'new',
        type: allowedTypes.includes(g.type) ? g.type : 'unranked',
      },
    } as PersistedRootState;
  },
  // v4: introduced game.length (bo10 / firstTo10 / classic). Default to
  // 'classic' for any persisted state missing it.
  4: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    const g = (state.game as any) ?? {};
    const allowedLengths = ['bo10', 'firstTo10', 'classic'];
    return {
      ...state,
      game: {
        ...g,
        length: allowedLengths.includes(g.length) ? g.length : 'classic',
      },
    } as PersistedRootState;
  },
  // v5: introduced 'play-friends' game.type. Reset to home so any in-progress
  // friends game from a partial persisted shape doesn't render an empty view.
  5: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    const g = (state.game as any) ?? {};
    const allowedTypes = ['unranked', 'ranked', 'play', 'play-friends'];
    return {
      ...state,
      game: {
        ...g,
        status: 'home',
        type: allowedTypes.includes(g.type) ? g.type : 'unranked',
      },
    } as PersistedRootState;
  },
  // v6: removed all online features (login, shared games, leaderboards,
  // ranked and play-vs-friends). Drop the stale identity/session slices and
  // map the removed game types back to the local score tracker.
  6: (state: PersistedRootState | undefined): PersistedRootState | undefined => {
    if (!state) return state;
    const { identity, session, playFriends, ...rest } = state as any;
    const g = (rest.game as any) ?? {};
    const allowedTypes = ['unranked', 'play'];
    return {
      ...rest,
      game: {
        ...g,
        status: 'home',
        view: g.type === 'ranked' ? 'new' : g.view,
        type: allowedTypes.includes(g.type) ? g.type : 'unranked',
      },
    } as PersistedRootState;
  },
};

const persistConfig = {
  // Avoid spurious timeout errors during slower startup / StrictMode double init.
  timeout: 0,
  key: 'root',
  storage,
  version: PERSIST_VERSION,
  migrate: createMigrate(migrations, { debug: false }),
  blacklist: ['play'], // play games are transient — don't persist
};
const persistedReducer = persistReducer(persistConfig, reducers);


export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredActionPaths: ['err'],
      },
    }),
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
