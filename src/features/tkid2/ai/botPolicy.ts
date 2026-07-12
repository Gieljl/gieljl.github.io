/**
 * The King Is Dead — NPC policy.
 *
 * Pure and deterministic: given a state and the id of the bot on turn, return
 * one legal `Tkid2Action`. One-ply greedy search: apply every legal action and
 * score the result with a heuristic estimating the bot's chance to be crowned.
 *
 * The heuristic thinks like the game does:
 *  - project which faction will be the most powerful (regions controlled plus
 *    the leader of the currently contested region),
 *  - value court followers of factions weighted by how powerful those factions
 *    are projected to be,
 *  - value complete follower sets more as instability discs hit the board
 *    (they win the game if the French invade),
 *  - value holding cards a little (options are power).
 */
import {
  FACTIONS,
  Faction,
  PlayerId,
  Tkid2Action,
  Tkid2State,
  applyAction,
  contestedRegionId,
  controlledCounts,
  currentPlayer,
  gameResult,
  instabilityOnBoard,
  isGameOver,
  legalActions,
  majorityFaction,
  setCount,
} from "../engine/tkid2Engine";

export type Difficulty = "easy" | "normal" | "godlike";

/** Projected power score per faction: regions held + leads in the contested
 *  region count as a probable extra region. */
function projectedRegions(state: Tkid2State): Record<Faction, number> {
  const counts = { ...controlledCounts(state) };
  const contested = contestedRegionId(state);
  if (contested) {
    const leader = majorityFaction(state.regions[contested].cubes);
    if (leader) counts[leader] += 1;
  }
  return counts;
}

function rankedFactions(state: Tkid2State): Faction[] {
  const proj = projectedRegions(state);
  return [...FACTIONS].sort((a, b) => proj[b] - proj[a]);
}

export function evaluate(state: Tkid2State, botId: PlayerId): number {
  const me = state.players.find((p) => p.id === botId);
  if (!me) return 0;

  if (isGameOver(state)) {
    const result = gameResult(state);
    return result && result.winnerIds.includes(botId) ? 1000 : -1000;
  }

  const opponents = state.players.filter((p) => p.id !== botId);
  const ranked = rankedFactions(state);
  const proj = projectedRegions(state);

  let value = 0;
  // Court alignment: margin over the best opponent, weighted by the faction's
  // projected power (most powerful faction dominates the coronation).
  ranked.forEach((f, i) => {
    const weight = [10, 4, 1][i] * (1 + proj[f] / 4);
    const bestOpp = opponents.reduce((m, p) => Math.max(m, p.court[f]), 0);
    value += weight * (me.court[f] - bestOpp);
  });

  // Invasion insurance: sets matter more with each instability disc placed.
  const discs = instabilityOnBoard(state);
  const setWeight = [0.5, 4, 14][Math.min(discs, 2)];
  const bestOppSets = opponents.reduce((m, p) => Math.max(m, setCount(p.court)), 0);
  value += setWeight * (setCount(me.court) - bestOppSets);

  // A slightly larger court and cards in hand are both flexibility.
  value += 0.3 * (me.court.scottish + me.court.welsh + me.court.english);
  value += 0.4 * me.hand.length;

  return value;
}

/** Stable ordering so equal-value actions resolve deterministically. */
function actionKey(a: Tkid2Action): string {
  if (a.type === "pass") return "z";
  if (a.type === "summon") return `s-${a.regionId}-${a.faction}`;
  return `p-${a.cardId}-${JSON.stringify(a.params)}`;
}

const MAX_CANDIDATES = 400;

/** Deterministically thin very large action lists to keep the bot snappy. */
function thin(actions: Tkid2Action[]): Tkid2Action[] {
  if (actions.length <= MAX_CANDIDATES) return actions;
  const step = actions.length / MAX_CANDIDATES;
  const out: Tkid2Action[] = [];
  for (let i = 0; i < MAX_CANDIDATES; i++) {
    out.push(actions[Math.floor(i * step)]);
  }
  return out;
}

export function chooseAction(
  state: Tkid2State,
  botId: PlayerId,
  difficulty: Difficulty = "normal",
): Tkid2Action {
  const all = legalActions(state);
  if (all.length === 0) return { type: "pass" };
  if (currentPlayer(state).id !== botId) return all[0];

  if (difficulty === "easy") return easyAction(state, all);

  const actions = thin(all);
  let best: Tkid2Action | null = null;
  let bestScore = -Infinity;
  for (const action of actions) {
    const res = applyAction(state, action);
    if (res.error) continue;
    let score = evaluate(res.state, botId);
    if (difficulty === "normal" && action.type === "play") {
      // Normal bots slightly undervalue spending cards, making them play
      // earlier (and more fallibly) than a godlike bot would.
      score += 0.6;
    }
    if (
      score > bestScore ||
      (score === bestScore && best !== null && actionKey(action) < actionKey(best))
    ) {
      bestScore = score;
      best = action;
    }
  }
  return best ?? all[0];
}

/**
 * Easy bots: when summoning, grab a follower of the projected strongest
 * faction; otherwise mostly pass, occasionally (deterministically) playing
 * whatever card comes first.
 */
function easyAction(state: Tkid2State, actions: Tkid2Action[]): Tkid2Action {
  const ranked = rankedFactions(state);
  const summons = actions.filter((a) => a.type === "summon");
  if (summons.length > 0) {
    for (const f of ranked) {
      const found = summons.find((a) => a.type === "summon" && a.faction === f);
      if (found) return found;
    }
    return summons[0];
  }
  // Play a card roughly every other opportunity, keyed off the action count.
  const wantsToPlay = state.actionSeq % 2 === 0;
  if (wantsToPlay) {
    const play = actions.find((a) => a.type === "play");
    if (play) return play;
  }
  return actions.find((a) => a.type === "pass") ?? actions[0];
}
