import { useEffect, useRef } from 'react';
import { useAppSelector } from '../../app/hooks';
import { selectIsSharing, selectSessionCode } from './sessionSlice';
import { updateSession } from './sessionService';
import { RootState } from '../../app/store';

/**
 * Hook that runs on the host device. When sharing is active, it syncs the
 * current Redux game state to the Firestore session document whenever any
 * relevant state changes.
 */
export function useSessionSync() {
  const isSharing = useAppSelector(selectIsSharing);
  const sessionCode = useAppSelector(selectSessionCode);
  const players = useAppSelector((state: RootState) => state.players);
  const scoresPresent = useAppSelector(
    (state: RootState) => state.scores.present
  );
  const scoresPast = useAppSelector((state: RootState) => state.scores.past);
  const stats = useAppSelector((state: RootState) => state.stats);
  const game = useAppSelector((state: RootState) => state.game);

  // Use a ref to avoid syncing on the very first render (session just created)
  const initialMount = useRef(true);

  useEffect(() => {
    if (!isSharing || !sessionCode) return;
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      updateSession(sessionCode, {
        players,
        scores: { present: scoresPresent, past: scoresPast },
        stats,
        game,
      }).catch((err) => console.error('Session sync failed:', err));
    }, 300); // debounce 300ms

    return () => clearTimeout(timeout);
  }, [isSharing, sessionCode, players, scoresPresent, scoresPast, stats, game]);
}
