import {
  FieldValue,
  Timestamp,
  Unsubscribe,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  CATEGORY_IDS,
  CategorySums,
  Fart,
  FartSource,
  RatingScores,
  emptySums,
  isCompleteRating,
} from "./scheetModel";
import { base64ToBytes } from "./audioUtils";

// Metadata and audio live in separate collections so leaderboards can load
// hundreds of farts without downloading any sound. Both are written in one
// batch; firestore.rules only accept audio alongside a brand-new fart.
const FARTS = "farts";
const AUDIO = "fartAudio";
const LIST_LIMIT = 500;

function toFart(id: string, data: Record<string, unknown>): Fart {
  const rawSums = (data.sums ?? {}) as Partial<CategorySums>;
  const sums = emptySums();
  for (const c of CATEGORY_IDS) sums[c] = Number(rawSums[c] ?? 0);
  const created = data.createdAt;
  return {
    id,
    title: String(data.title ?? "Naamloos"),
    artist: String(data.artist ?? "Anoniem"),
    durationMs: Number(data.durationMs ?? 0),
    mimeType: String(data.mimeType ?? ""),
    source: data.source === "upload" ? "upload" : "recording",
    peaks: Array.isArray(data.peaks) ? data.peaks.map(Number) : [],
    createdAt: created instanceof Timestamp ? created.toMillis() : Date.now(),
    ratingCount: Number(data.ratingCount ?? 0),
    sums,
  };
}

/** Live list of the most recent farts (metadata only). */
export function subscribeFarts(
  onChange: (farts: Fart[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, FARTS), orderBy("createdAt", "desc"), limit(LIST_LIMIT));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => toFart(d.id, d.data({ serverTimestamps: "estimate" }))),
      ),
    onError,
  );
}

/** Live view of a single fart (for share links older than the list window). */
export function subscribeFart(
  id: string,
  onChange: (fart: Fart | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, FARTS, id),
    (snap) =>
      onChange(snap.exists() ? toFart(snap.id, snap.data({ serverTimestamps: "estimate" })) : null),
    onError,
  );
}

export interface NewFart {
  title: string;
  artist: string;
  durationMs: number;
  mimeType: string;
  source: FartSource;
  peaks: number[];
  audioBase64: string;
}

export async function uploadFart(input: NewFart): Promise<string> {
  const fartRef = doc(collection(db, FARTS));
  const batch = writeBatch(db);
  batch.set(fartRef, {
    title: input.title,
    artist: input.artist,
    durationMs: input.durationMs,
    mimeType: input.mimeType,
    source: input.source,
    peaks: input.peaks,
    createdAt: serverTimestamp(),
    ratingCount: 0,
    sums: emptySums(),
  });
  batch.set(doc(db, AUDIO, fartRef.id), {
    data: input.audioBase64,
    mimeType: input.mimeType,
  });
  await batch.commit();
  return fartRef.id;
}

/** Adds one complete rating using atomic increments (no read needed). */
export async function rateFart(id: string, scores: RatingScores): Promise<void> {
  if (!isCompleteRating(scores)) throw new Error("Onvolledige beoordeling");
  const update: Record<string, FieldValue> = {
    ratingCount: increment(1),
    lastRatedAt: serverTimestamp(),
  };
  for (const c of CATEGORY_IDS) update[`sums.${c}`] = increment(scores[c]);
  await updateDoc(doc(db, FARTS, id), update);
}

const audioUrlCache = new Map<string, Promise<string>>();

/** Downloads a fart's audio once and returns a playable object URL. */
export function getFartAudioUrl(id: string): Promise<string> {
  let cached = audioUrlCache.get(id);
  if (!cached) {
    cached = getDoc(doc(db, AUDIO, id)).then((snap) => {
      if (!snap.exists()) throw new Error("Audio niet gevonden");
      const data = snap.data() as { data?: string; mimeType?: string };
      const bytes = base64ToBytes(data.data ?? "");
      return URL.createObjectURL(new Blob([bytes], { type: data.mimeType || "audio/wav" }));
    });
    cached.catch(() => audioUrlCache.delete(id));
    audioUrlCache.set(id, cached);
  }
  return cached;
}

/** Share link that opens the app straight on one fart. */
export function fartShareUrl(id: string): string {
  return `${window.location.origin}/scheet?id=${encodeURIComponent(id)}`;
}
