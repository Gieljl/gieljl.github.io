// Pure data model for "Rate My Scheet": the nine rating categories, average
// and ranking maths, and the "which fart do I rate next" picker. No Firebase
// or browser APIs here so everything is unit-testable.

export type CategoryId =
  | "geurTolerantie"
  | "geurNuance"
  | "toon"
  | "ritme"
  | "lengte"
  | "volume"
  | "timing"
  | "bereik"
  | "luchtvochtigheid";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Hint shown under the 1 end of the scale. */
  low: string;
  /** Hint shown under the 10 end of the scale. */
  high: string;
}

export const CATEGORIES: Category[] = [
  { id: "geurTolerantie", label: "Tolerantie van geur", emoji: "👃", low: "Gasmasker nodig", high: "Prima te harden" },
  { id: "geurNuance", label: "Nuance in geur", emoji: "🍷", low: "Eendimensionaal", high: "Complex boeket" },
  { id: "toon", label: "Toon", emoji: "🎺", low: "Vals", high: "Zuiver" },
  { id: "ritme", label: "Ritme", emoji: "🥁", low: "Chaotisch", high: "Strak in de maat" },
  { id: "lengte", label: "Lengte", emoji: "📏", low: "Te kort", high: "Episch lang" },
  { id: "volume", label: "Volume", emoji: "🔊", low: "Onhoorbaar", high: "Donderslag" },
  { id: "timing", label: "Timing", emoji: "⏱️", low: "Ongepast", high: "Perfect getimed" },
  { id: "bereik", label: "Bereik", emoji: "🎼", low: "Eén noot", high: "Drie octaven" },
  { id: "luchtvochtigheid", label: "Luchtvochtigheid", emoji: "💧", low: "Kurkdroog", high: "Tropisch vochtig" },
];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export const CATEGORY_BY_ID: Record<CategoryId, Category> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<CategoryId, Category>,
);

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

/** Ranking key: a single category, or the overall mean of all categories. */
export type RankingKey = CategoryId | "totaal";

export type CategorySums = Record<CategoryId, number>;
export type RatingScores = Record<CategoryId, number>;
/** A rating form in progress — categories may still be unset. */
export type PartialScores = Partial<Record<CategoryId, number>>;

export type FartSource = "recording" | "upload";

/** Metadata of an uploaded fart (the audio itself lives in a separate doc). */
export interface Fart {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  mimeType: string;
  source: FartSource;
  /** Normalised waveform peaks (0..1) for drawing without loading audio. */
  peaks: number[];
  /** Milliseconds since epoch. */
  createdAt: number;
  ratingCount: number;
  sums: CategorySums;
}

export function emptySums(): CategorySums {
  return CATEGORY_IDS.reduce(
    (acc, id) => ({ ...acc, [id]: 0 }),
    {} as CategorySums,
  );
}

export function isValidScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SCORE &&
    value <= MAX_SCORE
  );
}

/** True when every category holds a whole score between 1 and 10. */
export function isCompleteRating(scores: PartialScores): scores is RatingScores {
  return CATEGORY_IDS.every((id) => isValidScore(scores[id]));
}

/** Plain average for one category, or null when nobody has rated yet. */
export function categoryAverage(fart: Pick<Fart, "sums" | "ratingCount">, id: CategoryId): number | null {
  if (fart.ratingCount <= 0) return null;
  return (fart.sums[id] ?? 0) / fart.ratingCount;
}

/** Mean of all nine category averages, or null when unrated. */
export function overallAverage(fart: Pick<Fart, "sums" | "ratingCount">): number | null {
  if (fart.ratingCount <= 0) return null;
  const total = CATEGORY_IDS.reduce((acc, id) => acc + (fart.sums[id] ?? 0), 0);
  return total / CATEGORY_IDS.length / fart.ratingCount;
}

export function averageFor(fart: Pick<Fart, "sums" | "ratingCount">, key: RankingKey): number | null {
  return key === "totaal" ? overallAverage(fart) : categoryAverage(fart, key);
}

/** Mean of a single complete rating across all categories. */
export function ratingMean(scores: RatingScores): number {
  return CATEGORY_IDS.reduce((acc, id) => acc + scores[id], 0) / CATEGORY_IDS.length;
}

