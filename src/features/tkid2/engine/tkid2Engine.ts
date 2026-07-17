/**
 * The King Is Dead: Second Edition — rules engine.
 *
 * Implements the official Osprey Games rulebook (Peer Sylvester, 2020):
 *   - 8 regions of Britain + France, 54 follower cubes (18 per faction).
 *   - Every player holds the same eight single-use action cards (basic game)
 *     or five basic + three secret cunning cards (advanced game).
 *   - On your turn: play a card (resolve its effect, then summon a follower
 *     from the board to your court) or pass. When all players pass in
 *     sequence, a power struggle resolves the contested region — the region
 *     card in the lowest-numbered space that is still face up.
 *   - Majority faction takes control (control disc); tie/empty regions become
 *     unstable (instability disc from France). Three instability discs on the
 *     board end the game at once with a French invasion; resolving all eight
 *     regions ends it with a coronation.
 *   - Coronation: the player with the most followers of the most powerful
 *     faction in court wins. Invasion: the player with the most complete sets
 *     (one follower of each faction) wins.
 *
 * Design constraints: pure, serializable, deterministic (seeded), and
 * action-based so UI and AI both drive the game through `applyAction`.
 */

// ===========================================================================
// Factions & regions
// ===========================================================================

export const FACTIONS = ["scottish", "welsh", "english"] as const;
export type Faction = (typeof FACTIONS)[number];

export const FACTION_LABEL: Record<Faction, string> = {
  scottish: "Scottish",
  welsh: "Welsh",
  english: "English",
};

export type RegionId =
  | "moray"
  | "strathclyde"
  | "lancaster"
  | "northumbria"
  | "gwynedd"
  | "warwick"
  | "essex"
  | "devon";

export interface RegionDef {
  id: RegionId;
  name: string;
  adjacent: RegionId[];
}

/** The board of Britain: eight regions with the printed adjacency. */
export const REGIONS: RegionDef[] = [
  { id: "moray", name: "Moray", adjacent: ["strathclyde"] },
  { id: "strathclyde", name: "Strathclyde", adjacent: ["moray", "lancaster", "northumbria"] },
  { id: "lancaster", name: "Lancaster", adjacent: ["strathclyde", "northumbria", "gwynedd", "warwick"] },
  { id: "northumbria", name: "Northumbria", adjacent: ["strathclyde", "lancaster", "warwick", "essex"] },
  { id: "gwynedd", name: "Gwynedd", adjacent: ["lancaster", "warwick", "devon"] },
  { id: "warwick", name: "Warwick", adjacent: ["lancaster", "northumbria", "gwynedd", "essex", "devon"] },
  { id: "essex", name: "Essex", adjacent: ["northumbria", "warwick", "devon"] },
  { id: "devon", name: "Devon", adjacent: ["gwynedd", "warwick", "essex"] },
];

export const REGION_IDS = REGIONS.map((r) => r.id);

const REGION_BY_ID: Record<RegionId, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, RegionDef>;

export function regionName(id: RegionId): string {
  return REGION_BY_ID[id].name;
}

export function areAdjacent(a: RegionId, b: RegionId): boolean {
  return REGION_BY_ID[a].adjacent.includes(b);
}

/** Home region of each faction (used by Support and cunning cards). */
export const HOME_REGION: Record<Faction, RegionId> = {
  scottish: "moray",
  welsh: "gwynedd",
  english: "essex",
};

/** Followers per faction in the box (16 each in a two-player game). */
export const FOLLOWERS_PER_FACTION = 18;
export const FOLLOWERS_PER_FACTION_2P = 16;
/** Followers in every region after setup. */
export const SETUP_FOLLOWERS_PER_REGION = 4;
/** Instability discs waiting in France; when the third hits the board → invasion. */
export const INSTABILITY_DISCS = 3;

// ===========================================================================
// Cards
// ===========================================================================

export type BaseCardId =
  | "scottish-support"
  | "welsh-support"
  | "english-support"
  | "assemble-1"
  | "assemble-2"
  | "negotiate"
  | "manoeuvre"
  | "outmanoeuvre";

export type CunningCardId =
  | "spy"
  | "ambush"
  | "march"
  | "plot"
  | "aid"
  | "influence"
  | "dispute"
  | "edict"
  | "resist"
  | "quell"
  | "suppress"
  | "muster";

export type CardId = BaseCardId | CunningCardId;

export interface CardInfo {
  id: CardId;
  name: string;
  cunning: boolean;
  /** Rules text (abridged from the rulebook). */
  text: string;
}

export const CARD_INFO: Record<CardId, CardInfo> = {
  "scottish-support": {
    id: "scottish-support",
    name: "Scottish Support",
    cunning: false,
    text: "Place two Scottish followers from the supply into a region that borders a region controlled by the Scots. If there is no control or instability disc in Moray, you may instead place them into a region bordering Moray.",
  },
  "welsh-support": {
    id: "welsh-support",
    name: "Welsh Support",
    cunning: false,
    text: "Place two Welsh followers from the supply into a region that borders a region controlled by the Welsh. If there is no control or instability disc in Gwynedd, you may instead place them into a region bordering Gwynedd.",
  },
  "english-support": {
    id: "english-support",
    name: "English Support",
    cunning: false,
    text: "Place two English followers from the supply into a region that borders a region controlled by the English. If there is no control or instability disc in Essex, you may instead place them into a region bordering Essex.",
  },
  "assemble-1": {
    id: "assemble-1",
    name: "Assemble",
    cunning: false,
    text: "Place a Scottish follower, a Welsh follower, and an English follower from the supply into any region or regions.",
  },
  "assemble-2": {
    id: "assemble-2",
    name: "Assemble",
    cunning: false,
    text: "Place a Scottish follower, a Welsh follower, and an English follower from the supply into any region or regions.",
  },
  negotiate: {
    id: "negotiate",
    name: "Negotiate",
    cunning: false,
    text: "Swap the positions of any two face-up region cards. Place a negotiation disc on one of the cards you swapped. Cards that are face down or already carry a negotiation disc cannot be swapped.",
  },
  manoeuvre: {
    id: "manoeuvre",
    name: "Manoeuvre",
    cunning: false,
    text: "Swap a follower in any region with a follower in any other region.",
  },
  outmanoeuvre: {
    id: "outmanoeuvre",
    name: "Outmanoeuvre",
    cunning: false,
    text: "Swap a follower in any region with two followers in a bordering region.",
  },
  spy: {
    id: "spy",
    name: "Spy",
    cunning: true,
    text: "Resolve the effect of an action card that is face up on top of another player's discard pile.",
  },
  ambush: {
    id: "ambush",
    name: "Ambush",
    cunning: true,
    text: "Place two Scottish followers from the supply into a region, then return a follower from that region to the supply.",
  },
  march: {
    id: "march",
    name: "March",
    cunning: true,
    text: "Move two followers from a single region to a single bordering region.",
  },
  plot: {
    id: "plot",
    name: "Plot",
    cunning: true,
    text: "You cannot take this action during the game. When deciding the winner, reveal this card: it counts as a follower of a faction of your choice.",
  },
  aid: {
    id: "aid",
    name: "Aid",
    cunning: true,
    text: "Find the faction with the most followers in the supply. Place two followers of that faction into any region.",
  },
  influence: {
    id: "influence",
    name: "Influence",
    cunning: true,
    text: "Swap one English follower in any region with two non-English followers in another region.",
  },
  dispute: {
    id: "dispute",
    name: "Dispute",
    cunning: true,
    text: "Swap a Welsh follower in any region with a non-Welsh follower in another region.",
  },
  edict: {
    id: "edict",
    name: "Edict",
    cunning: true,
    text: "Swap two Scottish followers in any region with two non-Scottish followers in a bordering region.",
  },
  resist: {
    id: "resist",
    name: "Resist",
    cunning: true,
    text: "Place two non-Scottish followers from the supply into any region that borders a region controlled by the Scots. If there is no control or instability disc in Moray, you may instead place them into a region bordering Moray.",
  },
  quell: {
    id: "quell",
    name: "Quell",
    cunning: true,
    text: "Return a Welsh follower to the supply from any region that borders a region controlled by the Welsh, then place two followers from the supply into that region. If there is no control or instability disc in Gwynedd, you may instead act in a region bordering Gwynedd.",
  },
  suppress: {
    id: "suppress",
    name: "Suppress",
    cunning: true,
    text: "Return an English follower to the supply from any region that borders a region controlled by the English, then return another follower from that region, then place a follower from the supply into that region. If there is no control or instability disc in Essex, you may instead act in a region bordering Essex.",
  },
  muster: {
    id: "muster",
    name: "Muster",
    cunning: true,
    text: "Return a Scottish follower to the supply from any region that borders a region controlled by the Scots, then place two followers from the supply into that region. If there is no control or instability disc in Moray, you may instead act in a region bordering Moray.",
  },
};

