/**
 * TKID2 — "The King Is Dead: Second Edition" score/play engine.
 *
 * ----------------------------------------------------------------------------
 * IMPORTANT — RULES INTERPRETATION
 * ----------------------------------------------------------------------------
 * The authoritative rulebook (BGG file `bgg280719`, "TKID2_rulebook.pdf") is
 * served from an expired S3 signed URL that could not be retrieved while this
 * engine was written. The mechanics below are therefore a *faithful
 * interpretation* of The King Is Dead: Second Edition, distilled from the
 * game's well-documented core loop. All tunable numbers live in the exported
 * constants near the top so they can be corrected against the real rulebook
 * without touching game logic.
 *
 * Core loop captured:
 *   - Three native factions fight for majority control across a set of regions:
 *       english, scottish, welsh.
 *   - Regions are contested one at a time in a (seeded) order.
 *   - On a turn a player either PLAYS one single-use action card (manipulating
 *     faction cubes in / around the contested region) or PASSES. Passing lets
 *     the player take one follower (a cube of a chosen faction present in the
 *     contested region) into their personal court, then removes them from the
 *     round.
 *   - When every player has passed, the contested region is RESOLVED: the
 *     faction with a strict cube majority earns that region's crown. A tie (or
 *     an empty region) leaves the region "in revolt" — a foreign (french)
 *     crown, which counts toward an invasion.
 *   - After all regions resolve, the game ends. If enough regions fell into
 *     revolt an INVASION flips the win condition (alignment with the *weakest*
 *     native faction wins); otherwise alignment with the *strongest* native
 *     faction wins.
 *
 * Design constraints (so a future online, turn-based multiplayer mode is an
 * add-on rather than a rewrite — mirroring `features/play/engine`):
 *   - Pure & framework-free: no React / Redux imports.
 *   - Serializable: every state value is plain JSON.
 *   - Deterministic: all randomness flows through a caller-supplied `seed`.
 *   - Action-based: all transitions go through `applyAction(state, action)`
 *     which returns a new state, emitted events, and an optional rejection
 *     reason. The UI and the AI both produce the same `TKID2Action` objects.
 */

// ===========================================================================
// Tunable constants (correct these against the real rulebook if needed)
// ===========================================================================

/** The three native factions competing for control. */
export const FACTIONS = ["english", "scottish", "welsh"] as const;
export type Faction = (typeof FACTIONS)[number];

/** The foreign power that benefits from unrest. Never held as a follower. */
export const FOREIGN: "french" = "french";

/** Owner of a resolved region's crown: a native faction or the foreign power. */
export type CrownOwner = Faction | typeof FOREIGN;

export type RegionId = string;

export interface RegionDef {
  id: RegionId;
  name: string;
  /** Ids of regions from which cubes may be manoeuvred into this one. */
  adjacent: RegionId[];
  /** Starting cube counts per faction at game setup. */
  setup: Record<Faction, number>;
}

/**
 * A compact map of Britain: eight regions with a simple adjacency graph and a
 * balanced opening cube layout. (Numbers/adjacency are an interpretation.)
 */
export const REGIONS: RegionDef[] = [
  { id: "lothian", name: "Lothian", adjacent: ["strathclyde", "northumbria"], setup: { english: 0, scottish: 2, welsh: 0 } },
  { id: "strathclyde", name: "Strathclyde", adjacent: ["lothian", "northumbria", "gwynedd"], setup: { english: 0, scottish: 2, welsh: 1 } },
  { id: "northumbria", name: "Northumbria", adjacent: ["lothian", "strathclyde", "mercia"], setup: { english: 1, scottish: 1, welsh: 0 } },
  { id: "gwynedd", name: "Gwynedd", adjacent: ["strathclyde", "mercia", "wessex"], setup: { english: 0, scottish: 1, welsh: 2 } },
  { id: "mercia", name: "Mercia", adjacent: ["northumbria", "gwynedd", "wessex", "anglia"], setup: { english: 2, scottish: 0, welsh: 1 } },
  { id: "anglia", name: "Anglia", adjacent: ["mercia", "wessex"], setup: { english: 2, scottish: 0, welsh: 0 } },
  { id: "wessex", name: "Wessex", adjacent: ["gwynedd", "mercia", "anglia", "cornwall"], setup: { english: 2, scottish: 0, welsh: 1 } },
  { id: "cornwall", name: "Cornwall", adjacent: ["wessex"], setup: { english: 1, scottish: 0, welsh: 1 } },
];