/** Returns the fart as it looks after `scores` has been added to it. */
export function applyRating<T extends Pick<Fart, "sums" | "ratingCount">>(fart: T, scores: RatingScores): T {
  const sums = { ...fart.sums };
  for (const id of CATEGORY_IDS) sums[id] = (sums[id] ?? 0) + scores[id];
  return { ...fart, sums, ratingCount: fart.ratingCount + 1 };
}

// Rankings use a Bayesian average so a single 10 doesn't beat a fart that
// scored 9.5 over twenty votes: every fart starts with PRIOR_WEIGHT virtual
// votes at the middle of the scale.
export const PRIOR_MEAN = (MIN_SCORE + MAX_SCORE) / 2;
export const PRIOR_WEIGHT = 2;

export function rankingScore(fart: Pick<Fart, "sums" | "ratingCount">, key: RankingKey): number {
  const avg = averageFor(fart, key);
  if (avg === null) return PRIOR_MEAN;
  const n = fart.ratingCount;
  return (PRIOR_WEIGHT * PRIOR_MEAN + avg * n) / (PRIOR_WEIGHT + n);
}

export interface RankedFart {
  rank: number;
  fart: Fart;
  average: number;
  score: number;
}

/**
 * Leaderboard for one category (or the total). Only rated farts take part.
 * Ties on the weighted score are broken by vote count, then by who was first.
 * Farts with an identical weighted score and vote count share a rank.
 */
export function rankFarts(farts: Fart[], key: RankingKey, limit = 50): RankedFart[] {
  const rows = farts
    .filter((f) => f.ratingCount > 0)
    .map((fart) => ({
      fart,
      average: averageFor(fart, key) as number,
      score: rankingScore(fart, key),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.fart.ratingCount - a.fart.ratingCount ||
        a.fart.createdAt - b.fart.createdAt,
    )
    .slice(0, limit);

  const ranked: RankedFart[] = [];
  rows.forEach((row, i) => {
    const prev = ranked[i - 1];
    const tied =
      prev !== undefined &&
      Math.abs(prev.score - row.score) < 1e-9 &&
      prev.fart.ratingCount === row.fart.ratingCount;
    ranked.push({ ...row, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}

/**
 * Picks the next fart to rate: a random one this device has not rated,
 * uploaded or skipped yet. Returns null when there's nothing left.
 */
export function pickNextFart(
  farts: Fart[],
  exclude: ReadonlySet<string>,
  random: () => number = Math.random,
): Fart | null {
  const candidates = farts.filter((f) => !exclude.has(f.id));
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

export const TITLE_MAX = 60;
export const ARTIST_MAX = 30;
export const DEFAULT_ARTIST = "Anoniem";

/** Trims and caps a title; returns null when it ends up empty. */
export function cleanTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return t.length > 0 ? t : null;
}

export function cleanArtist(raw: string): string {
  const a = raw.replace(/\s+/g, " ").trim().slice(0, ARTIST_MAX);
  return a.length > 0 ? a : DEFAULT_ARTIST;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  if (totalSeconds < 10) return `${totalSeconds.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
}

/** Dutch-style one-decimal score, e.g. 7,4. */
export function formatScore(value: number | null): string {
  if (value === null) return "–";
  return value.toFixed(1).replace(".", ",");
}

/** A short verdict for an overall score, shown after rating. */
export function verdict(score: number): string {
  if (score >= 9) return "Legendarisch 🏆";
  if (score >= 8) return "Wereldklasse";
  if (score >= 7) return "Stevig werk";
  if (score >= 6) return "Voldoende";
  if (score >= 5) return "Middelmatig gepruttel";
  if (score >= 3.5) return "Zwak windje";
  return "Loos alarm";
}

/** "zojuist", "5 minuten geleden", "3 dagen geleden"… */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 60) return "zojuist";
  const units: Array<[number, string, string]> = [
    [60, "minuut", "minuten"],
    [60 * 60, "uur", "uur"],
    [60 * 60 * 24, "dag", "dagen"],
    [60 * 60 * 24 * 7, "week", "weken"],
    [60 * 60 * 24 * 30, "maand", "maanden"],
    [60 * 60 * 24 * 365, "jaar", "jaar"],
  ];
  let chosen = units[0];
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  const n = Math.floor(seconds / chosen[0]);
  return `${n} ${n === 1 ? chosen[1] : chosen[2]} geleden`;
}
