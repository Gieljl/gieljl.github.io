/**
 * The King Is Dead — NPC policy.
 *
 * Pure and deterministic: given a state and the id of the bot on turn, return
 * one legal `Tkid2Action`.
 *
 * The bot is built to play like a human player:
 *
 *  - **Strategy from its cubes.** Its two random starting followers (and every
 *    follower it summons later) anchor a strategy: it wants the factions it
 *    holds in court to end up powerful, and steers the board that way. A bot
 *    that starts with two Welsh cubes plays a Welsh game.
 *  - **Cards are precious.** You get eight actions for the whole game, so the
 *    default move is to PASS. A card is only played when its full effect
 *    (including the follower summoned afterwards) improves the bot's position
 *    by more than a scarcity-adjusted threshold — i.e. when it actually
 *    matters, such as flipping the contested region before it resolves.
 *  - **It watches the other players.** Opponents' courts count against every
 *    faction's value: the bot avoids handing the win to whoever is best
 *    aligned, and reacts when an opponent's play turns a struggle against it.
 *
 * Passing is evaluated by actually applying it — when the bot is the last to
 * pass, the engine resolves the power struggle in the lookahead, so the bot
 * "sees" exactly what locking in the current region means.
 */
import {
  FACTIONS,
  Faction,
  PlayerId,
  RegionId,
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
  summonOptions,
  totalCubes,
} from "../engine/tkid2Engine";

export type Difficulty = "easy" | "normal" | "godlike";

/** Projected power per faction: regions held, plus the contested region's
 *  current leader counted as a probable extra win. */
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
  const proj = projectedRegions(state);
  const ranked = [...FACTIONS].sort((a, b) => proj[b] - proj[a]);

  let value = 0;
  // Court alignment: margin over the best-aligned opponent, weighted by how
  // powerful the faction is projected to be.
  ranked.forEach((f, i) => {
    const bestOpp = opponents.reduce((m, p) => Math.max(m, p.court[f]), 0);
    value += [10, 4, 1][i] * (me.court[f] - bestOpp);
  });

  // Strategy: push the factions *I* hold toward power, and keep the factions
  // my best-aligned rival holds away from it. This is what makes the bot
  // commit to the colours of its starting cubes and react to other courts.
  for (const f of FACTIONS) {
    const bestOpp = opponents.reduce((m, p) => Math.max(m, p.court[f]), 0);
    value += proj[f] * (1.6 * me.court[f] - 0.9 * bestOpp);
  }

  // Invasion insurance: complete sets matter more with each instability disc.
  const discs = instabilityOnBoard(state);
  const setWeight = [0.5, 4, 14][Math.min(discs, 2)];
  const bestOppSets = opponents.reduce((m, p) => Math.max(m, setCount(p.court)), 0);
  value += setWeight * (setCount(me.court) - bestOppSets);

  // Unspent cards are future influence; a bigger court is flexibility.
  value += 0.6 * me.hand.length;
  value += 0.3 * (me.court.scottish + me.court.welsh + me.court.english);

  return value;
}

/** Stable ordering so equal-value actions resolve deterministically. */
function actionKey(a: Tkid2Action): string {
  if (a.type === "pass") return "z";
  if (a.type === "summon") return `s-${a.regionId}-${a.faction}`;
  return `p-${a.cardId}-${JSON.stringify(a.params)}`;
}

/** Deterministic pseudo-noise in [-1, 1] so "normal" bots are imperfect but
 *  reproducible. */
function noise(state: Tkid2State, key: string): number {
  let h = state.seed ^ (state.actionSeq * 2654435761);
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (((h >>> 8) % 1000) / 500) - 1;
}

const MAX_PLAYS = 90;

/** Deterministically thin very large play lists to keep the bot snappy. */
function thin(actions: Tkid2Action[]): Tkid2Action[] {
  if (actions.length <= MAX_PLAYS) return actions;
  const step = actions.length / MAX_PLAYS;
  const out: Tkid2Action[] = [];
  for (let i = 0; i < MAX_PLAYS; i++) out.push(actions[Math.floor(i * step)]);
  return out;
}

/** A short list of sensible summons: for each faction, the contested region
 *  (summoning there shifts the struggle) plus the fullest other region. */
function candidateSummons(state: Tkid2State): Tkid2Action[] {
  const contested = contestedRegionId(state);
  const options = summonOptions(state);
  const picked = new Map<string, Tkid2Action>();
  for (const f of FACTIONS) {
    const inContested = options.find((o) => o.faction === f && o.regionId === contested);
    if (inContested) {
      picked.set(`${f}-c`, { type: "summon", ...inContested });
    }
    let best: { regionId: RegionId; faction: Faction } | null = null;
    let bestSize = -1;
    for (const o of options) {
      if (o.faction !== f || o.regionId === contested) continue;
      const size = totalCubes(state.regions[o.regionId].cubes);
      if (size > bestSize) {
        bestSize = size;
        best = o;
      }
    }
    if (best) picked.set(`${f}-o`, { type: "summon", ...best });
  }
  return Array.from(picked.values());
}