export const BASE_HAND: BaseCardId[] = [
  "scottish-support",
  "welsh-support",
  "english-support",
  "assemble-1",
  "assemble-2",
  "negotiate",
  "manoeuvre",
  "outmanoeuvre",
];

/** Basic cards kept in the advanced game (supports are removed). */
export const ADVANCED_BASE_HAND: BaseCardId[] = [
  "assemble-1",
  "assemble-2",
  "negotiate",
  "manoeuvre",
  "outmanoeuvre",
];

export const CUNNING_DECK: CunningCardId[] = [
  "spy",
  "ambush",
  "march",
  "plot",
  "aid",
  "influence",
  "dispute",
  "edict",
  "resist",
  "quell",
  "suppress",
  "muster",
];

// ===========================================================================
// State
// ===========================================================================

export type PlayerId = string;

export type FactionCounts = Record<Faction, number>;

export interface RegionState {
  cubes: FactionCounts;
  /** Faction that won this region's power struggle (control disc). */
  control: Faction | null;
  /** True when the power struggle tied / was empty (instability disc). */
  unstable: boolean;
}

/** One of the eight numbered spaces around the board, holding a region card. */
export interface BoardSlot {
  /** Printed number 1–8; struggles resolve lowest face-up number first. */
  position: number;
  regionId: RegionId;
  faceUp: boolean;
  negotiationDisc: boolean;
}

export interface Tkid2Player {
  id: PlayerId;
  name: string;
  isBot: boolean;
  hand: CardId[];
  /** Played cards, last = top of the (face-up) discard pile. */
  discard: CardId[];
  court: FactionCounts;
  /** Global action sequence number of this player's most recent card play. */
  lastActionSeq: number;
  /** Sequence at which the hand became empty (null = still holds cards). */
  emptyHandSeq: number | null;
}

export type Ending = "invasion" | "coronation";

export interface SwapRecord {
  kind: "manoeuvre" | "outmanoeuvre";
  playerIndex: number;
  seq: number;
  from: { regionId: RegionId; factions: Faction[] };
  to: { regionId: RegionId; factions: Faction[] };
}

export interface StruggleRecord {
  regionId: RegionId;
  outcome: Faction | "unstable";
  /** Followers in the region at resolution (for the log/UI). */
  cubes: FactionCounts;
}

export interface Tkid2State {
  players: Tkid2Player[];
  regions: Record<RegionId, RegionState>;
  slots: BoardSlot[];
  supply: FactionCounts;
  /** Instability discs still waiting in France (starts at 3). */
  instabilityInFrance: number;
  currentPlayerIndex: number;
  consecutivePasses: number;
  /** True while the current player must summon a follower after a card play. */
  pendingSummon: boolean;
  /** Number of action cards played so far, by anyone. */
  actionSeq: number;
  /** Most recent (out)manoeuvre swap, for the "cannot undo" rule. */
  lastSwap: SwapRecord | null;
  struggles: StruggleRecord[];
  phase: "playing" | "ended";
  ending: Ending | null;
  advanced: boolean;
  seed: number;
}

// ===========================================================================
// Actions
// ===========================================================================

export interface SwapSide {
  regionId: RegionId;
  factions: Faction[];
}

export interface Placement {
  regionId: RegionId;
  faction: Faction;
}

/**
 * Parameters accompanying a card play. Which fields matter depends on the
 * card; `enumerateCardParams` produces every legal assignment.
 */
export interface CardParams {
  /** Target region (support, ambush, aid, resist, quell, suppress, muster). */
  regionId?: RegionId;
  /** Aid: which (tied-)largest supply faction to draw from. */
  faction?: Faction;
  /** Assemble / resist / quell / muster / suppress: supply placements. */
  placements?: Placement[];
  /** Ambush / quell / muster / suppress: followers returned to the supply. */
  returnFactions?: Faction[];
  /** Negotiate: positions (1–8) of the two cards to swap. */
  slotA?: number;
  slotB?: number;
  /** Negotiate: which of the two swapped region cards gets the disc. */
  discRegionId?: RegionId;
  /** Swaps and March. */
  from?: SwapSide;
  to?: SwapSide;
  /** Spy. */
  spyPlayerId?: PlayerId;
  spyParams?: CardParams;
}

export type Tkid2Action =
  | { type: "pass" }
  | { type: "play"; cardId: CardId; params: CardParams }
  | { type: "summon"; regionId: RegionId; faction: Faction };

export type Tkid2Event =
  | {
      kind: "played";
      playerId: PlayerId;
      cardId: CardId;
      viaSpy?: boolean;
      /** The parameters the card was resolved with (for log descriptions). */
      params?: CardParams;
    }
  | { kind: "summoned"; playerId: PlayerId; regionId: RegionId; faction: Faction }
  | { kind: "summonSkipped"; playerId: PlayerId }
  | { kind: "passed"; playerId: PlayerId }
  | { kind: "struggle"; record: StruggleRecord }
  | { kind: "invasion" }
  | { kind: "coronation" };

