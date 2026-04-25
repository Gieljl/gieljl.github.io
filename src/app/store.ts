import { configureStore, ThunkAction, Action, combineReducers } from '@reduxjs/toolkit';
import scoresReducer from '../features/game/scoreSlice';
import playersReducer from '../features/players/playersSlice';
import statsReducer from '../features/stats/statsSlice';
import gameReducer from '../features/game/gameSlice';
import identityReducer from '../features/identity/identitySlice';
import sessionReducer from '../features/session/sessionSlice';
import playReducer from '../features/play/playSlice';
import playFriendsReducer from '../features/playFriends/playFriendsSlice';
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

/**
 * Action type dispatched by viewers to replace the full game state in one shot.
 * Handled by the root reducer wrapper below.
 */
export const HYDRATE_FROM_SESSION = 'session/hydrateFromSession';

/**
 * Action type dispatched by guests in a Play vs Friends session to replace
 * play-slice state from the host's Firestore session document.
 */
export const HYDRATE_PLAY_FROM_FRIENDS_SESSION =
  'playFriends/hydratePlayFromSession';

const combinedReducers = combineReducers({
  scores: undoable(scoresReducer),
  players: playersReducer,
  game: gameReducer,
  stats: statsReducer,
  identity: identityReducer,
  session: sessionReducer,
  play: playReducer,
  playFriends: playFriendsReducer,
});

/**
 * Root reducer wrapper that intercepts HYDRATE_FROM_SESSION to atomically
 * replace players, scores (including undo history), stats, and game state
 * from the host's Firestore session document.
 */
const reducers: typeof combinedReducers = (state, action) => {
  if (action.type === HYDRATE_FROM_SESSION) {
    const payload = action.payload as {
      players: any;
      scores: { present: any; past: any[] };
      stats: any;
      game: any;
    };
    return {
      ...combinedReducers(state, action),
      players: payload.players,
      scores: {
        past: payload.scores.past,
        present: payload.scores.present,
        future: [],
        _latestUnfilteredState: payload.scores.present,
        group: null,
        index: payload.scores.past.length,
        limit: 1,
      },
      stats: payload.stats,
      game: payload.game,
    };
  }
  if (action.type === HYDRATE_PLAY_FROM_FRIENDS_SESSION) {
    const payload = action.payload as {
      round: any;
      seating: string[];
      playerNames: Record<string, string>;
      usernameByPlayerId: Record<string, string>;
      humanId: string | null;
      humanUsername: string | null;
      cumulativeTotals: Record<string, number>;
      roundHistory: any[];
      log: any[];
      lastEvents: any[];
      gameOver: boolean;
      length: 'bo10' | 'firstTo10';
      dealerId: string | null;
    };
    const next = combinedReducers(state, action);
    return {
      ...next,
      play: {
        ...next.play,
        round: payload.round,
        seating: payload.seating,
        playerNames: payload.playerNames,
        usernameByPlayerId: payload.usernameByPlayerId,
        humanId: payload.humanId,
        humanUsername: payload.humanUsername,
        dealerId: payload.dealerId,
        length: payload.length,
        mode: 'friends',
        cumulativeTotals: payload.cumulativeTotals,
        roundHistory: payload.roundHistory,
        log: payload.log,
        lastEvents: payload.lastEvents,
        gameOver: payload.gameOver,
      },
    };
  }
  return combinedReducers(state, action);
};

/**
 * Bump `PERSIST_VERSION` whenever the persisted state shape changes in a way
 * that older clients' storage cannot satisfy. The matching migration should
 * repair the state (or return `undefined` to force a fresh initial state).
 */
const PERSIST_VERSION = 5;

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
};

const persistConfig = {
  // Avoid spurious timeout errors during slower startup / StrictMode double init.
  timeout: 0,
  key: 'root',
  storage,
  version: PERSIST_VERSION,
  migrate: createMigrate(migrations, { debug: false }),
  blacklist: ['session', 'play', 'playFriends'], // sessions, play, and friends sessions are transient — don't persist
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
