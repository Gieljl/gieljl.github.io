/**
 * Host-only hook that broadcasts the local play-slice state to Firestore so
 * guests see the same game.
 *
 * - Watches relevant play-slice fields and debounces writes.
 * - Sends a heartbeat every 5 s (used by guests to detect host disconnect).
 * - Cleans up by cancelling the lobby (or ending the game) when the host
 *   navigates away. We do NOT cancel from inside the cleanup if the game
 *   already ended cleanly via `endPlaySession`.
 */
import { useEffect, useRef } from 'react';
import { useAppSelector } from '../../app/hooks';
import {
  selectPlayCumulativeTotals,
  selectPlayGameOver,
  selectPlayLastEvents,
  selectPlayLog,
  selectPlayRound,
} from '../play/playSlice';
import {
  selectPlayFriendsCode,
  selectPlayFriendsRole,
  selectPlayFriendsStatus,
} from './playFriendsSlice';
import {
  pushHostState,
  setHostHeartbeat,
} from './playSessionService';
import type { RootState } from '../../app/store';

const PUSH_DEBOUNCE_MS = 200;
const HEARTBEAT_INTERVAL_MS = 5000;

export function usePlayFriendsHostSync(): void {
  const role = useAppSelector(selectPlayFriendsRole);
  const code = useAppSelector(selectPlayFriendsCode);
  const status = useAppSelector(selectPlayFriendsStatus);
  const round = useAppSelector(selectPlayRound);
  const cumulativeTotals = useAppSelector(selectPlayCumulativeTotals);
  const log = useAppSelector(selectPlayLog);
  const lastEvents = useAppSelector(selectPlayLastEvents);
  const gameOver = useAppSelector(selectPlayGameOver);
  const roundHistory = useAppSelector((s: RootState) => s.play.roundHistory);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstRef = useRef(true);

  // Debounced state push.
  useEffect(() => {
    if (role !== 'host' || !code) return;
    if (status !== 'in-progress') return;
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    if (lastEvents.length > 0) {
      pushHostState(code, {
        round,
        cumulativeTotals,
        roundHistory,
        log,
        lastEvents,
        gameOver,
      }).catch((err) => console.error('host push failed:', err));
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushHostState(code, {
        round,
        cumulativeTotals,
        roundHistory,
        log,
        lastEvents,
        gameOver,
      }).catch((err) => console.error('host push failed:', err));
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [
    role,
    code,
    status,
    round,
    cumulativeTotals,
    roundHistory,
    log,
    lastEvents,
    gameOver,
  ]);

  // Heartbeat.
  useEffect(() => {
    if (role !== 'host' || !code) return;
    const id = window.setInterval(() => {
      setHostHeartbeat(code);
    }, HEARTBEAT_INTERVAL_MS);
    // Fire once immediately so guests see a fresh heartbeat right away.
    setHostHeartbeat(code);
    return () => window.clearInterval(id);
  }, [role, code]);

  // Reset the skip-first guard whenever we (re-)become host or restart.
  useEffect(() => {
    skipFirstRef.current = true;
  }, [role, code]);
}