export interface ApplyResult {
  state: Tkid2State;
  events: Tkid2Event[];
  /** When set, the action was rejected and `state` is the original state. */
  error?: string;
}

// ===========================================================================
// Seeded RNG
// ===========================================================================

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

export function seededShuffle<T>(input: readonly T[], seed: number): T[] {
  const arr = input.slice();
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===========================================================================
// Setup
// ===========================================================================

export interface SetupPlayer {
  id: PlayerId;
  name: string;
  isBot: boolean;
}

export interface SetupOptions {
  /** Advanced game: no Support cards, three secret cunning cards each. */
  advanced?: boolean;
}

function zeroCounts(): FactionCounts {
  return { scottish: 0, welsh: 0, english: 0 };
}

export function totalCubes(c: FactionCounts): number {
  return c.scottish + c.welsh + c.english;
}

function drawFromBag(bag: FactionCounts, rng: () => number): Faction | null {
  const total = totalCubes(bag);
  if (total === 0) return null;
  let pick = Math.floor(rng() * total);
  for (const f of FACTIONS) {
    if (pick < bag[f]) {
      bag[f] -= 1;
      return f;
    }
    pick -= bag[f];
  }
  return null;
}

export function newGame(
  players: SetupPlayer[],
  seed = 1,
  options: SetupOptions = {},
): Tkid2State {
  if (players.length < 2 || players.length > 4) {
    throw new Error("The King Is Dead supports 2-4 players");
  }
  const advanced = options.advanced === true;
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  const perFaction =
    players.length === 2 ? FOLLOWERS_PER_FACTION_2P : FOLLOWERS_PER_FACTION;

  // Home regions: two followers of each faction start at home.
  const regions: Record<RegionId, RegionState> = {} as Record<
    RegionId,
    RegionState
  >;
  for (const r of REGIONS) {
    regions[r.id] = { cubes: zeroCounts(), control: null, unstable: false };
  }
  const bag: FactionCounts = {
    scottish: perFaction,
    welsh: perFaction,
    english: perFaction,
  };
  for (const f of FACTIONS) {
    regions[HOME_REGION[f]].cubes[f] += 2;
    bag[f] -= 2;
  }

  // Each player draws two random followers into their court.
  const courts: FactionCounts[] = players.map(() => zeroCounts());
  for (const court of courts) {
    for (let i = 0; i < 2; i++) {
      const f = drawFromBag(bag, rng);
      if (f) court[f] += 1;
    }
  }

  // Fill every region up to four random followers.
  for (const r of REGIONS) {
    while (totalCubes(regions[r.id].cubes) < SETUP_FOLLOWERS_PER_REGION) {
      const f = drawFromBag(bag, rng);
      if (!f) break;
      regions[r.id].cubes[f] += 1;
    }
  }

  // Region cards: shuffled onto the numbered spaces 1-8.
  const order = seededShuffle(REGION_IDS, seed);
  const slots: BoardSlot[] = order.map((regionId, i) => ({
    position: i + 1,
    regionId,
    faceUp: true,
    negotiationDisc: false,
  }));

  // Hands: basic or advanced. Cunning cards are dealt from one shuffled deck.
  const cunning = seededShuffle(CUNNING_DECK, (seed ^ 0x51ab3c) >>> 0);
  const mkHand = (idx: number): CardId[] =>
    advanced
      ? [...ADVANCED_BASE_HAND, ...cunning.slice(idx * 3, idx * 3 + 3)]
      : [...BASE_HAND];

  return {
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      hand: mkHand(i),
      discard: [],
      court: courts[i],
      lastActionSeq: -1,
      emptyHandSeq: null,
    })),
    regions,
    slots,
    supply: bag,
    instabilityInFrance: INSTABILITY_DISCS,
    currentPlayerIndex: 0,
    consecutivePasses: 0,
    pendingSummon: false,
    actionSeq: 0,
    lastSwap: null,
    struggles: [],
    phase: "playing",
    ending: null,
    advanced,
    seed,
  };
}

// ===========================================================================
// Selectors
// ===========================================================================

export function currentPlayer(state: Tkid2State): Tkid2Player {
  return state.players[state.currentPlayerIndex] ?? state.players[0];
}

export function isGameOver(state: Tkid2State): boolean {
  return state.phase === "ended";
}

/** A region is open while it has neither a control nor an instability disc. */
export function isOpen(state: Tkid2State, id: RegionId): boolean {
  const r = state.regions[id];
  return r.control === null && !r.unstable;
}

/** The region whose power struggle resolves next (lowest face-up space). */
export function contestedRegionId(state: Tkid2State): RegionId | null {
  const slot = state.slots.find((s) => s.faceUp);
  return slot ? slot.regionId : null;
}

/** Faction with a strict follower majority in the counts, else null. */
export function majorityFaction(cubes: FactionCounts): Faction | null {
  const max = Math.max(...FACTIONS.map((f) => cubes[f]));
  if (max === 0) return null;
  const leaders = FACTIONS.filter((f) => cubes[f] === max);
  return leaders.length === 1 ? leaders[0] : null;
}

/** Instability discs already placed on the board. */
export function instabilityOnBoard(state: Tkid2State): number {
  return INSTABILITY_DISCS - state.instabilityInFrance;
}

/** Regions currently controlled by each faction. */
export function controlledCounts(state: Tkid2State): FactionCounts {
  const counts = zeroCounts();
  for (const id of REGION_IDS) {
    const c = state.regions[id].control;
    if (c) counts[c] += 1;
  }
  return counts;
}

/** Open regions that border a region controlled by `faction`, or — while the
 *  faction's home region is open — regions bordering its home region. */
export function supportTargets(state: Tkid2State, faction: Faction): RegionId[] {
  const targets = new Set<RegionId>();
  for (const r of REGIONS) {
    if (!isOpen(state, r.id)) continue;
    const bordersControlled = r.adjacent.some(
      (a) => state.regions[a].control === faction,
    );
    const bordersOpenHome =
      isOpen(state, HOME_REGION[faction]) &&
      r.adjacent.includes(HOME_REGION[faction]);
    if (bordersControlled || bordersOpenHome) targets.add(r.id);
  }
  return Array.from(targets);
}

/** All (region, faction) pairs from which a follower can be summoned. */
export function summonOptions(
  state: Tkid2State,
): { regionId: RegionId; faction: Faction }[] {
  const out: { regionId: RegionId; faction: Faction }[] = [];
  for (const id of REGION_IDS) {
    for (const f of FACTIONS) {
      if (state.regions[id].cubes[f] > 0) out.push({ regionId: id, faction: f });
    }
  }
  return out;
}

