/**
 * TKID2 NPC policy.
 *
 * Pure function: given a state and the id of the bot whose turn it is, return a
 * single legal `TKID2Action`. Deterministic (no RNG) so behaviour is
 * reproducible in tests. Uses a one-ply search: enumerate every legal action,
 * apply it, and score the resulting state with a heuristic that estimates the
 * bot's final alignment advantage. Difficulty controls how greedily the bot
 * plays and how far it looks.
 */
import {
  CrownOwner,
  FACTIONS,
  Faction,
  INVASION_THRESHOLD,
  PlayerId,
  TKID2Action,
  TKID2State,
  applyAction,
  crownCounts,
  currentPlayer,
  currentRegionId,
  legalActions,
  projectedOwner,
} from "../engine/tkid2Engine";

export type Difficulty = "easy" | "normal" | "godlike";

/**
 * Estimate which faction's alignment will decide the game, using resolved
 * crowns plus the projected owner of the region currently being contested.
 * This is a cheap forecast — future regions are ignored.
 */
function projectedCrownCounts(state: TKID2State): Record<CrownOwner, number> {
  const counts = { ...crownCounts(state) };
  const region = currentRegionId(state);
  if (region !== null) {
    const owner = projectedOwner(state.regions[region]);
    counts[owner] += 1;
  }
  return counts;
}

function projectedDecidingFaction(state: TKID2State): {
  faction: Faction;
  invasion: boolean;
} {
  const counts = projectedCrownCounts(state);
  const invasion = counts.french >= INVASION_THRESHOLD;
  const ranked = FACTIONS.map((f) => ({ faction: f, crowns: counts[f] })).sort(
    (a, b) =>
      b.crowns - a.crowns ||
      FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction),
  );
  return {
    faction: invasion ? ranked[ranked.length - 1].faction : ranked[0].faction,
    invasion,
  };
}

/**
 * Heuristic value of `state` from `botId`'s perspective. Higher is better.
 * Combines:
 *  - alignment advantage in the projected deciding faction (dominant term),
 *  - a small bonus for total followers held (flexibility),
 *  - a small nudge to avoid runaway foreign invasion unless we're set up for it.
 */
export function evaluate(state: TKID2State, botId: PlayerId): number {
  const { faction: deciding, invasion } = projectedDecidingFaction(state);
  const me = state.players.find((p) => p.id === botId);
  if (!me) return 0;
  const opponents = state.players.filter((p) => p.id !== botId);

  const myAlign = me.court[deciding];
  const bestOpp = opponents.reduce(
    (m, p) => Math.max(m, p.court[deciding]),
    0,
  );
  let value = (myAlign - bestOpp) * 10;

  // Small preference for a larger, more flexible court.
  const myTotal = FACTIONS.reduce((a, f) => a + me.court[f], 0);
  value += myTotal * 0.5;

  // If we're not aligned to profit from an invasion, discourage it slightly.
  const counts = projectedCrownCounts(state);
  if (!invasion && counts.french > 0) {
    value -= counts.french * 0.25;
  }

  return value;
}

/**
 * Deterministic tiebreak key so equal-value actions resolve consistently.
 * Prefers card plays over passing early game, and cheaper option ordering.
 */
function actionKey(a: TKID2Action): string {
  if (a.type === "pass") return `z-pass-${a.takeFollower ?? ""}`;
  return `a-${a.cardId}-${a.fromRegion ?? ""}-${a.faction ?? ""}`;
}

/**
 * Choose the bot's action. One-ply greedy over the heuristic. Difficulty:
 *  - godlike: full evaluation, always the best action.
 *  - normal:  best action, but ignores the invasion-avoidance nudge.
 *  - easy:    prefers simply taking a follower of the projected-winning faction
 *             (short-sighted), only playing cards when passing is unavailable.
 */
export function chooseAction(
  state: TKID2State,
  botId: PlayerId,
  difficulty: Difficulty = "normal",
): TKID2Action {
  const actions = legalActions(state);
  if (actions.length === 0) {
    return { type: "pass" };
  }

  // Sanity: only decide for the player actually on turn.
  const onTurn = currentPlayer(state);
  if (onTurn.id !== botId) {
    // Defensive fallback — should not happen in normal drive flow.
    return actions[0];
  }

  if (difficulty === "easy") {
    return easyAction(state, actions);
  }

  let best: TKID2Action | null = null;
  let bestScore = -Infinity;
  for (const action of actions) {
    const res = applyAction(state, action);
    if (res.error) continue;
    let score = evaluate(res.state, botId);
    if (difficulty === "normal") {
      // Normal bots are a touch less strategic: dampen the alignment term.
      score = score * 0.9;
    }
    if (
      score > bestScore ||
      (score === bestScore &&
        best !== null &&
        actionKey(action) < actionKey(best))
    ) {
      bestScore = score;
      best = action;
    }
  }
  return best ?? actions[0];
}

/**
 * Easy bots: greedily grab a follower of the faction currently leading the
 * contested region; otherwise take any follower; otherwise play the first
 * available card.
 */
function easyAction(state: TKID2State, actions: TKID2Action[]): TKID2Action {
  const region = currentRegionId(state);
  if (region !== null) {
    const owner = projectedOwner(state.regions[region]);
    if (owner !== "french") {
      const grab = actions.find(
        (a) => a.type === "pass" && a.takeFollower === owner,
      );
      if (grab) return grab;
    }
  }
  const anyGrab = actions.find(
    (a) => a.type === "pass" && a.takeFollower !== undefined,
  );
  if (anyGrab) return anyGrab;
  const card = actions.find((a) => a.type === "playCard");
  return card ?? actions[0];
}
