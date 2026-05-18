// Shiplake game engine: scoring, categories, modifiers, and a simple bot AI.
// Self-contained, no Redux. Pure functions where possible.

export type Die = 1 | 2 | 3 | 4 | 5 | 6;
export type DiceRoll = Die[]; // length 5

export type CategoryId =
  | "ones"
  | "twos"
  | "threes"
  | "fours"
  | "fives"
  | "sixes"
  | "threeOfAKind"
  | "fourOfAKind"
  | "fullHouse"
  | "smallStraight"
  | "largeStraight"
  | "shiplake"
  | "chance";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  group: "upper" | "lower";
  /** Default credits awarded to winner of this category (across all sets). */
  credits: number;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "ones", label: "Ones", group: "upper", credits: 1 },
  { id: "twos", label: "Twos", group: "upper", credits: 1 },
  { id: "threes", label: "Threes", group: "upper", credits: 1 },
  { id: "fours", label: "Fours", group: "upper", credits: 1 },
  { id: "fives", label: "Fives", group: "upper", credits: 1 },
  { id: "sixes", label: "Sixes", group: "upper", credits: 1 },
  { id: "threeOfAKind", label: "Three of a Kind", group: "lower", credits: 1 },
  { id: "fourOfAKind", label: "Four of a Kind", group: "lower", credits: 1 },
  { id: "fullHouse", label: "Full House", group: "lower", credits: 1 },
  { id: "smallStraight", label: "Small Straight", group: "lower", credits: 1 },
  { id: "largeStraight", label: "Large Straight", group: "lower", credits: 1 },
  { id: "shiplake", label: "Shiplake", group: "lower", credits: 1 },
  { id: "chance", label: "Chance", group: "lower", credits: 1 },
];

export const UPPER_IDS: CategoryId[] = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
];

export type CategoryGroupId =
  | "numbers"
  | "specials"
  | "standards"
  | "odds"
  | "evens";

export const CATEGORY_GROUPS: Record<
  CategoryGroupId,
  { label: string; ids: CategoryId[] }
> = {
  numbers: {
    label: "Numbers",
    ids: ["ones", "twos", "threes", "fours", "fives", "sixes"],
  },
  specials: {
    label: "Specials",
    ids: [
      "threeOfAKind",
      "fourOfAKind",
      "fullHouse",
      "smallStraight",
      "largeStraight",
      "shiplake",
      "chance",
    ],
  },
  standards: {
    label: "Standards (Canonicals)",
    ids: ["fullHouse", "smallStraight", "largeStraight"],
  },
  odds: { label: "Odds", ids: ["ones", "threes", "fives"] },
  evens: { label: "Evens", ids: ["twos", "fours", "sixes"] },
};

// ---- Modifiers ----

export type ModifierId =
  // Credit modifiers
  | "casual"
  | "double"
  | "triple"
  | "ultra"
  | "king"
  | "nullify"
  | "symmetric"
  | "inverse"
  // Condition modifiers
  | "running"
  | "lord"
  | "longbowRunning"
  | "nuke"
  | "streetwise"
  | "strictlyStreetwise"
  | "fullCaptainsGamble"
  | "smallCaptainsGamble";

export interface ModifierDef {
  id: ModifierId;
  label: string;
  kind: "credit" | "condition";
  description: string;
}

export const MODIFIERS: ModifierDef[] = [
  { id: "casual", label: "Casual", kind: "credit", description: "+1 credit on top of base." },
  { id: "double", label: "Double", kind: "credit", description: "×2 credits." },
  { id: "triple", label: "Triple", kind: "credit", description: "×3 credits." },
  { id: "ultra", label: "Ultra", kind: "credit", description: "×10 credits." },
  { id: "king", label: "King", kind: "credit", description: "×2 credits (alias of Double)." },
  { id: "nullify", label: "Nullify", kind: "credit", description: "Credits set to 0." },
  { id: "symmetric", label: "Symmetric (Bitching)", kind: "credit", description: "Loser of category gets −credits." },
  { id: "inverse", label: "Inverse", kind: "credit", description: "Negates credits." },
  { id: "running", label: "Running", kind: "condition", description: "First player to fill the row across ALL sets wins (replaces most-points)." },
  { id: "lord", label: "Lord", kind: "condition", description: "Like Running, but most-points credit also remains." },
  { id: "longbowRunning", label: "Longbow Running", kind: "condition", description: "Each player gains +N credits as they finish the row, in finish order (1st=1, 2nd=2…)." },
  { id: "nuke", label: "Nuke", kind: "condition", description: "Each crossed-out cell costs −1 credit." },
  { id: "streetwise", label: "Streetwise", kind: "condition", description: "+1 credit if per-set points form a +1 sequence in any order (e.g. 22,21,23)." },
  { id: "strictlyStreetwise", label: "Strictly Streetwise", kind: "condition", description: "+1 credit if per-set points are strictly ascending OR descending by 1 (e.g. 21,22,23 or 23,22,21)." },
  { id: "fullCaptainsGamble", label: "Full Captain's Gamble", kind: "condition", description: "On filling this category, roll an extra die. Add its eyes (1–6) as credits." },
  { id: "smallCaptainsGamble", label: "Small Captain's Gamble", kind: "condition", description: "On filling this category, roll an extra die. +1 credit if eyes > 3, else 0." },
];

