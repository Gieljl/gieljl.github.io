/**
 * Drives NPC turns for a locally-run TKID2 game.
 *
 * When it is a bot's turn (and the game is not over), the hook waits a short,
 * randomised "think" delay and then calls `onAction` with the bot's chosen
 * action. It guards against stale dispatches when the state changes or the
 * component unmounts mid-think.
 *
 * The hook is intentionally state-agnostic: it works with local React state
 * today and would work unchanged against a relayed online state tomorrow — the
 * caller just supplies the current state, the set of bot ids and how to apply
 * an action.
 */
import { useEffect, useRef } from "react";
import { Difficulty, chooseAction } from "./ai/botPolicy";
import {
  TKID2Action,
  TKID2State,
  currentPlayer,
  isGameOver,
} from "./engine/tkid2Engine";

const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 1300;

export interface UseTkid2BotDriverArgs {
  state: TKID2State | null;
  /** Player ids that are bots. */
  botIds: string[];
  /** Difficulty per bot id (falls back to "normal"). */
  difficultyById?: Record<string, Difficulty>;
  /** Apply the chosen action to the game. */
  onAction: (action: TKID2Action) => void;
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
    const delay =
      MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

    const timer = setTimeout(() => {
      if (cancelled) return;
      const action = chooseAction(state, player.id, difficulty);
      onActionRef.current(action);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Re-run whenever the turn owner or the game shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, botIds, enabled]);
}
