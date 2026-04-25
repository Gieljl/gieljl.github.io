import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
} from 'firebase/firestore';
import { db } from '../../firebase';

export interface PlayerStats {
  totalGamesPlayed: number;
  totalWins: number;
  /** Best yasat streak ever across all games. */
  longestStreak: number;
  /** Highest weighted score achieved in a single game. */
  bestWeightedScore: number;
  /**
   * Per-stat cumulative counts, keyed by stat name (e.g. "Kill", "Yasat",
   * "Own", "Owned", "Death", "Lullify", "Mega Kill", ...). Only stats that
   * ever occurred for this player will appear.
   */
  statCounts: Record<string, number>;
}

/**
 * Stats bucket scoped to Play-mode games of a specific length. Same shape as
 * `PlayerStats` so the leaderboard UI can use one set of metric definitions.
 */
export type PlayStats = PlayerStats;

/** Per-length stats. `classic` is intentionally excluded (no auto-end save). */
export type PlayStatsLength = 'bo10' | 'firstTo10';

export type PlayStatsByLength = Partial<Record<PlayStatsLength, PlayStats>>;
export type FriendsPlayStatsByLength = Partial<Record<PlayStatsLength, PlayStats>>;

/** Lightweight per-length counters for Ranked-mode games. */
export interface RankedLengthStats {
  totalGamesPlayed: number;
  totalWins: number;
}

export type RankedLength = 'bo10' | 'firstTo10' | 'classic';

export type RankedByLength = Partial<Record<RankedLength, RankedLengthStats>>;

export type PlayDifficulty = 'easy' | 'normal' | 'godlike';

/** Aggregate Play wins/games per AI difficulty (across both tracked Play lengths). */
export type PlayByDifficulty = Partial<
  Record<PlayDifficulty, RankedLengthStats>
>;

export interface PlayerProfile {
  username: string;
  displayName: string;
  color: string;
  securityQuestion: string;
  createdAt: unknown;
  /** True when the player is registered with a security question and can log in. */
  registered: boolean;
  stats: PlayerStats;
}

const emptyStats = (): PlayerStats => ({
  totalGamesPlayed: 0,
  totalWins: 0,
  longestStreak: 0,
  bestWeightedScore: 0,
  statCounts: {},
});

/**
 * Merge a stored stats object from Firestore, which may come from an older
 * schema (with `totalKills`/`totalOwns`/`totalYasats` as top-level fields),
 * into the current PlayerStats shape.
 */
const normalizeStats = (raw: Record<string, unknown> | undefined): PlayerStats => {
  const base = emptyStats();
  if (!raw) return base;
  const out: PlayerStats = {
    ...base,
    ...(raw as Partial<PlayerStats>),
    statCounts: { ...(raw.statCounts as Record<string, number> | undefined ?? {}) },
  };
  // Back-compat: promote legacy total fields into statCounts if present.
  const legacy: Array<[string, string]> = [
    ['totalKills', 'Kill'],
    ['totalOwns', 'Own'],
    ['totalYasats', 'Yasat'],
  ];
  for (const [legacyKey, statName] of legacy) {
    const v = (raw as Record<string, unknown>)[legacyKey];
    if (typeof v === 'number' && v > 0 && !out.statCounts[statName]) {
      out.statCounts[statName] = v;
    }
  }
  return out;
};

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
    securityQuestion: data.securityQuestion,
    createdAt: data.createdAt,
    registered: Boolean(data.securityAnswerHash),
    stats: normalizeStats(data.stats),
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
    securityQuestion: data.securityQuestion || '',
    createdAt: data.createdAt,
    registered: Boolean(data.securityAnswerHash),
    stats: normalizeStats(data.stats),
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
  /** Best yasat streak this player achieved in the finished game. */
  longestStreak: number;
  /** Weighted score achieved this game. */
  weightedScore: number;
  won: boolean;
  /** Per-stat counts from this game, keyed by stat name. */
  statCounts: Record<string, number>;
}

/**
 * Save the final results of a ranked game: update each player's lifetime
 * stats. Increments games played, wins, per-stat counts, and updates
 * `longestStreak` / `bestWeightedScore`. Silently skips players without a
 * username.
 */