export type ModifierTarget =
  | { kind: "category"; id: CategoryId }
  | { kind: "group"; id: CategoryGroupId };

export interface ModifierAssignment {
  target: ModifierTarget;
  modifier: ModifierId;
}

/** Resolve a ruleset (list of assignments) into a per-category list of modifiers. */
export function resolveRuleset(
  rules: ModifierAssignment[],
): Record<CategoryId, ModifierId[]> {
  const map: Record<CategoryId, ModifierId[]> = {} as any;
  for (const c of CATEGORIES) map[c.id] = [];
  for (const r of rules) {
    const targets =
      r.target.kind === "category"
        ? [r.target.id]
        : CATEGORY_GROUPS[r.target.id].ids;
    for (const cat of targets) {
      map[cat].push(r.modifier);
    }
  }
  return map;
}

// ---- Dice & scoring ----

export type ScoreSheet = Partial<Record<CategoryId, number | null>>; // null = crossed out

export function rollDie(): Die {
  return (Math.floor(Math.random() * 6) + 1) as Die;
}

export function rollDice(n: number): DiceRoll {
  return Array.from({ length: n }, rollDie);
}

export function rerollMask(current: DiceRoll, hold: boolean[]): DiceRoll {
  return current.map((d, i) => (hold[i] ? d : rollDie())) as DiceRoll;
}

function counts(dice: DiceRoll): Record<number, number> {
  const c: Record<number, number> = {};
  for (const d of dice) c[d] = (c[d] || 0) + 1;
  return c;
}

function sum(dice: DiceRoll): number {
  return dice.reduce((a, b) => a + b, 0);
}

function hasNOfAKind(dice: DiceRoll, n: number): boolean {
  const c = counts(dice);
  return Object.values(c).some((v) => v >= n);
}

function isFullHouse(dice: DiceRoll): boolean {
  const c = Object.values(counts(dice)).sort();
  return c.length === 2 && c[0] === 2 && c[1] === 3;
}

function hasStraight(dice: DiceRoll, len: number): boolean {
  const uniq = Array.from(new Set(dice)).sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === uniq[i - 1] + 1) {
      run++;
      if (run >= len) return true;
    } else {
      run = 1;
    }
  }
  return run >= len;
}

export function scoreCategory(dice: DiceRoll, cat: CategoryId): number {
  switch (cat) {
    case "ones":
    case "twos":
    case "threes":
    case "fours":
    case "fives":
    case "sixes": {
      const map: Record<CategoryId, number> = {
        ones: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6,
      } as any;
      const v = map[cat];
      return dice.filter((d) => d === v).length * v;
    }
    case "threeOfAKind":
      return hasNOfAKind(dice, 3) ? sum(dice) : 0;
    case "fourOfAKind":
      return hasNOfAKind(dice, 4) ? sum(dice) : 0;
    case "fullHouse":
      return isFullHouse(dice) ? 25 : 0;
    case "smallStraight":
      return hasStraight(dice, 4) ? 30 : 0;
    case "largeStraight":
      return hasStraight(dice, 5) ? 40 : 0;
    case "shiplake":
      return hasNOfAKind(dice, 5) ? 50 : 0;
    case "chance":
      return sum(dice);
  }
}

export function upperSubtotal(sheet: ScoreSheet): number {
  return UPPER_IDS.reduce((acc, id) => acc + (sheet[id] ?? 0), 0);
}

export function bonus(sheet: ScoreSheet): number {
  return upperSubtotal(sheet) >= 63 ? 35 : 0;
}

export function lowerSubtotal(sheet: ScoreSheet): number {
  return CATEGORIES.filter((c) => c.group === "lower").reduce(
    (acc, c) => acc + (sheet[c.id] ?? 0),
    0,
  );
}

export function totalScore(sheet: ScoreSheet): number {
  return upperSubtotal(sheet) + bonus(sheet) + lowerSubtotal(sheet);
}

