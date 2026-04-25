import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';
import type {
  PlayFriendsLength,
  PlayFriendsStatus,
  PlaySessionDocument,
  PlaySessionParticipant,
} from './playSessionService';

export type PlayFriendsRole = 'host' | 'guest';

export interface PlayFriendsState {
  role: PlayFriendsRole | null;
  code: string | null;
  status: PlayFriendsStatus | null;
  hostUsername: string | null;
  length: PlayFriendsLength;
  participants: PlaySessionParticipant[];
  /** Last hostHeartbeatAt seen via subscription. */
  lastHostHeartbeatAt: number | null;
  /** Whether the doc has been observed at least once after subscribing. */
  observed: boolean;
  error: string | null;
}

const initialState: PlayFriendsState = {
  role: null,
  code: null,
  status: null,
  hostUsername: null,
  length: 'bo10',
  participants: [],
  lastHostHeartbeatAt: null,
  observed: false,
  error: null,
};

export const playFriendsSlice = createSlice({
  name: 'playFriends',
  initialState,
  reducers: {
    setRole: (state, action: PayloadAction<PlayFriendsRole | null>) => {
      state.role = action.payload;
    },
    setCode: (state, action: PayloadAction<string | null>) => {
      state.code = action.payload;
    },
    setLength: (state, action: PayloadAction<PlayFriendsLength>) => {
      state.length = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    /** Mirror summary fields from the latest session doc into Redux. */
    hydrateFromSession: (
      state,
      action: PayloadAction<PlaySessionDocument>,
    ) => {
      const d = action.payload;
      state.status = d.status;
      state.hostUsername = d.hostUsername;
      state.length = d.length;
      state.participants = d.participants;
      state.lastHostHeartbeatAt = d.hostHeartbeatAt ?? null;
      state.observed = true;
    },
    clearFriendsSession: () => initialState,
  },
});

export const {
  setRole,
  setCode,
  setLength,
  setError,
  hydrateFromSession,
  clearFriendsSession,
} = playFriendsSlice.actions;

export default playFriendsSlice.reducer;

export const selectPlayFriendsState = (s: RootState) => s.playFriends;
export const selectPlayFriendsRole = (s: RootState) => s.playFriends.role;
export const selectPlayFriendsCode = (s: RootState) => s.playFriends.code;
export const selectPlayFriendsStatus = (s: RootState) => s.playFriends.status;
export const selectPlayFriendsParticipants = (s: RootState) =>
  s.playFriends.participants;
export const selectPlayFriendsHostUsername = (s: RootState) =>
  s.playFriends.hostUsername;
export const selectPlayFriendsLength = (s: RootState) => s.playFriends.length;
export const selectPlayFriendsError = (s: RootState) => s.playFriends.error;