// ===========================================================================
// Card parameter enumeration
// ===========================================================================
// For every card we enumerate candidate parameter assignments together with a
// "completeness" score. The rulebook requires resolving an action as fully as
// possible, so only the maximum-score candidates are legal. An empty list
// means the card can only be played for no effect (params: {}).

interface Candidate {
  params: CardParams;
  score: number;
}

function canonFactions(fs: Faction[]): Faction[] {
  return [...fs].sort();
}

/** Canonical serialization so params can be compared for legality. */
export function canonicalParams(cardId: CardId, params: CardParams): string {
  const p: CardParams = { ...params };
  if (p.from) p.from = { ...p.from, factions: canonFactions(p.from.factions) };
  if (p.to) p.to = { ...p.to, factions: canonFactions(p.to.factions) };
  if (p.returnFactions) p.returnFactions = canonFactions(p.returnFactions);
  if (p.placements) {
    p.placements = [...p.placements].sort((a, b) =>
      (a.regionId + a.faction).localeCompare(b.regionId + b.faction),
    );
  }
  if (p.slotA !== undefined && p.slotB !== undefined && p.slotA > p.slotB) {
    const t = p.slotA;
    p.slotA = p.slotB;
    p.slotB = t;
  }
  if (cardId === "manoeuvre" && p.from && p.to) {
    // The 1↔1 swap is symmetric; order the sides by region id.
    if (p.from.regionId > p.to.regionId) {
      const t = p.from;
      p.from = p.to;
      p.to = t;
    }
  }
  const spy = p.spyParams ? canonicalParams("spy", p.spyParams) : "";
  return JSON.stringify([
    p.regionId ?? "",
    p.faction ?? "",
    p.placements ?? [],
    p.returnFactions ?? [],
    p.slotA ?? -1,
    p.slotB ?? -1,
    p.discRegionId ?? "",
    p.from ?? null,
    p.to ?? null,
    p.spyPlayerId ?? "",
    spy,
  ]);
}

function openRegions(state: Tkid2State): RegionId[] {
  return REGION_IDS.filter((id) => isOpen(state, id));
}

function regionsWithCubes(state: Tkid2State): RegionId[] {
  return REGION_IDS.filter((id) => totalCubes(state.regions[id].cubes) > 0);
}

/** Distinct multisets of `n` factions available in `counts` (optionally from a
 *  restricted faction pool). */
function factionMultisets(
  counts: FactionCounts,
  n: number,
  pool: Faction[] = [...FACTIONS],
): Faction[][] {
  const out: Faction[][] = [];
  const rec = (start: number, remaining: number, acc: Faction[], used: FactionCounts) => {
    if (remaining === 0) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < pool.length; i++) {
      const f = pool[i];
      if (used[f] < counts[f]) {
        used[f] += 1;
        acc.push(f);
        rec(i, remaining - 1, acc, used);
        acc.pop();
        used[f] -= 1;
      }
    }
  };
  rec(0, n, [], zeroCounts());
  return out;
}

function supportCandidates(state: Tkid2State, faction: Faction): Candidate[] {
  const amount = Math.min(2, state.supply[faction]);
  if (amount === 0) return [];
  const targets = supportTargets(state, faction);
  return targets.map((regionId) => ({
    params: {
      regionId,
      placements: Array.from({ length: amount }, () => ({ regionId, faction })),
    },
    score: amount,
  }));
}

function assembleCandidates(state: Tkid2State): Candidate[] {
  const open = openRegions(state);
  if (open.length === 0) return [];
  const available = FACTIONS.filter((f) => state.supply[f] > 0);
  if (available.length === 0) return [];
  const out: Candidate[] = [];
  const rec = (i: number, acc: Placement[]) => {
    if (i === available.length) {
      out.push({ params: { placements: [...acc] }, score: acc.length });
      return;
    }
    for (const regionId of open) {
      acc.push({ regionId, faction: available[i] });
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function negotiateCandidates(state: Tkid2State): Candidate[] {
  const eligible = state.slots.filter((s) => s.faceUp && !s.negotiationDisc);
  if (eligible.length < 2) return [];
  const out: Candidate[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      for (const disc of [eligible[i].regionId, eligible[j].regionId]) {
        out.push({
          params: {
            slotA: eligible[i].position,
            slotB: eligible[j].position,
            discRegionId: disc,
          },
          score: 1,
        });
      }
    }
  }
  return out;
}

/** True when `candidate` would exactly reverse the previous swap made by
 *  another player with no card play in between. */
function isForbiddenUndo(
  state: Tkid2State,
  kind: "manoeuvre" | "outmanoeuvre",
  from: SwapSide,
  to: SwapSide,
): boolean {
  const last = state.lastSwap;
  if (!last || last.kind !== kind) return false;
  if (last.playerIndex === state.currentPlayerIndex) return false;
  if (last.seq !== state.actionSeq) return false; // another action intervened
  const same = (a: Faction[], b: Faction[]) =>
    a.length === b.length &&
    canonFactions(a).every((f, i) => f === canonFactions(b)[i]);
  if (kind === "manoeuvre") {
    // Undo of A.x↔B.y is swapping the moved cubes back: A.y↔B.x.
    return (
      ((from.regionId === last.from.regionId &&
        to.regionId === last.to.regionId &&
        same(from.factions, last.to.factions) &&
        same(to.factions, last.from.factions)) ||
        (from.regionId === last.to.regionId &&
          to.regionId === last.from.regionId &&
          same(from.factions, last.from.factions) &&
          same(to.factions, last.to.factions)))
    );
  }
  // Outmanoeuvre: undo of from=(A,[x]) to=(B,[y,z]) is from=(B,[x]) to=(A,[y,z]).
  return (
    from.regionId === last.to.regionId &&
    to.regionId === last.from.regionId &&
    same(from.factions, last.from.factions) &&
    same(to.factions, last.to.factions)
  );
}

function manoeuvreCandidates(state: Tkid2State): Candidate[] {
  const regions = regionsWithCubes(state).filter((id) => isOpen(state, id));
  const out: Candidate[] = [];
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      for (const fa of FACTIONS) {
        if (state.regions[a].cubes[fa] === 0) continue;
        for (const fb of FACTIONS) {
          if (state.regions[b].cubes[fb] === 0) continue;
          const from = { regionId: a, factions: [fa] };
          const to = { regionId: b, factions: [fb] };
          if (isForbiddenUndo(state, "manoeuvre", from, to)) continue;
          out.push({ params: { from, to }, score: 1 });
        }
      }
    }
  }
  return out;
}