export async function saveRankedGameResult(
  entries: GameStatsEntry[],
  length: RankedLength = 'classic',
): Promise<void> {
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.username) return;
      const normalized = entry.username.trim().toLowerCase();
      const ref = doc(db, 'players', normalized);
      const snap = await getDoc(ref);
      const existing: PlayerStats = snap.exists()
        ? normalizeStats(snap.data().stats)
        : emptyStats();
      const existingByLength: RankedByLength = snap.exists()
        ? ((snap.data().rankedByLength as RankedByLength | undefined) ?? {})
        : {};

      const mergedCounts: Record<string, number> = { ...existing.statCounts };
      for (const [statName, count] of Object.entries(entry.statCounts)) {
        if (!count) continue;
        mergedCounts[statName] = (mergedCounts[statName] ?? 0) + count;
      }

      const updated: PlayerStats = {
        totalGamesPlayed: existing.totalGamesPlayed + 1,
        totalWins: existing.totalWins + (entry.won ? 1 : 0),
        longestStreak: Math.max(existing.longestStreak, entry.longestStreak),
        bestWeightedScore: Math.max(existing.bestWeightedScore, entry.weightedScore),
        statCounts: mergedCounts,
      };

      const prevLen = existingByLength[length] ?? {
        totalGamesPlayed: 0,
        totalWins: 0,
      };
      const updatedLen: RankedLengthStats = {
        totalGamesPlayed: prevLen.totalGamesPlayed + 1,
        totalWins: prevLen.totalWins + (entry.won ? 1 : 0),
      };

      if (snap.exists()) {
        await updateDoc(ref, {
          stats: updated,
          [`rankedByLength.${length}`]: updatedLen,
        });
      } else {
        // Edge case: player was never persisted — create minimal doc.
        await setDoc(ref, {
          displayName: normalized,
          color: '',
          createdAt: serverTimestamp(),
          stats: updated,
          rankedByLength: { [length]: updatedLen },
        });
      }
    })
  );
}

/**
 * Save the final results of a Play-mode game (vs. bots) for the human player
 * who is logged in. Aggregates into `players/{username}.playStats[length]`.
 * Skips when no username or `length === 'classic'` (Classic games are not
 * tracked).
 */
export async function savePlayGameResult(
  username: string,
  length: PlayStatsLength | 'classic',
  entry: GameStatsEntry,
  difficulty: PlayDifficulty = 'normal',
): Promise<void> {
  if (!entry.username || !username) return;
  if (length === 'classic') return;
  const normalized = username.trim().toLowerCase();
  const ref = doc(db, 'players', normalized);
  const snap = await getDoc(ref);
  if (!snap.exists()) return; // logged-in player must have a doc

  const data = snap.data();
  const allByLength: Record<string, unknown> =
    (data.playStats as Record<string, unknown> | undefined) ?? {};
  const existing: PlayStats = normalizeStats(
    allByLength[length] as Record<string, unknown> | undefined,
  );

  const mergedCounts: Record<string, number> = { ...existing.statCounts };
  for (const [statName, count] of Object.entries(entry.statCounts)) {
    if (!count) continue;
    mergedCounts[statName] = (mergedCounts[statName] ?? 0) + count;
  }

  const updated: PlayStats = {
    totalGamesPlayed: existing.totalGamesPlayed + 1,
    totalWins: existing.totalWins + (entry.won ? 1 : 0),
    longestStreak: Math.max(existing.longestStreak, entry.longestStreak),
    bestWeightedScore: Math.max(existing.bestWeightedScore, entry.weightedScore),
    statCounts: mergedCounts,
  };

  // Per-difficulty wins/games counter.
  const existingByDiff: PlayByDifficulty =
    (data.playByDifficulty as PlayByDifficulty | undefined) ?? {};
  const prevDiff = existingByDiff[difficulty] ?? {
    totalGamesPlayed: 0,
    totalWins: 0,
  };
  const updatedDiff: RankedLengthStats = {
    totalGamesPlayed: prevDiff.totalGamesPlayed + 1,
    totalWins: prevDiff.totalWins + (entry.won ? 1 : 0),
  };

  await updateDoc(ref, {
    [`playStats.${length}`]: updated,
    [`playByDifficulty.${difficulty}`]: updatedDiff,
  });
}