/**
 * Number of regions that must end in revolt (foreign crown) for the foreign
 * invasion to trigger and flip the win condition.
 */
export const INVASION_THRESHOLD = 4;

/** How many cubes a "Muster" card adds to the contested region. */
export const MUSTER_AMOUNT = 2;
/** Maximum cubes a "Exile" card removes from the contested region. */
export const EXILE_AMOUNT = 2;
/** Maximum cubes a single "Manoeuvre" card moves in from an adjacent region. */
export const MANOEUVRE_AMOUNT = 2;

// ===========================================================================
// Cards
// ===========================================================================

export type ActionCardKind = "muster" | "exile" | "manoeuvre";

export interface ActionCard {
  /** Stable id, unique within a player's hand. */
  id: string;
  kind: ActionCardKind;
  /** For muster/exile: the faction the card acts on. Null for manoeuvre. */
  faction: Faction | null;
  label: string;
}

/**
 * The identical eight-card hand every player starts with:
 *   3× Muster   (one per faction) — reinforce a faction in the contested region
 *   3× Exile    (one per faction) — weaken a faction in the contested region
 *   2× Manoeuvre                  — pull one faction's cubes in from a neighbour
 */
export function startingHand(): ActionCard[] {
  const cards: ActionCard[] = [];
  for (const f of FACTIONS) {
    cards.push({ id: `muster-${f}`, kind: "muster", faction: f, label: `Muster ${cap(f)}` });
  }
  for (const f of FACTIONS) {
    cards.push({ id: `exile-${f}`, kind: "exile", faction: f, label: `Exile ${cap(f)}` });
  }
  cards.push({ id: "manoeuvre-1", kind: "manoeuvre", faction: null, label: "Manoeuvre" });
  cards.push({ id: "manoeuvre-2", kind: "manoeuvre", faction: null, label: "Manoeuvre" });
  return cards;
}

// ===========================================================================
// State
// ===========================================================================

export type PlayerId = string;

export interface TKID2Player {
  id: PlayerId;
  name: string;
  isBot: boolean;
  /** Ids of action cards still in hand (single-use). */
  hand: string[];
  /** Follower cubes collected into this player's personal court. */
  court: Record<Faction, number>;
  /** Whether this player has passed out of the current round. */
  passed: boolean;
}

export type Phase = "in-progress" | "ended";

export interface TKID2State {
  players: TKID2Player[];
  /** Current cube counts per region. */
  regions: Record<RegionId, Record<Faction, number>>;
  /** Order in which regions are contested (seeded shuffle of region ids). */
  eventOrder: RegionId[];
  /** Index into `eventOrder` of the region being contested right now. */
  eventIndex: number;
  /** Resolved crowns: regionId → owning faction / foreign power. */
  crowns: Record<RegionId, CrownOwner>;
  /** Index into `players` whose turn it is. */
  currentPlayerIndex: number;
  phase: Phase;
  /** Seed the game was created with (kept for replay / online sync). */
  seed: number;
}

// ===========================================================================
// Actions & events
// ===========================================================================

export type TKID2Action =
  | {
      type: "playCard";
      cardId: string;
      /** Manoeuvre only: the neighbouring region to pull cubes from. */
      fromRegion?: RegionId;
      /** Manoeuvre only: which faction's cubes to move. */
      faction?: Faction;
    }
  | {
      type: "pass";
      /** Faction whose cube to take as a follower (must be present in region). */
      takeFollower?: Faction;
    };

