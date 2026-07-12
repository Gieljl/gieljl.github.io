/**
 * Drives NPC turns for a locally-run game of The King Is Dead.
 *
 * When it is a bot's turn (including a pending summon after its card play)
 * and the game is not over, the hook waits a short, randomised "think" delay
 * and then calls `onAction` with the bot's chosen action. It guards against
 * stale dispatches when the state changes or the component unmounts
 * mid-think.
 */
import { useEffect, useRef } from "react";
import { Difficulty, chooseAction } from "./ai/botPolicy";
import {
  Tkid2Action,
  Tkid2State,
  currentPlayer,
  isGameOver,
} from "./engine/tkid2Engine";

const MIN_DELAY_MS = 650;
const MAX_DELAY_MS = 1250;

export interface UseTkid2BotDriverArgs {
  state: Tkid2State | null;
  /** Player ids that are bots. */
  botIds: string[];
  /** Difficulty per bot id (falls back to "normal"). */
  difficultyById?: Record<string, Difficulty>;
  /** Apply the chosen action to the game. */
  onAction: (action: Tkid2Action) => void;
  /** When false, the driver is paused (e.g. a modal is open). */
  enabled?: boolean;
}

export function useTkid2BotDriver({
  state,
  botIds,
  difficultyById,
  onAction,
  enabled = true,
}: UseTkid2BotDriverArgs): void {
  // Keep the latest onAction without retriggering the effect.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!enabled || !state || isGameOver(state)) return;
    const player = currentPlayer(state);
    if (!player || !botIds.includes(player.id)) return;

    let cancelled = false;
    const difficulty = difficultyById?.[player.id] ?? "normal";
    // Summons follow a card play; keep them snappy so a bot turn reads as
    // one motion.
    const base = state.pendingSummon ? 350 : MIN_DELAY_MS;
    const delay = base + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS) * (state.pendingSummon ? 0.4 : 1);

    const timer = setTimeout(() => {
      if (cancelled) return;
      const action = chooseAction(state, player.id, difficulty);
      onActionRef.current(action);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `botIds` and `difficultyById` are memoized by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, botIds, enabled]);
}
