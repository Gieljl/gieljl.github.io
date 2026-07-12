/**
 * Multi-step target selection for playing an action card.
 *
 * The engine enumerates every legal parameter assignment for a card
 * (`enumerateCardParams`). This module turns that list into a guided,
 * click-by-click flow on the board: each pick (a region, a follower cube, a
 * region-card slot, or a labelled variant) filters the remaining options
 * until exactly one legal assignment is left, which is then dispatched.
 * Because every candidate comes from the engine, only legal plays can ever
 * be produced.
 */
import {
  CARD_INFO,
  CardId,
  CardParams,
  FACTION_LABEL,
  Faction,
  PlayerId,
  RegionId,
  regionName,
} from "./engine/tkid2Engine";

export interface CubeRef {
  regionId: RegionId;
  faction: Faction;
}

export function cubeKey(c: CubeRef): string {
  return `${c.regionId}:${c.faction}`;
}

export interface Selection {
  /** Card being played from hand (for Spy this stays "spy"). */
  cardId: CardId;
  /** Card whose effect is being resolved (Spy: the copied card). */
  effectiveCardId: CardId;
  spyPlayerId?: PlayerId;
  /** Remaining legal parameter assignments (inner params for Spy). */
  options: CardParams[];
  regionsPicked: RegionId[];
  cubesPicked: CubeRef[];
  slotsPicked: number[];
}

export interface SelectionTargets {
  prompt: string;
  regions?: RegionId[];
  cubes?: CubeRef[];
  slots?: number[];
  variants?: { label: string; params: CardParams }[];
  /** Set when the selection is complete: dispatch these params. */
  done?: CardParams;
}

const REGION_FIRST: CardId[] = [
  "scottish-support",
  "welsh-support",
  "english-support",
  "resist",
  "aid",
  "ambush",
  "quell",
  "muster",
  "suppress",
];

const CUBE_SWAP: CardId[] = [
  "manoeuvre",
  "outmanoeuvre",
  "march",
  "influence",
  "dispute",
  "edict",
];

// ---------------------------------------------------------------------------
// Multiset helpers over cube references
// ---------------------------------------------------------------------------

function optionCubes(cardId: CardId, p: CardParams): CubeRef[] {
  const out: CubeRef[] = [];
  // March moves cubes out of one region; only the source side is clickable.
  const sides = cardId === "march" ? [p.from] : [p.from, p.to];
  for (const side of sides) {
    if (!side) continue;
    for (const f of side.factions) out.push({ regionId: side.regionId, faction: f });
  }
  return out;
}

function counted(cubes: CubeRef[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cubes) m.set(cubeKey(c), (m.get(cubeKey(c)) ?? 0) + 1);
  return m;
}

/** picks ⊆ option cubes (as multisets). */
function isCompatible(cardId: CardId, option: CardParams, picks: CubeRef[]): boolean {
  const have = counted(optionCubes(cardId, option));
  const want = counted(picks);
  for (const [k, n] of Array.from(want.entries())) {
    if ((have.get(k) ?? 0) < n) return false;
  }
  return true;
}