export function isPerfect(sheet: ScoreSheet): boolean {
  const upperOk = UPPER_IDS.every((id, i) => {
    const n = i + 1;
    return (sheet[id] ?? 0) >= 4 * n;
  });
  return (
    upperOk &&
    (sheet.threeOfAKind ?? 0) >= 27 &&
    (sheet.fourOfAKind ?? 0) >= 29 &&
    (sheet.fullHouse ?? 0) === 25 &&
    (sheet.smallStraight ?? 0) === 30 &&
    (sheet.largeStraight ?? 0) === 40 &&
    (sheet.shiplake ?? 0) === 50 &&
    (sheet.chance ?? 0) >= 26
  );
}

/** Simple ("burgerlijk"): exactly three of each upper number. */
export function isSimple(sheet: ScoreSheet): boolean {
  return UPPER_IDS.every((id, i) => {
    const n = i + 1;
    return (sheet[id] ?? -1) === 3 * n;
  });
}

export function isSheetComplete(sheet: ScoreSheet): boolean {
  return CATEGORIES.every((c) => sheet[c.id] !== undefined);
}

// ---- Filling state across sets ----

/** A fill record captures who filled a (set, category) cell on which turn. */
export interface FillRecord {
  setIndex: number;
  category: CategoryId;
  player: number;
  /** Monotonic turn counter when filled. */
  turn: number;
  /** null means crossed out. */
  value: number | null;
  /** Eyes from a Captain's Gamble extra die (1–6), if applicable. */
  gambleEyes?: number;
}

/** Build per-(set,player) score sheets from a list of fills. */
export function sheetsFromFills(
  fills: FillRecord[],
  numSets: number,
  numPlayers: number,
): ScoreSheet[][] {
  const out: ScoreSheet[][] = Array.from({ length: numSets }, () =>
    Array.from({ length: numPlayers }, () => ({}) as ScoreSheet),
  );
  for (const f of fills) {
    out[f.setIndex][f.player][f.category] = f.value;
  }
  return out;
}

// ---- Bot AI ----

function categoryValuesAcrossSets(
  dice: DiceRoll,
  player: number,
  sheets: ScoreSheet[][],
): { setIndex: number; cat: CategoryId; value: number }[] {
  const out: { setIndex: number; cat: CategoryId; value: number }[] = [];
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si][player];
    for (const c of CATEGORIES) {
      if (sheet[c.id] === undefined) {
        out.push({ setIndex: si, cat: c.id, value: scoreCategory(dice, c.id) });
      }
    }
  }
  return out;
}