function outmanoeuvreCandidates(state: Tkid2State): Candidate[] {
  const out: Candidate[] = [];
  for (const a of REGION_IDS) {
    if (!isOpen(state, a) || totalCubes(state.regions[a].cubes) === 0) continue;
    for (const b of REGION_BY_ID[a].adjacent) {
      if (!isOpen(state, b)) continue;
      for (const fa of FACTIONS) {
        if (state.regions[a].cubes[fa] === 0) continue;
        // Full swap: one follower from A for two followers in B.
        for (const pair of factionMultisets(state.regions[b].cubes, 2)) {
          const from = { regionId: a, factions: [fa] };
          const to = { regionId: b, factions: pair };
          if (isForbiddenUndo(state, "outmanoeuvre", from, to)) continue;
          out.push({ params: { from, to }, score: 2 });
        }
        // Partial: one for one (only legal when no full swap exists anywhere —
        // the max-score filter takes care of that).
        for (const fb of FACTIONS) {
          if (state.regions[b].cubes[fb] === 0) continue;
          const from = { regionId: a, factions: [fa] };
          const to = { regionId: b, factions: [fb] };
          if (isForbiddenUndo(state, "outmanoeuvre", from, to)) continue;
          out.push({ params: { from, to }, score: 1 });
        }
      }
    }
  }
  return out;
}

function ambushCandidates(state: Tkid2State): Candidate[] {
  const amount = Math.min(2, state.supply.scottish);
  const out: Candidate[] = [];
  for (const regionId of openRegions(state)) {
    // Weight placements above the return so "place two" is never skipped.
    const placeScore = amount * 4;
    const cubesAfter: FactionCounts = { ...state.regions[regionId].cubes };
    cubesAfter.scottish += amount;
    let any = false;
    for (const f of FACTIONS) {
      if (cubesAfter[f] > 0) {
        any = true;
        out.push({
          params: {
            regionId,
            placements: Array.from({ length: amount }, () => ({
              regionId,
              faction: "scottish" as Faction,
            })),
            returnFactions: [f],
          },
          score: placeScore + 1,
        });
      }
    }
    if (!any && amount > 0) {
      out.push({
        params: {
          regionId,
          placements: Array.from({ length: amount }, () => ({
            regionId,
            faction: "scottish" as Faction,
          })),
          returnFactions: [],
        },
        score: placeScore,
      });
    }
  }
  return out;
}

function marchCandidates(state: Tkid2State): Candidate[] {
  const out: Candidate[] = [];
  for (const a of REGION_IDS) {
    const cubes = state.regions[a].cubes;
    if (totalCubes(cubes) === 0) continue;
    for (const b of REGION_BY_ID[a].adjacent) {
      if (!isOpen(state, b)) continue;
      for (const pair of factionMultisets(cubes, 2)) {
        out.push({
          params: { from: { regionId: a, factions: pair }, to: { regionId: b, factions: [] } },
          score: 2,
        });
      }
      for (const f of FACTIONS) {
        if (cubes[f] === 0) continue;
        out.push({
          params: { from: { regionId: a, factions: [f] }, to: { regionId: b, factions: [] } },
          score: 1,
        });
      }
    }
  }
  return out;
}

function aidCandidates(state: Tkid2State): Candidate[] {
  const max = Math.max(...FACTIONS.map((f) => state.supply[f]));
  if (max === 0) return [];
  const factions = FACTIONS.filter((f) => state.supply[f] === max);
  const out: Candidate[] = [];
  for (const faction of factions) {
    const amount = Math.min(2, state.supply[faction]);
    for (const regionId of openRegions(state)) {
      out.push({
        params: {
          regionId,
          faction,
          placements: Array.from({ length: amount }, () => ({ regionId, faction })),
        },
        score: amount,
      });
    }
  }
  return out;
}

