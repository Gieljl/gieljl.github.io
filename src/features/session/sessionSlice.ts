import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';

export interface SessionState {
  role: 'host' | 'viewer' | null;
  sessionCode: string | null;
  isSharing: boolean;
  error: string | null;
}

const initialState: SessionState = {
  role: null,
  sessionCode: null,
  isSharing: false,
  error: null,
};

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setRole: (state, action: PayloadAction<'host' | 'viewer' | null>) => {
      state.role = action.payload;
    },
    setSessionCode: (state, action: PayloadAction<string | null>) => {
      state.sessionCode = action.payload;
    },
    setSharing: (state, action: PayloadAction<boolean>) => {
      state.isSharing = action.payload;
    },
    setSessionError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearSession: () => initialState,
  },
});

export const { setRole, setSessionCode, setSharing, setSessionError, clearSession } =
  sessionSlice.actions;

export const selectSession = (state: RootState) => state.session;
export const selectSessionRole = (state: RootState) => state.session.role;
export const selectSessionCode = (state: RootState) => state.session.sessionCode;
export const selectIsSharing = (state: RootState) => state.session.isSharing;

export default sessionSlice.reducer;