/** Distinct cubes that could be the next pick for any compatible option. */
function remainderCubes(cardId: CardId, options: CardParams[], picks: CubeRef[]): CubeRef[] {
  const seen = new Set<string>();
  const out: CubeRef[] = [];
  const want = counted(picks);
  for (const o of options) {
    const have = counted(optionCubes(cardId, o));
    for (const [k, n] of Array.from(have.entries())) {
      if (n > (want.get(k) ?? 0) && !seen.has(k)) {
        seen.add(k);
        const [regionId, faction] = k.split(":") as [RegionId, Faction];
        out.push({ regionId, faction });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function factionList(fs: Faction[]): string {
  return fs.map((f) => FACTION_LABEL[f]).join(" + ");
}

/** Human-readable label for a fully specified variant. */
export function describeVariant(cardId: CardId, p: CardParams): string {
  const parts: string[] = [];
  if (p.returnFactions && p.returnFactions.length > 0) {
    parts.push(`Return ${factionList(p.returnFactions)}`);
  }
  if (p.placements && p.placements.length > 0) {
    parts.push(`Place ${factionList(p.placements.map((pl) => pl.faction))}`);
  }
  if (p.discRegionId) {
    parts.push(`Disc on ${regionName(p.discRegionId)}`);
  }
  if (parts.length === 0 && p.faction) parts.push(FACTION_LABEL[p.faction]);
  return parts.length > 0 ? parts.join(" · ") : "Resolve";
}

// ---------------------------------------------------------------------------
// The selection state machine
// ---------------------------------------------------------------------------

export function startSelection(
  cardId: CardId,
  options: CardParams[],
  spy?: { playerId: PlayerId; effectiveCardId: CardId },
): Selection {
  return {
    cardId,
    effectiveCardId: spy ? spy.effectiveCardId : cardId,
    spyPlayerId: spy?.playerId,
    options,
    regionsPicked: [],
    cubesPicked: [],
    slotsPicked: [],
  };
}

/** Wraps inner params back into Spy params when needed. */
export function finalParams(sel: Selection, inner: CardParams): CardParams {
  if (sel.cardId === "spy" && sel.spyPlayerId) {
    return { spyPlayerId: sel.spyPlayerId, spyParams: inner };
  }
  return inner;
}

export function getTargets(sel: Selection): SelectionTargets {
  const card = CARD_INFO[sel.effectiveCardId];
  const id = sel.effectiveCardId;

  // A single remaining assignment is fully determined — dispatch it.
  if (sel.options.length === 1) {
    return { prompt: card.name, done: sel.options[0] };
  }

  if (id === "assemble-1" || id === "assemble-2") {
    const i = sel.regionsPicked.length;
    const faction = sel.options[0]?.placements?.[i]?.faction;
    if (faction) {
      const regions = distinct(sel.options.map((o) => o.placements![i].regionId));
      return {
        prompt: `Assemble — place the ${FACTION_LABEL[faction]} follower. Choose a region.`,
        regions,
      };
    }
    return { prompt: card.name, done: sel.options[0] };
  }

  if (REGION_FIRST.includes(id)) {
    if (sel.regionsPicked.length === 0) {
      const regions = distinct(
        sel.options.map((o) => o.regionId).filter((r): r is RegionId => !!r),
      );
      return { prompt: `${card.name} — choose a region.`, regions };
    }
    return {
      prompt: `${card.name} — choose how to resolve it.`,
      variants: sel.options.map((o) => ({ label: describeVariant(id, o), params: o })),
    };
  }

  if (id === "negotiate") {
    if (sel.slotsPicked.length < 2) {
      const slots = distinct(
        sel.options
          .flatMap((o) => [o.slotA, o.slotB])
          .filter((s): s is number => s !== undefined && !sel.slotsPicked.includes(s)),
      );
      return {
        prompt:
          sel.slotsPicked.length === 0
            ? "Negotiate — choose the first region card to swap."
            : "Negotiate — choose the second region card to swap.",
        slots,
      };
    }
    return {
      prompt: "Negotiate — place your negotiation disc on one of the swapped cards.",
      variants: sel.options.map((o) => ({
        label: `Disc on ${regionName(o.discRegionId!)}`,
        params: o,
      })),
    };
  }

  if (CUBE_SWAP.includes(id)) {
    if (id === "march") {
      const fromSize = sel.options[0]?.from?.factions.length ?? 0;
      if (sel.cubesPicked.length >= fromSize) {
        const regions = distinct(sel.options.map((o) => o.to!.regionId));
        return {
          prompt: "March — choose the bordering region to move them to.",
          regions,
        };
      }
    }
    const cubes = remainderCubes(id, sel.options, sel.cubesPicked);
    const prompts: Partial<Record<CardId, string[]>> = {
      manoeuvre: [
        "Manoeuvre — select the first follower to swap.",
        "Manoeuvre — select the follower to swap it with (in another region).",
      ],
      outmanoeuvre: [
        "Outmanoeuvre — select a follower to swap.",
        "Outmanoeuvre — select the follower(s) in a bordering region to swap it with.",
      ],
      march: ["March — select the follower(s) to move (from one region)."],
      influence: [
        "Influence — select an English follower.",
        "Influence — select the non-English follower(s) to swap it with.",
      ],
      dispute: [
        "Dispute — select a Welsh follower.",
        "Dispute — select the non-Welsh follower to swap it with.",
      ],
      edict: [
        "Edict — select the Scottish follower(s).",
        "Edict — select the non-Scottish follower(s) in a bordering region.",
      ],
    };
    const stepPrompts = prompts[id] ?? ["Select a follower."];
    const step = Math.min(sel.cubesPicked.length, stepPrompts.length - 1);
    return { prompt: stepPrompts[step], cubes };
  }

  // Fallback: offer everything as labelled variants.
  return {
    prompt: `${card.name} — choose how to resolve it.`,
    variants: sel.options.map((o) => ({ label: describeVariant(id, o), params: o })),
  };
}

export function pickRegion(sel: Selection, regionId: RegionId): Selection {
  const id = sel.effectiveCardId;
  if (id === "assemble-1" || id === "assemble-2") {
    const i = sel.regionsPicked.length;
    const options = sel.options.filter((o) => o.placements?.[i]?.regionId === regionId);
    if (options.length === 0) return sel;
    return { ...sel, regionsPicked: [...sel.regionsPicked, regionId], options };
  }
  if (REGION_FIRST.includes(id)) {
    const options = sel.options.filter((o) => o.regionId === regionId);
    if (options.length === 0) return sel;
    return { ...sel, regionsPicked: [...sel.regionsPicked, regionId], options };
  }
  if (id === "march") {
    const options = sel.options.filter((o) => o.to!.regionId === regionId);
    if (options.length === 0) return sel;
    return { ...sel, regionsPicked: [...sel.regionsPicked, regionId], options };
  }
  return sel;
}

export function pickCube(sel: Selection, cube: CubeRef): Selection {
  const id = sel.effectiveCardId;
  if (!CUBE_SWAP.includes(id)) return sel;
  const picks = [...sel.cubesPicked, cube];
  const options = sel.options.filter((o) => isCompatible(id, o, picks));
  if (options.length === 0) return sel; // illegal click — ignore
  return { ...sel, cubesPicked: picks, options };
}

export function pickSlot(sel: Selection, position: number): Selection {
  if (sel.effectiveCardId !== "negotiate") return sel;
  const picks = [...sel.slotsPicked, position];
  const options = sel.options.filter((o) =>
    picks.every((p) => o.slotA === p || o.slotB === p),
  );
  if (options.length === 0) return sel;
  return { ...sel, slotsPicked: picks, options };
}

export function pickVariant(sel: Selection, params: CardParams): Selection {
  return { ...sel, options: [params] };
}

function distinct<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