/** Value of a play measured after the follow-up summon it forces. */
function playValue(state: Tkid2State, play: Tkid2Action, botId: PlayerId): number {
  const res = applyAction(state, play);
  if (res.error) return -Infinity;
  if (!res.state.pendingSummon) return evaluate(res.state, botId);
  let best = -Infinity;
  for (const summon of candidateSummons(res.state)) {
    const s2 = applyAction(res.state, summon);
    if (s2.error) continue;
    best = Math.max(best, evaluate(s2.state, botId));
  }
  return best === -Infinity ? evaluate(res.state, botId) : best;
}

/**
 * How much better than passing a card play must be before it is worth one of
 * the bot's eight actions. Grows when cards run scarcer than the remaining
 * power struggles, so bots pace themselves across the whole game the way a
 * human does.
 */
function playThreshold(state: Tkid2State, botId: PlayerId, difficulty: Difficulty): number {
  const me = state.players.find((p) => p.id === botId);
  const strugglesLeft = 8 - state.struggles.length;
  const cardsLeft = me?.hand.filter((c) => c !== "plot").length ?? 0;
  const scarcity = Math.max(0, strugglesLeft - cardsLeft) * 1.2;
  const base = difficulty === "godlike" ? 1.0 : 2.4;
  // Pacing: eight cards must last eight struggles. Once a bot has spent more
  // cards than there are resolved struggles, each further play this round
  // costs steeply more — otherwise two bots trading blows over the first
  // contested region dump their whole hands before it even resolves. A
  // genuinely game-deciding play still goes through, because losing the game
  // evaluates far below any threshold.
  const spent = me?.discard.length ?? 0;
  const overspend = Math.max(0, spent - state.struggles.length);
  const perCard = difficulty === "godlike" ? 2.6 : 3.4;
  const pacing = ((overspend * (overspend + 1)) / 2) * perCard;
  return base + scarcity + pacing;
}

/**
 * The value of the summon that any card play would grant *right now*, with
 * no card effect at all. Playing a card always banks a follower, but so
 * would playing that same card on a later turn — so this windfall must not
 * count in favour of playing now. It is subtracted from play values (scaled
 * down late in the game, when unspent cards would otherwise go to waste).
 */
function summonWindfall(state: Tkid2State, botId: PlayerId): number {
  const base = evaluate(state, botId);
  const idx = state.players.findIndex((p) => p.id === botId);
  if (idx < 0) return 0;
  let best = 0;
  for (const s of candidateSummons(state)) {
    if (s.type !== "summon") continue;
    const clone = JSON.parse(JSON.stringify(state)) as Tkid2State;
    clone.regions[s.regionId].cubes[s.faction] -= 1;
    clone.players[idx].court[s.faction] += 1;
    best = Math.max(best, evaluate(clone, botId) - base);
  }
  return best;
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

  // Mandatory summon after a card play: full one-ply evaluation.
  if (state.pendingSummon) {
    let best: Tkid2Action | null = null;
    let bestScore = -Infinity;
    for (const action of all) {
      const res = applyAction(state, action);
      if (res.error) continue;
      const score = evaluate(res.state, botId);
      if (score > bestScore || (score === bestScore && best && actionKey(action) < actionKey(best))) {
        bestScore = score;
        best = action;
      }
    }
    return best ?? all[0];
  }

  // Play-versus-pass: passing is the default; a card must earn its keep.
  const pass: Tkid2Action = { type: "pass" };
  const passRes = applyAction(state, pass);
  const passValue = passRes.error ? -Infinity : evaluate(passRes.state, botId);

  const plays = thin(all.filter((a) => a.type === "play"));
  let bestPlay: Tkid2Action | null = null;
  let bestValue = -Infinity;
  for (const play of plays) {
    let value = playValue(state, play, botId);
    if (difficulty === "normal") value += noise(state, actionKey(play)) * 0.8;
    if (
      value > bestValue ||
      (value === bestValue && bestPlay && actionKey(play) < actionKey(bestPlay))
    ) {
      bestValue = value;
      bestPlay = play;
    }
  }

  // A play must beat "pass now and keep the card for later": its value is
  // compared against passing plus the summon any future play would also
  // grant. Once cards outnumber the remaining struggles, holding them back
  // wastes them, so the windfall discount fades and bots start spending.
  const me = currentPlayer(state);
  const strugglesLeft = Math.max(1, 8 - state.struggles.length);
  const cardsLeft = Math.max(1, me.hand.filter((c) => c !== "plot").length);
  const hoardFactor = cardsLeft <= strugglesLeft ? 1 : strugglesLeft / cardsLeft;
  const bar =
    passValue +
    summonWindfall(state, botId) * hoardFactor +
    playThreshold(state, botId, difficulty);
  if (bestPlay && bestValue > bar) return bestPlay;
  return pass;
}

/**
 * Easy bots: pass most of the time, play whatever card comes first about
 * every third opportunity, and when summoning grab a follower of the
 * projected strongest faction.
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
  const wantsToPlay = state.actionSeq % 3 === 0 && state.consecutivePasses === 0;
  if (wantsToPlay) {
    const play = actions.find((a) => a.type === "play");
    if (play) return play;
  }
  return actions.find((a) => a.type === "pass") ?? actions[0];
}