export function botPickHold(
  dice: DiceRoll,
  player: number,
  sheets: ScoreSheet[][],
): boolean[] {
  const openAny = (id: CategoryId) =>
    sheets.some((s) => s[player][id] === undefined);

  if (openAny("shiplake") && hasNOfAKind(dice, 5)) return dice.map(() => true);
  if (openAny("largeStraight") && hasStraight(dice, 5))
    return dice.map(() => true);
  if (openAny("fullHouse") && isFullHouse(dice)) return dice.map(() => true);

  const c = counts(dice);
  const best = Object.entries(c).sort(
    (a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]),
  )[0];
  const bestVal = Number(best[0]);
  const bestCount = best[1];

  if (
    (openAny("smallStraight") || openAny("largeStraight")) &&
    bestCount <= 1
  ) {
    const seen = new Set<number>();
    return dice.map((d) => {
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }
  return dice.map((d) => {
    if (d === bestVal) return true;
    if (bestCount <= 1 && d >= 5) return true;
    return false;
  });
}

export function botPickTarget(
  dice: DiceRoll,
  player: number,
  sheets: ScoreSheet[][],
): { setIndex: number; cat: CategoryId } {
  const opts = categoryValuesAcrossSets(dice, player, sheets);
  const positive = opts.filter((o) => o.value > 0);
  if (positive.length > 0) {
    positive.sort((a, b) => b.value - a.value);
    return { setIndex: positive[0].setIndex, cat: positive[0].cat };
  }
  const order: CategoryId[] = [
    "ones",
    "twos",
    "shiplake",
    "largeStraight",
    "fourOfAKind",
    "smallStraight",
    "fullHouse",
    "threeOfAKind",
    "threes",
    "fours",
    "fives",
    "sixes",
    "chance",
  ];
  for (const cat of order) {
    for (let si = 0; si < sheets.length; si++) {
      if (sheets[si][player][cat] === undefined) return { setIndex: si, cat };
    }
  }
  return { setIndex: opts[0].setIndex, cat: opts[0].cat };
}

// ---- Credit computation with modifiers ----

export interface CreditAward {
  category: string;
  perPlayer: number[];
  detail?: string;
}

interface ComputeArgs {
  fills: FillRecord[];
  numSets: number;
  numPlayers: number;
  ruleset: ModifierAssignment[];
}

function applyCreditModifiers(base: number, mods: ModifierId[]): number {
  let v = base;
  for (const m of mods) {
    switch (m) {
      case "casual":
        v += 1;
        break;
      case "double":
      case "king":
        v *= 2;
        break;
      case "triple":
        v *= 3;
        break;
      case "ultra":
        v *= 10;
        break;
      case "nullify":
        v = 0;
        break;
      case "inverse":
        v = -v;
        break;
      default:
        break;
    }
  }
  return v;
}

export function computeCreditsWithRules(args: ComputeArgs): CreditAward[] {
  const { fills, numSets, numPlayers, ruleset } = args;
  const sheets = sheetsFromFills(fills, numSets, numPlayers);
  const catModifiers = resolveRuleset(ruleset);

  const awards: CreditAward[] = [];

  const totalPoints = (cat: CategoryId): number[] => {
    const arr = Array(numPlayers).fill(0);
    for (let si = 0; si < numSets; si++) {
      for (let p = 0; p < numPlayers; p++) {
        arr[p] += sheets[si][p][cat] ?? 0;
      }
    }
    return arr;
  };

  /** Per-player turn at which they filled `cat` in ALL sets (Infinity if not). */
  const finishTurns = (cat: CategoryId): number[] => {
    const turns = Array(numPlayers).fill(Infinity);
    const fillCounts = Array(numPlayers).fill(0);
    const lastTurn = Array(numPlayers).fill(-Infinity);
    for (const f of fills) {
      if (f.category !== cat) continue;
      fillCounts[f.player] += 1;
      lastTurn[f.player] = Math.max(lastTurn[f.player], f.turn);
      if (fillCounts[f.player] === numSets) {
        turns[f.player] = lastTurn[f.player];
      }
    }
    return turns;
  };

  for (const c of CATEGORIES) {
    const mods = catModifiers[c.id];
    const points = totalPoints(c.id);
    const max = Math.max(...points);
    const min = Math.min(...points);

    const hasRunning = mods.includes("running");
    const hasLord = mods.includes("lord");
    const hasLongbow = mods.includes("longbowRunning");
    const hasSymmetric = mods.includes("symmetric");

    const pointsWinners =
      max > 0 ? points.map((v) => (v === max ? 1 : 0)) : Array(numPlayers).fill(0);

    let perPlayerBase: number[];
    let detail = `${points.join(" / ")} pts`;

    if (hasLongbow) {
      const turns = finishTurns(c.id);
      const order = turns
        .map((t, p) => ({ t, p }))
        .filter((x) => x.t !== Infinity)
        .sort((a, b) => a.t - b.t);
      const arr = Array(numPlayers).fill(0);
      order.forEach((x, idx) => {
        arr[x.p] = idx + 1;
      });
      perPlayerBase = arr;
      detail += ` · longbow order=${order.map((x) => x.p + 1).join(",")}`;
    } else if (hasRunning || hasLord) {
      const turns = finishTurns(c.id);
      const fastest = Math.min(...turns);
      const arr = Array(numPlayers).fill(0);
      if (fastest !== Infinity) {
        for (let p = 0; p < numPlayers; p++) {
          if (turns[p] === fastest) arr[p] = c.credits;
        }
      }
      if (hasLord && max > 0) {
        for (let p = 0; p < numPlayers; p++) {
          if (pointsWinners[p]) arr[p] += c.credits;
        }
      }
      perPlayerBase = arr;
      if (fastest !== Infinity) {
        detail += ` · running won @turn ${fastest}`;
      } else {
        detail += ` · running not completed`;
      }
    } else {
      const arr = Array(numPlayers).fill(0);
      if (max > 0) {
        for (let p = 0; p < numPlayers; p++) {
          if (pointsWinners[p]) arr[p] = c.credits;
        }
      }
      perPlayerBase = arr;
    }

    if (hasSymmetric && max !== min) {
      perPlayerBase = perPlayerBase.map((v, p) =>
        points[p] === min ? v - c.credits : v,
      );
    }

    if (mods.includes("streetwise") && numSets >= 2) {
      // Sorted values must form a +1 sequence (any per-set order).
      const bonusArr = Array(numPlayers).fill(0);
      for (let p = 0; p < numPlayers; p++) {
        const seq: number[] = [];
        let ok = true;
        for (let si = 0; si < numSets; si++) {
          const v = sheets[si][p][c.id];
          if (v === undefined || v === null) {
            ok = false;
            break;
          }
          seq.push(v);
        }
        if (ok && seq.length === numSets) {
          const sorted = [...seq].sort((a, b) => a - b);
          if (sorted.every((v, i) => i === 0 || v - sorted[i - 1] === 1)) {
            bonusArr[p] = 1;
          }
        }
      }
      perPlayerBase = perPlayerBase.map((v, p) => v + bonusArr[p]);
    }

    if (mods.includes("strictlyStreetwise") && numSets >= 2) {
      // Per-set order must be strictly ascending or descending by 1.
      const bonusArr = Array(numPlayers).fill(0);
      for (let p = 0; p < numPlayers; p++) {
        const seq: number[] = [];
        let ok = true;
        for (let si = 0; si < numSets; si++) {
          const v = sheets[si][p][c.id];
          if (v === undefined || v === null) {
            ok = false;
            break;
          }
          seq.push(v);
        }
        if (ok && seq.length === numSets) {
          const asc = seq.every((v, i) => i === 0 || v - seq[i - 1] === 1);
          const desc = seq.every((v, i) => i === 0 || seq[i - 1] - v === 1);
          if (asc || desc) bonusArr[p] = 1;
        }
      }
      perPlayerBase = perPlayerBase.map((v, p) => v + bonusArr[p]);
    }

    let perPlayer = perPlayerBase.map((v) => applyCreditModifiers(v, mods));

    if (mods.includes("nuke")) {
      const crosses = Array(numPlayers).fill(0);
      for (const f of fills) {
        if (f.category === c.id && f.value === null) crosses[f.player] += 1;
      }
      perPlayer = perPlayer.map((v, p) => v - crosses[p]);
    }

    // Captain's Gamble: extra credits per-fill based on the recorded gamble die.
    const hasFullCG = mods.includes("fullCaptainsGamble");
    const hasSmallCG = mods.includes("smallCaptainsGamble");
    if (hasFullCG || hasSmallCG) {
      const cg = Array(numPlayers).fill(0);
      for (const f of fills) {
        if (f.category !== c.id) continue;
        if (f.gambleEyes === undefined) continue;
        if (hasFullCG) cg[f.player] += f.gambleEyes;
        if (hasSmallCG) cg[f.player] += f.gambleEyes > 3 ? 1 : 0;
      }
      perPlayer = perPlayer.map((v, p) => v + cg[p]);
    }

    if (perPlayer.some((v) => v !== 0) || mods.length > 0) {
      const tags = mods.length ? ` [${mods.join("+")}]` : "";
      awards.push({
        category: c.label + tags,
        perPlayer,
        detail,
      });
    }
  }

  // Total (above+below)
  const grandTotals = Array(numPlayers).fill(0);
  const perfects = Array(numPlayers).fill(0);
  const simples = Array(numPlayers).fill(0);
  for (let si = 0; si < numSets; si++) {
    for (let p = 0; p < numPlayers; p++) {
      grandTotals[p] += totalScore(sheets[si][p]);
      if (isPerfect(sheets[si][p])) perfects[p] += 1;
      if (isSimple(sheets[si][p])) simples[p] += 1;
    }
  }
  const tMax = Math.max(...grandTotals);
  const tMin = Math.min(...grandTotals);
  if (tMax !== tMin) {
    const per = grandTotals.map((v) => (v === tMax ? 4 : v === tMin ? -4 : 0));
    awards.push({
      category: "Total (above+below)",
      perPlayer: per,
      detail: grandTotals.join(" / "),
    });
  }

  if (perfects.some((p) => p > 0)) {
    awards.push({
      category: "Perfect",
      perPlayer: perfects.map((p) => p * 5),
      detail: perfects.map((p) => `${p}x`).join(" / "),
    });
  }

  if (simples.some((p) => p > 0)) {
    awards.push({
      category: "Simple (burgerlijk)",
      perPlayer: simples.map((p) => p),
      detail: simples.map((p) => `${p}x`).join(" / "),
    });
  }

  return awards;
}

export function totalCredits(awards: CreditAward[], numPlayers: number): number[] {
  const totals = Array(numPlayers).fill(0);
  for (const a of awards) {
    for (let i = 0; i < numPlayers; i++) totals[i] += a.perPlayer[i];
  }
  return totals;
}

/** Total cells across all sets (for game-over detection). */
export function totalCells(numSets: number, numPlayers: number): number {
  return numSets * numPlayers * CATEGORIES.length;
}
