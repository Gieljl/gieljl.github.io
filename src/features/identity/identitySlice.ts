import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';
import {
  checkUsernameExists,
  getSecurityQuestion,
  verifyPlayer,
  registerPlayer,
  PlayerProfile,
} from './playerService';

export interface IdentityState {
  /** The currently verified player, or null if not logged in */
  currentPlayer: PlayerProfile | null;
  /** Loading state for async operations */
  status: 'idle' | 'loading' | 'failed';
  /** Error message from last failed operation */
  error: string | null;
}

const initialState: IdentityState = {
  currentPlayer: null,
  status: 'idle',
  error: null,
};

/** Check if a username is already taken */
export const checkUsername = createAsyncThunk(
  'identity/checkUsername',
  async (username: string) => {
    const exists = await checkUsernameExists(username);
    return { username, exists };
  }
);

/** Get the security question for a returning player */
export const fetchSecurityQuestion = createAsyncThunk(
  'identity/fetchSecurityQuestion',
  async (username: string) => {
    const question = await getSecurityQuestion(username);
    return { username, question };
  }
);

/** Verify a returning player with their security answer */
export const verifyIdentity = createAsyncThunk(
  'identity/verify',
  async ({ username, answer }: { username: string; answer: string }, { rejectWithValue }) => {
    const profile = await verifyPlayer(username, answer);
    if (!profile) {
      return rejectWithValue('Wrong answer. Please try again.');
    }
    return profile;
  }
);

/** Register a brand new player */
export const registerIdentity = createAsyncThunk(
  'identity/register',
  async (
    {
      username,
      displayName,
      securityQuestion,
      securityAnswer,
      color,
    }: {
      username: string;
      displayName: string;
      securityQuestion: string;
      securityAnswer: string;
      color: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const profile = await registerPlayer(
        username,
        displayName,
        securityQuestion,
        securityAnswer,
        color
      );
      return profile;
    } catch (err: unknown) {
      if (err instanceof Error) {
        return rejectWithValue(err.message);
      }
      return rejectWithValue('Registration failed');
    }
  }
);

export const identitySlice = createSlice({
  name: 'identity',
  initialState,
  reducers: {
    logout: (state) => {
      state.currentPlayer = null;
      state.status = 'idle';
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setPlayerColor: (state, action: PayloadAction<string>) => {
      if (state.currentPlayer) {
        state.currentPlayer.color = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    // Verify
    builder
      .addCase(verifyIdentity.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(verifyIdentity.fulfilled, (state, action: PayloadAction<PlayerProfile>) => {
        state.status = 'idle';
        state.currentPlayer = action.payload;
        state.error = null;
      })
      .addCase(verifyIdentity.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Verification failed';
      });
    // Register
    builder
      .addCase(registerIdentity.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerIdentity.fulfilled, (state, action: PayloadAction<PlayerProfile>) => {
        state.status = 'idle';
        state.currentPlayer = action.payload;
        state.error = null;
      })
      .addCase(registerIdentity.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) || 'Registration failed';
      });
  },
});

export const { logout, clearError, setPlayerColor } = identitySlice.actions;

export const selectCurrentPlayer = (state: RootState) => state.identity.currentPlayer;
export const selectIdentityStatus = (state: RootState) => state.identity.status;
export const selectIdentityError = (state: RootState) => state.identity.error;

export default identitySlice.reducer;