export type TKID2Event =
  | { kind: "cardPlayed"; playerId: PlayerId; cardId: string; region: RegionId }
  | { kind: "passed"; playerId: PlayerId; tookFollower: Faction | null }
  | { kind: "regionResolved"; region: RegionId; owner: CrownOwner }
  | { kind: "gameEnded" };

export interface ApplyResult {
  state: TKID2State;
  events: TKID2Event[];
  /** When set, the action was rejected and `state` is unchanged. */
  error?: string;
}

// ===========================================================================
// Setup
// ===========================================================================

export interface SetupPlayer {
  id: PlayerId;
  name: string;
  isBot: boolean;
}

const REGION_BY_ID: Record<RegionId, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, RegionDef>;

function emptyCourt(): Record<Faction, number> {
  return { english: 0, scottish: 0, welsh: 0 };
}

/**
 * Deterministic Fisher–Yates shuffle driven by a seed (mulberry32). Kept local
 * so the engine has no cross-feature dependency.
 */
export function seededShuffle<T>(input: readonly T[], seed: number): T[] {
  const arr = input.slice();
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(players: SetupPlayer[], seed = 1): TKID2State {
  if (players.length < 2 || players.length > 4) {
    throw new Error("TKID2 supports 2–4 players");
  }
  const regions: Record<RegionId, Record<Faction, number>> = {};
  for (const r of REGIONS) {
    regions[r.id] = { ...r.setup };
  }
  const eventOrder = seededShuffle(
    REGIONS.map((r) => r.id),
    seed,
  );
  return {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      hand: startingHand().map((c) => c.id),
      court: emptyCourt(),
      passed: false,
    })),
    regions,
    eventOrder,
    eventIndex: 0,
    crowns: {},
    currentPlayerIndex: 0,
    phase: "in-progress",
    seed,
  };
}

// ===========================================================================
// Selectors / helpers
// ===========================================================================

export function currentRegionId(state: TKID2State): RegionId | null {
  if (state.eventIndex >= state.eventOrder.length) return null;
  return state.eventOrder[state.eventIndex];
}

export function currentPlayer(state: TKID2State): TKID2Player {
  return state.players[state.currentPlayerIndex];
}

export function cardById(id: string): ActionCard | undefined {
  return startingHand().find((c) => c.id === id);
}

export function regionCubes(
  state: TKID2State,
  regionId: RegionId,
): Record<Faction, number> {
  return state.regions[regionId];
}

/** Faction(s) with the most cubes in a region. */
export function regionLeaders(cubes: Record<Faction, number>): Faction[] {
  const max = Math.max(...FACTIONS.map((f) => cubes[f]));
  if (max <= 0) return [];
  return FACTIONS.filter((f) => cubes[f] === max);
}

/** The owner a region would get if resolved right now. */
export function projectedOwner(cubes: Record<Faction, number>): CrownOwner {
  const leaders = regionLeaders(cubes);
  return leaders.length === 1 ? leaders[0] : FOREIGN;
}

// ===========================================================================
// Legal-move enumeration (used by the UI and the AI)
// ===========================================================================

/**
 * All legal actions for the current player. Pass options are enumerated one
 * per takeable follower colour (plus a bare pass when the region is empty).
 */
export function legalActions(state: TKID2State): TKID2Action[] {
  if (state.phase === "ended") return [];
  const region = currentRegionId(state);
  if (region === null) return [];
  const player = currentPlayer(state);
  if (player.passed) return [];

  const actions: TKID2Action[] = [];
  const cubes = state.regions[region];

  // Pass — optionally taking one follower of a colour present in the region.
  const takeable = FACTIONS.filter((f) => cubes[f] > 0);
  if (takeable.length === 0) {
    actions.push({ type: "pass" });
  } else {
    for (const f of takeable) actions.push({ type: "pass", takeFollower: f });
  }

  // Card plays.
  for (const cardId of player.hand) {
    const card = cardById(cardId);
    if (!card) continue;
    if (card.kind === "muster") {
      actions.push({ type: "playCard", cardId });
    } else if (card.kind === "exile") {
      // Only useful if that faction has cubes to remove.
      if (card.faction && cubes[card.faction] > 0) {
        actions.push({ type: "playCard", cardId });
      }
    } else {
      // Manoeuvre: for each adjacent region and each faction present there.
      const def = REGION_BY_ID[region];
      for (const adj of def.adjacent) {
        const adjCubes = state.regions[adj];
        for (const f of FACTIONS) {
          if (adjCubes[f] > 0) {
            actions.push({ type: "playCard", cardId, fromRegion: adj, faction: f });
          }
        }
      }
    }
  }
  return actions;
}