/** Influence (1 English ↔ 2 non-English) and Dispute (1 Welsh ↔ 1 non-Welsh). */
function factionSwapCandidates(
  state: Tkid2State,
  faction: Faction,
  otherCount: number,
  bordering: boolean,
  ownCount = 1,
): Candidate[] {
  const others = FACTIONS.filter((f) => f !== faction);
  const out: Candidate[] = [];
  for (const a of REGION_IDS) {
    if (!isOpen(state, a)) continue;
    const have = state.regions[a].cubes[faction];
    if (have === 0) continue;
    const bList = bordering ? REGION_BY_ID[a].adjacent : REGION_IDS.filter((r) => r !== a);
    for (const b of bList) {
      if (!isOpen(state, b)) continue;
      const full = Math.min(ownCount, have);
      // Enumerate every (own m, other n) combination up to the full swap;
      // the max-score filter keeps only the most complete ones.
      for (let m = 1; m <= full; m++) {
        for (let n = 1; n <= otherCount; n++) {
          for (const set of factionMultisets(state.regions[b].cubes, n, others)) {
            out.push({
              params: {
                from: { regionId: a, factions: Array.from({ length: m }, () => faction) },
                to: { regionId: b, factions: set },
              },
              score: m === ownCount && n === otherCount ? 10 : m + n,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Regions eligible for the Scottish/Welsh/English cunning removal cards. */
function cunningTargets(state: Tkid2State, faction: Faction): RegionId[] {
  return supportTargets(state, faction);
}

/** Quell / Muster: return one `faction` follower from an eligible region, then
 *  place two followers from the supply into that region. */
function returnAndPlaceCandidates(state: Tkid2State, faction: Faction): Candidate[] {
  const targets = cunningTargets(state, faction);
  if (targets.length === 0) return [];
  const withFollower = targets.filter((r) => state.regions[r].cubes[faction] > 0);
  const out: Candidate[] = [];
  const placementsFor = (
    regionId: RegionId,
    extraSupply: FactionCounts,
  ): Placement[][] => {
    const supply: FactionCounts = { ...state.supply };
    for (const f of FACTIONS) supply[f] += extraSupply[f];
    const n = Math.min(2, totalCubes(supply));
    if (n === 0) return [[]];
    return factionMultisets(supply, n).map((set) =>
      set.map((f) => ({ regionId, faction: f })),
    );
  };
  if (withFollower.length > 0) {
    for (const regionId of withFollower) {
      const extra = zeroCounts();
      extra[faction] = 1; // the returned follower is back in the supply
      for (const placements of placementsFor(regionId, extra)) {
        out.push({
          params: { regionId, returnFactions: [faction], placements },
          score: 8 + placements.length,
        });
      }
    }
    return out;
  }
  // Fallback: no such follower in any eligible region — just place two.
  for (const regionId of targets) {
    for (const placements of placementsFor(regionId, zeroCounts())) {
      if (placements.length === 0) continue;
      out.push({
        params: { regionId, returnFactions: [], placements },
        score: placements.length,
      });
    }
  }
  return out;
}

function suppressCandidates(state: Tkid2State): Candidate[] {
  const targets = cunningTargets(state, "english");
  if (targets.length === 0) return [];
  const out: Candidate[] = [];
  for (const regionId of targets) {
    const cubes = state.regions[regionId].cubes;
    const hasEnglish = cubes.english > 0;
    // Choose the second returned follower from the region (after the English
    // one has left) and the placed follower from the supply.
    const afterEnglish: FactionCounts = { ...cubes };
    if (hasEnglish) afterEnglish.english -= 1;
    const seconds = hasEnglish
      ? FACTIONS.filter((f) => afterEnglish[f] > 0)
      : FACTIONS.filter((f) => cubes[f] > 0);
    const returnedBase: Faction[] = hasEnglish ? ["english"] : [];
    const options: Faction[][] =
      seconds.length > 0
        ? seconds.map((f) => [...returnedBase, f])
        : returnedBase.length > 0
          ? [returnedBase]
          : [];
    for (const returnFactions of options.length > 0 ? options : [[] as Faction[]]) {
      const supply: FactionCounts = { ...state.supply };
      for (const f of returnFactions) supply[f] += 1;
      const placeable = FACTIONS.filter((f) => supply[f] > 0);
      const score =
        (returnFactions.includes("english") ? 8 : 0) +
        (returnFactions.length > (hasEnglish ? 1 : 0) ? 4 : 0) +
        (placeable.length > 0 ? 1 : 0);
      if (placeable.length === 0) {
        if (returnFactions.length > 0) {
          out.push({ params: { regionId, returnFactions, placements: [] }, score });
        }
        continue;
      }
      for (const f of placeable) {
        out.push({
          params: {
            regionId,
            returnFactions,
            placements: [{ regionId, faction: f }],
          },
          score,
        });
      }
    }
  }
  return out;
}

function spyCandidates(state: Tkid2State, depth = 0): Candidate[] {
  if (depth > 1) return [];
  const me = state.currentPlayerIndex;
  const out: Candidate[] = [];
  state.players.forEach((p, idx) => {
    if (idx === me || p.discard.length === 0) return;
    const top = p.discard[p.discard.length - 1];
    // A Spy on top of a Spy would recurse forever; skip those piles.
    if (top === "spy") return;
    const inner = cardCandidates(state, top, depth + 1);
    if (inner.length === 0) {
      out.push({ params: { spyPlayerId: p.id, spyParams: {} }, score: 1 });
      return;
    }
    const best = Math.max(...inner.map((c) => c.score));
    for (const c of inner) {
      if (c.score !== best) continue;
      out.push({
        params: { spyPlayerId: p.id, spyParams: c.params },
        score: 1,
      });
    }
  });
  return out;
}

function cardCandidates(state: Tkid2State, cardId: CardId, depth = 0): Candidate[] {
  switch (cardId) {
    case "scottish-support":
      return supportCandidates(state, "scottish");
    case "welsh-support":
      return supportCandidates(state, "welsh");
    case "english-support":
      return supportCandidates(state, "english");
    case "assemble-1":
    case "assemble-2":
      return assembleCandidates(state);
    case "negotiate":
      return negotiateCandidates(state);
    case "manoeuvre":
      return manoeuvreCandidates(state);
    case "outmanoeuvre":
      return outmanoeuvreCandidates(state);
    case "spy":
      return spyCandidates(state, depth);
    case "ambush":
      return ambushCandidates(state);
    case "march":
      return marchCandidates(state);
    case "plot":
      return []; // never playable
    case "aid":
      return aidCandidates(state);
    case "influence":
      return factionSwapCandidates(state, "english", 2, false);
    case "dispute":
      return factionSwapCandidates(state, "welsh", 1, false);
    case "edict":
      return factionSwapCandidates(state, "scottish", 2, true, 2);
    case "resist": {
      const targets = supportTargets(state, "scottish");
      const pool = FACTIONS.filter((f) => f !== "scottish");
      const n = Math.min(
        2,
        pool.reduce((a, f) => a + state.supply[f], 0),
      );
      if (n === 0) return [];
      const out: Candidate[] = [];
      for (const regionId of targets) {
        for (const set of factionMultisets(state.supply, n, pool)) {
          out.push({
            params: {
              regionId,
              placements: set.map((f) => ({ regionId, faction: f })),
            },
            score: n,
          });
        }
      }
      return out;
    }
    case "quell":
      return returnAndPlaceCandidates(state, "welsh");
    case "muster":
      return returnAndPlaceCandidates(state, "scottish");
    case "suppress":
      return suppressCandidates(state);
    default:
      return [];
  }
}

/**
 * All legal parameter assignments for playing `cardId` right now. An empty
 * array means the card may only be played for no effect (empty params).
 */
export function enumerateCardParams(state: Tkid2State, cardId: CardId): CardParams[] {
  if (cardId === "plot") return [];
  const candidates = cardCandidates(state, cardId);
  if (candidates.length === 0) return [];
  const best = Math.max(...candidates.map((c) => c.score));
  const seen = new Set<string>();
  const out: CardParams[] = [];
  for (const c of candidates) {
    if (c.score !== best) continue;
    const key = canonicalParams(cardId, c.params);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.params);
  }
  return out;
}

// ===========================================================================
// Legal actions
// ===========================================================================

export function legalActions(state: Tkid2State): Tkid2Action[] {
  if (state.phase === "ended") return [];
  if (state.pendingSummon) {
    return summonOptions(state).map((o) => ({
      type: "summon" as const,
      regionId: o.regionId,
      faction: o.faction,
    }));
  }
  const player = currentPlayer(state);
  const actions: Tkid2Action[] = [{ type: "pass" }];
  for (const cardId of player.hand) {
    if (cardId === "plot") continue;
    const paramSets = enumerateCardParams(state, cardId);
    if (paramSets.length === 0) {
      actions.push({ type: "play", cardId, params: {} });
    } else {
      for (const params of paramSets) actions.push({ type: "play", cardId, params });
    }
  }
  return actions;
}

// ===========================================================================
// Applying actions
// ===========================================================================

function clone(state: Tkid2State): Tkid2State {
  return JSON.parse(JSON.stringify(state)) as Tkid2State;
}

function reject(state: Tkid2State, error: string): ApplyResult {
  return { state, events: [], error };
}

/** Mutates `state`: performs the board effect of `cardId` with `params`. */
function resolveCardEffect(state: Tkid2State, cardId: CardId, params: CardParams): void {
  switch (cardId) {
    case "scottish-support":
    case "welsh-support":
    case "english-support":
    case "assemble-1":
    case "assemble-2":
    case "aid":
    case "resist": {
      for (const pl of params.placements ?? []) {
        if (state.supply[pl.faction] > 0) {
          state.supply[pl.faction] -= 1;
          state.regions[pl.regionId].cubes[pl.faction] += 1;
        }
      }
      break;
    }
    case "negotiate": {
      if (params.slotA === undefined || params.slotB === undefined) break;
      const a = state.slots.find((s) => s.position === params.slotA);
      const b = state.slots.find((s) => s.position === params.slotB);
      if (!a || !b) break;
      const tmp = a.regionId;
      a.regionId = b.regionId;
      b.regionId = tmp;
      // The negotiation disc travels with the chosen card.
      const target = [a, b].find((s) => s.regionId === params.discRegionId);
      if (target) target.negotiationDisc = true;
      break;
    }
    case "manoeuvre":
    case "outmanoeuvre":
    case "influence":
    case "dispute":
    case "edict": {
      const { from, to } = params;
      if (!from || !to) break;
      for (const f of from.factions) {
        state.regions[from.regionId].cubes[f] -= 1;
        state.regions[to.regionId].cubes[f] += 1;
      }
      for (const f of to.factions) {
        state.regions[to.regionId].cubes[f] -= 1;
        state.regions[from.regionId].cubes[f] += 1;
      }
      if (cardId === "manoeuvre" || cardId === "outmanoeuvre") {
        state.lastSwap = {
          kind: cardId,
          playerIndex: state.currentPlayerIndex,
          seq: state.actionSeq + 1,
          from: { regionId: from.regionId, factions: canonFactions(from.factions) },
          to: { regionId: to.regionId, factions: canonFactions(to.factions) },
        };
      }
      break;
    }
    case "march": {
      const { from, to } = params;
      if (!from || !to) break;
      for (const f of from.factions) {
        state.regions[from.regionId].cubes[f] -= 1;
        state.regions[to.regionId].cubes[f] += 1;
      }
      break;
    }
    case "ambush": {
      for (const pl of params.placements ?? []) {
        if (state.supply[pl.faction] > 0) {
          state.supply[pl.faction] -= 1;
          state.regions[pl.regionId].cubes[pl.faction] += 1;
        }
      }
      for (const f of params.returnFactions ?? []) {
        if (params.regionId && state.regions[params.regionId].cubes[f] > 0) {
          state.regions[params.regionId].cubes[f] -= 1;
          state.supply[f] += 1;
        }
      }
      break;
    }
    case "quell":
    case "muster":
    case "suppress": {
      const regionId = params.regionId;
      if (!regionId) break;
      for (const f of params.returnFactions ?? []) {
        if (state.regions[regionId].cubes[f] > 0) {
          state.regions[regionId].cubes[f] -= 1;
          state.supply[f] += 1;
        }
      }
      for (const pl of params.placements ?? []) {
        if (state.supply[pl.faction] > 0) {
          state.supply[pl.faction] -= 1;
          state.regions[pl.regionId].cubes[pl.faction] += 1;
        }
      }
      break;
    }
    case "spy":
      // Handled by the caller (needs the target's top discard).
      break;
    case "plot":
      break;
  }
}

function resolvePowerStruggle(state: Tkid2State, events: Tkid2Event[]): void {
  const slot = state.slots.find((s) => s.faceUp);
  if (!slot) return;
  const regionId = slot.regionId;
  const region = state.regions[regionId];
  const cubes: FactionCounts = { ...region.cubes };
  const winner = majorityFaction(cubes);

  if (winner) {
    region.control = winner;
  } else {
    region.unstable = true;
    state.instabilityInFrance -= 1;
  }
  // All followers in the region return to the supply.
  for (const f of FACTIONS) {
    state.supply[f] += region.cubes[f];
    region.cubes[f] = 0;
  }
  slot.faceUp = false;

  const record: StruggleRecord = {
    regionId,
    outcome: winner ?? "unstable",
    cubes,
  };
  state.struggles.push(record);
  events.push({ kind: "struggle", record });

  if (state.instabilityInFrance === 0) {
    state.phase = "ended";
    state.ending = "invasion";
    events.push({ kind: "invasion" });
    return;
  }
  if (state.slots.every((s) => !s.faceUp)) {
    state.phase = "ended";
    state.ending = "coronation";
    events.push({ kind: "coronation" });
  }
}

function advanceTurn(state: Tkid2State): void {
  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
}

export function applyAction(state: Tkid2State, action: Tkid2Action): ApplyResult {
  if (state.phase === "ended") return reject(state, "The game has ended");

  if (action.type === "summon") {
    if (!state.pendingSummon) return reject(state, "No summon is pending");
    const region = state.regions[action.regionId];
    if (!region || region.cubes[action.faction] <= 0) {
      return reject(state, "No such follower to summon");
    }
    const next = clone(state);
    const player = next.players[next.currentPlayerIndex];
    next.regions[action.regionId].cubes[action.faction] -= 1;
    player.court[action.faction] += 1;
    next.pendingSummon = false;
    advanceTurn(next);
    return {
      state: next,
      events: [
        {
          kind: "summoned",
          playerId: player.id,
          regionId: action.regionId,
          faction: action.faction,
        },
      ],
    };
  }

  if (state.pendingSummon) {
    return reject(state, "You must summon a follower to your court first");
  }

  if (action.type === "pass") {
    const next = clone(state);
    const events: Tkid2Event[] = [
      { kind: "passed", playerId: currentPlayer(next).id },
    ];
    next.consecutivePasses += 1;
    advanceTurn(next);
    if (next.consecutivePasses >= next.players.length) {
      next.consecutivePasses = 0;
      resolvePowerStruggle(next, events);
    }
    return { state: next, events };
  }

  // action.type === "play"
  const player = currentPlayer(state);
  if (!player.hand.includes(action.cardId)) {
    return reject(state, "That card is not in your hand");
  }
  if (action.cardId === "plot") {
    return reject(state, "Plot cannot be taken during the game");
  }

  // Validate params against the enumerated legal assignments.
  const legal = enumerateCardParams(state, action.cardId);
  if (legal.length === 0) {
    const empty =
      !action.params ||
      Object.keys(action.params).length === 0 ||
      canonicalParams(action.cardId, action.params) ===
        canonicalParams(action.cardId, {});
    if (!empty) return reject(state, "This card can only be played for no effect");
  } else {
    const key = canonicalParams(action.cardId, action.params);
    if (!legal.some((p) => canonicalParams(action.cardId, p) === key)) {
      return reject(state, "Illegal parameters for this card");
    }
  }

  const next = clone(state);
  const events: Tkid2Event[] = [];
  const np = next.players[next.currentPlayerIndex];

  if (action.cardId === "spy" && action.params.spyPlayerId) {
    const target = next.players.find((p) => p.id === action.params.spyPlayerId);
    const top = target?.discard[target.discard.length - 1];
    if (top) {
      resolveCardEffect(next, top, action.params.spyParams ?? {});
      events.push({
        kind: "played",
        playerId: np.id,
        cardId: top,
        viaSpy: true,
        params: action.params.spyParams ?? {},
      });
    }
  } else {
    resolveCardEffect(next, action.cardId, action.params);
  }

  np.hand = np.hand.filter((c) => c !== action.cardId);
  np.discard.push(action.cardId);
  next.actionSeq += 1;
  np.lastActionSeq = next.actionSeq;
  if (np.hand.filter((c) => c !== "plot").length === 0 && np.emptyHandSeq === null) {
    // Plot is never playable, so a hand holding only Plot counts as played out.
    np.emptyHandSeq = next.actionSeq;
  }
  next.consecutivePasses = 0;
  events.unshift({
    kind: "played",
    playerId: np.id,
    cardId: action.cardId,
    params: action.params,
  });

  // Summon a follower to court — mandatory, skipped only when impossible.
  if (summonOptions(next).length > 0) {
    next.pendingSummon = true;
  } else {
    events.push({ kind: "summonSkipped", playerId: np.id });
    advanceTurn(next);
  }
  return { state: next, events };
}

// ===========================================================================
// Scoring
// ===========================================================================

export interface FactionStanding {
  faction: Faction;
  regions: number;
  /** Index in `struggles` of this faction's most recent win (-1 = never). */
  lastWin: number;
}

/** Factions ranked most → least powerful (regions, then most recent win). */
export function factionStandings(state: Tkid2State): FactionStanding[] {
  const counts = controlledCounts(state);
  const lastWin = (f: Faction) => {
    for (let i = state.struggles.length - 1; i >= 0; i--) {
      if (state.struggles[i].outcome === f) return i;
    }
    return -1;
  };
  return FACTIONS.map((f) => ({ faction: f, regions: counts[f], lastWin: lastWin(f) })).sort(
    (a, b) => b.regions - a.regions || b.lastWin - a.lastWin,
  );
}

export function hasPlot(player: Tkid2Player): boolean {
  return player.hand.includes("plot");
}

/** Complete sets (one follower of each faction) in a court. */
export function setCount(court: FactionCounts): number {
  return Math.min(court.scottish, court.welsh, court.english);
}

/** Sets counting an unplayed Plot card as one follower of the best faction. */
export function setCountWithPlot(court: FactionCounts, plot: boolean): number {
  if (!plot) return setCount(court);
  let best = setCount(court);
  for (const f of FACTIONS) {
    const c = { ...court };
    c[f] += 1;
    best = Math.max(best, setCount(c));
  }
  return best;
}

export interface PlayerResult {
  playerId: PlayerId;
  name: string;
  /** Invasion: complete sets. Coronation: followers of the strongest faction. */
  score: number;
  /** Coronation only: followers of the second faction (tiebreak). */
  secondary: number;
  winner: boolean;
  plot: boolean;
}

export interface GameResult {
  ending: Ending;
  standings: FactionStanding[];
  results: PlayerResult[];
  winnerIds: PlayerId[];
  /** In a four-player game, teammates share victory. */
  teams: boolean;
}

function teammateIndex(state: Tkid2State, idx: number): number | null {
  return state.players.length === 4 ? (idx + 2) % 4 : null;
}

export function gameResult(state: Tkid2State): GameResult | null {
  if (state.phase !== "ended" || !state.ending) return null;
  const standings = factionStandings(state);
  const teams = state.players.length === 4;

  if (state.ending === "invasion") {
    // Winner: most complete sets of followers (teams combine their courts).
    const rows: PlayerResult[] = state.players.map((p, i) => {
      const mateIdx = teammateIndex(state, i);
      const court: FactionCounts = { ...p.court };
      let plot = hasPlot(p);
      if (mateIdx !== null) {
        const mate = state.players[mateIdx];
        for (const f of FACTIONS) court[f] += mate.court[f];
        plot = plot || hasPlot(mate);
      }
      return {
        playerId: p.id,
        name: p.name,
        score: setCountWithPlot(court, plot),
        secondary: 0,
        winner: false,
        plot: hasPlot(p),
      };
    });
    const bestSets = Math.max(...rows.map((r) => r.score));
    let tied = state.players
      .map((_, i) => i)
      .filter((i) => rows[i].score === bestSets);
    if (tied.length > 1) {
      // Tiebreak: whoever (whose team) most recently played an action card.
      const recency = (i: number) => {
        const mateIdx = teammateIndex(state, i);
        return Math.max(
          state.players[i].lastActionSeq,
          mateIdx !== null ? state.players[mateIdx].lastActionSeq : -1,
        );
      };
      const bestRecency = Math.max(...tied.map(recency));
      tied = tied.filter((i) => recency(i) === bestRecency);
    }
    const winnerSet = new Set<number>(tied);
    if (teams) {
      for (const i of Array.from(winnerSet)) {
        const mateIdx = teammateIndex(state, i);
        if (mateIdx !== null) winnerSet.add(mateIdx);
      }
    }
    winnerSet.forEach((i) => (rows[i].winner = true));
    return {
      ending: "invasion",
      standings,
      results: rows,
      winnerIds: Array.from(winnerSet).map((i) => state.players[i].id),
      teams,
    };
  }

  // Coronation: most followers of the most powerful faction in court.
  const [first, second] = [standings[0].faction, standings[1].faction];
  const rows: PlayerResult[] = state.players.map((p) => {
    // An unplayed Plot counts as one follower of a faction of the holder's
    // choice — the engine assumes the optimal choice (the strongest faction,
    // falling back to the runner-up when that breaks a tie better).
    let score = p.court[first];
    let secondary = p.court[second];
    if (hasPlot(p)) score += 1;
    return {
      playerId: p.id,
      name: p.name,
      score,
      secondary,
      winner: false,
      plot: hasPlot(p),
    };
  });
  const bestScore = Math.max(...rows.map((r) => r.score));
  let tied = rows.map((_, i) => i).filter((i) => rows[i].score === bestScore);
  if (tied.length > 1) {
    const bestSecondary = Math.max(...tied.map((i) => rows[i].secondary));
    tied = tied.filter((i) => rows[i].secondary === bestSecondary);
  }
  if (tied.length > 1) {
    // Plot supersedes the normal tiebreaker when tied among the top factions.
    const plotters = tied.filter((i) => hasPlot(state.players[i]));
    if (plotters.length >= 1 && plotters.length < tied.length) tied = plotters;
  }
  if (tied.length > 1) {
    // Player (or team) who first played all their action cards wins.
    const emptySeq = (i: number) => {
      const own = state.players[i].emptyHandSeq;
      if (!teams) return own ?? Number.POSITIVE_INFINITY;
      const mateIdx = teammateIndex(state, i)!;
      const mate = state.players[mateIdx].emptyHandSeq;
      return own === null || mate === null
        ? Number.POSITIVE_INFINITY
        : Math.max(own, mate);
    };
    const best = Math.min(...tied.map(emptySeq));
    if (best !== Number.POSITIVE_INFINITY) {
      tied = tied.filter((i) => emptySeq(i) === best);
    }
  }
  const winnerSet = new Set<number>(tied);
  if (teams) {
    for (const i of Array.from(winnerSet)) {
      const mateIdx = teammateIndex(state, i);
      if (mateIdx !== null) winnerSet.add(mateIdx);
    }
  }
  winnerSet.forEach((i) => (rows[i].winner = true));
  return {
    ending: "coronation",
    standings,
    results: rows,
    winnerIds: Array.from(winnerSet).map((i) => state.players[i].id),
    teams,
  };
}
