import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export interface PlayerStats {
  totalGamesPlayed: number;
  totalWins: number;
  totalKills: number;
  totalOwns: number;
  totalYasats: number;
  bestWeightedScore: number;
}

export interface PlayerProfile {
  username: string;
  displayName: string;
  color: string;
  city: string;
  securityQuestion: string;
  createdAt: unknown;
  /** True when the player is registered with a security question and can log in. */
  registered: boolean;
  stats: PlayerStats;
}

const emptyStats = (): PlayerStats => ({
  totalGamesPlayed: 0,
  totalWins: 0,
  totalKills: 0,
  totalOwns: 0,
  totalYasats: 0,
  bestWeightedScore: 0,
});

/**
 * Hash a string using SHA-256 (browser-native).
 * Used for storing security answers without plaintext.
 */
async function hashAnswer(answer: string): Promise<string> {
  const normalized = answer.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if a username already exists in Firestore.
 */
export async function checkUsernameExists(username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const docRef = doc(db, 'players', normalized);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
}

/**
 * Get the security question for an existing player.
 */
export async function getSecurityQuestion(username: string): Promise<string> {
  const normalized = username.trim().toLowerCase();
  const docRef = doc(db, 'players', normalized);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('Player not found');
  }
  return docSnap.data().securityQuestion;
}

/**
 * Verify a returning player's answer against the stored hash.
 * Returns the player profile on success, null on failure.
 */
export async function verifyPlayer(
  username: string,
  answer: string
): Promise<PlayerProfile | null> {
  const normalized = username.trim().toLowerCase();
  const docRef = doc(db, 'players', normalized);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  const answerHash = await hashAnswer(answer);

  if (answerHash !== data.securityAnswerHash) {
    return null;
  }

  return {
    username: normalized,
    displayName: data.displayName,
    color: data.color || '',
    city: data.city || '',
    securityQuestion: data.securityQuestion,
    createdAt: data.createdAt,
    registered: Boolean(data.securityAnswerHash),
    stats: { ...emptyStats(), ...(data.stats || {}) },
  };
}

/**
 * Fetch a player profile (registered or unregistered). Returns null if not found.
 */
export async function getPlayer(username: string): Promise<PlayerProfile | null> {
  const normalized = username.trim().toLowerCase();
  const docRef = doc(db, 'players', normalized);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    username: normalized,
    displayName: data.displayName || normalized,
    color: data.color || '',
    city: data.city || '',
    securityQuestion: data.securityQuestion || '',
    createdAt: data.createdAt,
    registered: Boolean(data.securityAnswerHash),
    stats: { ...emptyStats(), ...(data.stats || {}) },
  };
}

/**
 * Look up a player by username. If not found, create an unregistered profile
 * (no security question). Used when adding opponents to a ranked game so their
 * stats can be tracked.
 */
export async function getOrCreatePlayer(
  username: string,
  color: string,
  displayName?: string
): Promise<PlayerProfile> {
  const normalized = username.trim().toLowerCase();
  const existing = await getPlayer(normalized);
  if (existing) return existing;

  const profile: Record<string, unknown> = {
    displayName: (displayName || username).trim(),
    color,
    createdAt: serverTimestamp(),
    stats: emptyStats(),
  };
  await setDoc(doc(db, 'players', normalized), profile);

  return {
    username: normalized,
    displayName: (displayName || username).trim(),
    color,
    city: '',
    securityQuestion: '',
    createdAt: null,
    registered: false,
    stats: emptyStats(),
  };
}

/**
 * Register a new player with a display name, security question, and answer.
 */
export async function registerPlayer(
  username: string,
  displayName: string,
  securityQuestion: string,
  securityAnswer: string,
  color: string = ''
): Promise<PlayerProfile> {
  const normalized = username.trim().toLowerCase();

  const existing = await getPlayer(normalized);
  if (existing && existing.registered) {
    throw new Error('Username already taken');
  }

  const answerHash = await hashAnswer(securityAnswer);

  const profile: Record<string, unknown> = {
    displayName,
    color,
    securityQuestion,
    securityAnswerHash: answerHash,
    createdAt: existing ? existing.createdAt : serverTimestamp(),
    stats: existing ? existing.stats : emptyStats(),
  };

  // Upgrade existing unregistered profile or create a new one.
  await setDoc(doc(db, 'players', normalized), profile, { merge: true });

  return {
    username: normalized,
    displayName,
    color,
    city: '',
    securityQuestion,
    createdAt: null,
    registered: true,
    stats: existing ? existing.stats : emptyStats(),
  };
}

/**
 * Update a player's color in Firestore.
 */
export async function updatePlayerColor(
  username: string,
  color: string
): Promise<void> {
  const normalized = username.trim().toLowerCase();
  await updateDoc(doc(db, 'players', normalized), { color });
}

export interface GameStatsEntry {
  username: string;
  /** Absolute totals to add to the player's stats. */
  kills: number;
  owns: number;
  yasats: number;
  weightedScore: number;
  won: boolean;
}

/**
 * Save the final results of a ranked game: update each player's lifetime stats,
 * increment games played, wins, kills, owns, yasats, and update bestWeightedScore.
 * Silently skips players without a username.
 */
export async function saveRankedGameResult(entries: GameStatsEntry[]): Promise<void> {
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.username) return;
      const normalized = entry.username.trim().toLowerCase();
      const ref = doc(db, 'players', normalized);
      const snap = await getDoc(ref);
      const existing: PlayerStats = snap.exists()
        ? { ...emptyStats(), ...(snap.data().stats || {}) }
        : emptyStats();

      const updated: PlayerStats = {
        totalGamesPlayed: existing.totalGamesPlayed + 1,
        totalWins: existing.totalWins + (entry.won ? 1 : 0),
        totalKills: existing.totalKills + entry.kills,
        totalOwns: existing.totalOwns + entry.owns,
        totalYasats: existing.totalYasats + entry.yasats,
        bestWeightedScore: Math.max(existing.bestWeightedScore, entry.weightedScore),
      };

      if (snap.exists()) {
        await updateDoc(ref, { stats: updated });
      } else {
        // Edge case: player was never persisted — create minimal doc.
        await setDoc(ref, {
          displayName: normalized,
          color: '',
          createdAt: serverTimestamp(),
          stats: updated,
        });
      }
    })
  );
}