/**
 * Save the final results of a Play vs Friends (multiplayer human) game. The
 * host calls this once for every participant. Aggregates into
 * `players/{username}.friendsPlayStats[length]`. Skips participants whose
 * profile doc is missing.
 */
export async function saveFriendsPlayGameResult(
  entries: GameStatsEntry[],
  length: PlayStatsLength,
): Promise<void> {
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.username) return;
      const normalized = entry.username.trim().toLowerCase();
      const ref = doc(db, 'players', normalized);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const allByLength: Record<string, unknown> =
        (data.friendsPlayStats as Record<string, unknown> | undefined) ?? {};
      const existing: PlayStats = normalizeStats(
        allByLength[length] as Record<string, unknown> | undefined,
      );
      const mergedCounts: Record<string, number> = { ...existing.statCounts };
      for (const [statName, count] of Object.entries(entry.statCounts)) {
        if (!count) continue;
        mergedCounts[statName] = (mergedCounts[statName] ?? 0) + count;
      }
      const updated: PlayStats = {
        totalGamesPlayed: existing.totalGamesPlayed + 1,
        totalWins: existing.totalWins + (entry.won ? 1 : 0),
        longestStreak: Math.max(existing.longestStreak, entry.longestStreak),
        bestWeightedScore: Math.max(
          existing.bestWeightedScore,
          entry.weightedScore,
        ),
        statCounts: mergedCounts,
      };
      await updateDoc(ref, {
        [`friendsPlayStats.${length}`]: updated,
      });
    }),
  );
}

export interface LeaderboardEntry {
  username: string;
  displayName: string;
  color: string;
  stats: PlayerStats;
  /** Optional per-length Play-mode stats (only present when player has any). */
  playStats?: PlayStatsByLength;
  /** Optional per-length Friends-mode (vs humans) Play stats. */
  friendsPlayStats?: FriendsPlayStatsByLength;
  /** Optional per-length Ranked-mode wins/games counters. */
  rankedByLength?: RankedByLength;
  /** Optional per-difficulty Play-mode wins/games counters. */
  playByDifficulty?: PlayByDifficulty;
}

/**
 * Fetch every player profile (lightweight — one read per player). For the
 * expected scale of this app (tens to hundreds of players) this is fine.
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(collection(db, 'players'));
  const entries: LeaderboardEntry[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const rawPlay = data.playStats as Record<string, unknown> | undefined;
    const playStats: PlayStatsByLength | undefined = rawPlay
      ? {
          ...(rawPlay.bo10
            ? { bo10: normalizeStats(rawPlay.bo10 as Record<string, unknown>) }
            : {}),
          ...(rawPlay.firstTo10
            ? {
                firstTo10: normalizeStats(
                  rawPlay.firstTo10 as Record<string, unknown>,
                ),
              }
            : {}),
        }
      : undefined;
    const rawFriends = data.friendsPlayStats as
      | Record<string, unknown>
      | undefined;
    const friendsPlayStats: FriendsPlayStatsByLength | undefined = rawFriends
      ? {
          ...(rawFriends.bo10
            ? { bo10: normalizeStats(rawFriends.bo10 as Record<string, unknown>) }
            : {}),
          ...(rawFriends.firstTo10
            ? {
                firstTo10: normalizeStats(
                  rawFriends.firstTo10 as Record<string, unknown>,
                ),
              }
            : {}),
        }
      : undefined;
    entries.push({
      username: d.id,
      displayName: data.displayName || d.id,
      color: data.color || '',
      stats: normalizeStats(data.stats),
      ...(playStats && Object.keys(playStats).length > 0 ? { playStats } : {}),
      ...(friendsPlayStats && Object.keys(friendsPlayStats).length > 0
        ? { friendsPlayStats }
        : {}),
      ...(data.rankedByLength &&
      typeof data.rankedByLength === 'object' &&
      Object.keys(data.rankedByLength as object).length > 0
        ? { rankedByLength: data.rankedByLength as RankedByLength }
        : {}),
      ...(data.playByDifficulty &&
      typeof data.playByDifficulty === 'object' &&
      Object.keys(data.playByDifficulty as object).length > 0
        ? { playByDifficulty: data.playByDifficulty as PlayByDifficulty }
        : {}),
    });
  });
  return entries;
}
