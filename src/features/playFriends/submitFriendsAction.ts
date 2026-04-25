/**
 * Thunk that branches the dispatch path for a `PlayAction` based on whether
 * the user is in a Play vs Friends session and what their role is:
 *
 * - Standalone (vs AI / not in a friends session) → dispatch the existing
 *   `submitAction` reducer locally; behaviour unchanged from before.
 * - Friends host → dispatch the existing `submitAction` reducer locally; the
 *   host hook will broadcast the new round to guests.
 * - Friends guest → write an action request to Firestore and let the host
 *   apply it. The reducer is NOT dispatched locally — when the host
 *   broadcasts the new round, the subscription will hydrate it.
 */
import { nanoid } from '@reduxjs/toolkit';
import type { ThunkAction, Action } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import { submitAction } from '../play/playSlice';
import type { PlayAction } from '../play/engine/round';
import { submitActionRequest } from './playSessionService';

export function submitFriendsAction(
  action: PlayAction,
): ThunkAction<Promise<void>, RootState, unknown, Action<string>> {
  return async (dispatch, getState) => {
    const state = getState();
    const role = state.playFriends.role;
    const code = state.playFriends.code;
    const username = state.identity.currentPlayer?.username;
    if (role === 'guest' && code && username) {
      try {
        await submitActionRequest(code, {
          id: nanoid(8),
          fromUsername: username,
          action,
          requestedAt: Date.now(),
        });
      } catch (err) {
        console.error('Failed to submit action request:', err);
      }
      return;
    }
    // host or standalone: apply locally.
    dispatch(submitAction(action));
  };
}