// ===========================================================================
// Transition
// ===========================================================================

function clone(state: TKID2State): TKID2State {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      court: { ...p.court },
    })),
    regions: Object.fromEntries(
      Object.entries(state.regions).map(([k, v]) => [k, { ...v }]),
    ) as Record<RegionId, Record<Faction, number>>,
    eventOrder: [...state.eventOrder],
    crowns: { ...state.crowns },
  };
}

function reject(state: TKID2State, error: string): ApplyResult {
  return { state, events: [], error };
}

/**
 * Apply a single action for the current player. Returns a new state plus the
 * events emitted (including any automatic region resolution when the last
 * player passes and the follow-on game end).
 */
export function applyAction(state: TKID2State, action: TKID2Action): ApplyResult {
  if (state.phase === "ended") return reject(state, "Game already ended");
  const region = currentRegionId(state);
  if (region === null) return reject(state, "No region is being contested");
  const player = currentPlayer(state);
  if (player.passed) return reject(state, "Current player has already passed");

  const next = clone(state);
  const events: TKID2Event[] = [];
  const np = next.players[next.currentPlayerIndex];
  const cubes = next.regions[region];

  if (action.type === "pass") {
    let took: Faction | null = null;
    if (action.takeFollower) {
      if (cubes[action.takeFollower] <= 0) {
        return reject(state, "No such follower to take in this region");
      }
      cubes[action.takeFollower] -= 1;
      np.court[action.takeFollower] += 1;
      took = action.takeFollower;
    }
    np.passed = true;
    events.push({ kind: "passed", playerId: np.id, tookFollower: took });
  } else {
    const card = cardById(action.cardId);
    if (!card) return reject(state, "Unknown card");
    if (!np.hand.includes(action.cardId)) {
      return reject(state, "Card is not in hand");
    }

    if (card.kind === "muster") {
      cubes[card.faction as Faction] += MUSTER_AMOUNT;
    } else if (card.kind === "exile") {
      const f = card.faction as Faction;
      if (cubes[f] <= 0) return reject(state, "No cubes of that faction to exile");
      cubes[f] = Math.max(0, cubes[f] - EXILE_AMOUNT);
    } else {
      // manoeuvre
      const { fromRegion, faction } = action;
      if (!fromRegion || !faction) {
        return reject(state, "Manoeuvre requires a source region and faction");
      }
      const def = REGION_BY_ID[region];
      if (!def.adjacent.includes(fromRegion)) {
        return reject(state, "Source region is not adjacent");
      }
      const src = next.regions[fromRegion];
      if (src[faction] <= 0) {
        return reject(state, "No cubes of that faction to manoeuvre");
      }
      const moved = Math.min(MANOEUVRE_AMOUNT, src[faction]);
      src[faction] -= moved;
      cubes[faction] += moved;
    }

    // Remove the played card from hand (single-use).
    np.hand = np.hand.filter((id) => id !== action.cardId);
    events.push({ kind: "cardPlayed", playerId: np.id, cardId: action.cardId, region });
  }

  advanceTurn(next, events);
  return { state: next, events };
}

/**
 * Advance to the next active player. If everyone has passed, resolve the
 * contested region and set up the next one (or end the game).
 */
function advanceTurn(state: TKID2State, events: TKID2Event[]): void {
  const n = state.players.length;

  // Find the next player who has not passed.
  let idx = state.currentPlayerIndex;
  for (let step = 0; step < n; step++) {
    idx = (idx + 1) % n;
    if (!state.players[idx].passed) {
      state.currentPlayerIndex = idx;
      return;
    }
  }

  // Everyone passed → resolve the contested region.
  const region = state.eventOrder[state.eventIndex];
  const owner = projectedOwner(state.regions[region]);
  state.crowns[region] = owner;
  events.push({ kind: "regionResolved", region, owner });

  // Settle the region: its cubes leave the board.
  state.regions[region] = { english: 0, scottish: 0, welsh: 0 };

  state.eventIndex += 1;
  if (state.eventIndex >= state.eventOrder.length) {
    state.phase = "ended";
    events.push({ kind: "gameEnded" });
    return;
  }

  // Start the next round: reset pass flags, rotate the starting player.
  for (const p of state.players) p.passed = false;
  state.currentPlayerIndex = state.eventIndex % n;
}

// ===========================================================================
// Scoring
// ===========================================================================

export interface FactionStanding {
  faction: Faction;
  crowns: number;
}

/** How many crowns each native faction (and the foreign power) holds. */
export function crownCounts(state: TKID2State): Record<CrownOwner, number> {
  const counts: Record<CrownOwner, number> = {
    english: 0,
    scottish: 0,
    welsh: 0,
    french: 0,
  };
  for (const owner of Object.values(state.crowns)) counts[owner] += 1;
  return counts;
}

export function isInvasion(state: TKID2State): boolean {
  return crownCounts(state)[FOREIGN] >= INVASION_THRESHOLD;
}

/** Native factions ranked by crowns (desc); ties broken by fixed order. */
export function factionStandings(state: TKID2State): FactionStanding[] {
  const counts = crownCounts(state);
  return FACTIONS.map((f) => ({ faction: f, crowns: counts[f] })).sort(
    (a, b) => b.crowns - a.crowns || FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction),
  );
}

/**
 * The faction whose follower alignment decides the game:
 *  - normal game → the strongest native faction
 *  - invasion    → the weakest native faction (loyal opposition)
 */
export function decidingFaction(state: TKID2State): Faction {
  const standings = factionStandings(state);
  return isInvasion(state)
    ? standings[standings.length - 1].faction
    : standings[0].faction;
}

export interface PlayerResult {
  playerId: PlayerId;
  name: string;
  /** Followers of the deciding faction — the primary score. */
  score: number;
  /** Full ranked tiebreak vector (deciding faction first, then descending). */
  tiebreak: number[];
}

/**
 * Final results, best first. Primary score is followers of the deciding
 * faction. Ties are broken by followers of the remaining factions in
 * (normal: descending crowns) / (invasion: ascending crowns) order.
 */
export function results(state: TKID2State): PlayerResult[] {
  const standings = factionStandings(state);
  const invasion = isInvasion(state);
  // Order in which faction alignments matter for tiebreaks.
  const order = invasion
    ? [...standings].reverse().map((s) => s.faction)
    : standings.map((s) => s.faction);

  const rows = state.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    score: p.court[order[0]],
    tiebreak: order.map((f) => p.court[f]),
  }));

  rows.sort((a, b) => {
    for (let i = 0; i < a.tiebreak.length; i++) {
      if (b.tiebreak[i] !== a.tiebreak[i]) return b.tiebreak[i] - a.tiebreak[i];
    }
    return 0;
  });
  return rows;
}

export function isGameOver(state: TKID2State): boolean {
  return state.phase === "ended";
}

/** Winner(s) of a finished game (multiple only on a perfect tie). */
export function winners(state: TKID2State): PlayerResult[] {
  if (!isGameOver(state)) return [];
  const ranked = results(state);
  if (ranked.length === 0) return [];
  const best = ranked[0];
  return ranked.filter(
    (r) => r.tiebreak.every((v, i) => v === best.tiebreak[i]),
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
