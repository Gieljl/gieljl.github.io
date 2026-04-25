/**
 * Firestore data layer for "Play vs Friends" — host-authoritative real-time
 * multiplayer of the Yasat card game.
 *
 * Collection: `playSessions/{code}`. Distinct from the `sessions/` collection
 * used by the Score Tracker share feature.
 */
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { PlayAction, PlayerId, RoundState } from '../play/engine/round';
import type {
  PlayLogEntry,
  StoredRoundResult,
} from '../play/playSlice';
import type { RoundEvent } from '../play/engine/round';

const PLAY_SESSIONS_COLLECTION = 'playSessions';

export type PlayFriendsLength = 'bo10' | 'firstTo10';
export type PlayFriendsStatus =
  | 'lobby'
  | 'in-progress'
  | 'ended'
  | 'cancelled';

export interface PlaySessionParticipant {
  username: string;
  displayName: string;
  color: string;
  joinedAt: number;
  connected: boolean;
}

export interface PlaySessionActionRequest {
  id: string;
  fromUsername: string;
  action: PlayAction;
  requestedAt: number;
}

export interface PlaySessionWinner {
  playerId: PlayerId;
  username: string;
  score: number;
}

export interface PlaySessionDocument {
  hostUsername: string;
  status: PlayFriendsStatus;
  length: PlayFriendsLength;
  participants: PlaySessionParticipant[];
  /** Stable PlayerIds in seating order, assigned when host starts the game. */
  seating: PlayerId[];
  /** PlayerId → display name. */
  playerNames: Record<PlayerId, string>;
  /** PlayerId → username (for stats save + connection tracking). */
  usernameByPlayerId: Record<PlayerId, string>;
  /** Current round state pushed by host after each `applyAction`. */
  round: RoundState | null;
  cumulativeTotals: Record<PlayerId, number>;
  roundHistory: StoredRoundResult[];
  log: PlayLogEntry[];
  /** Most recent engine events emitted by host; guests use this for animations. */
  lastEvents: RoundEvent[];
  gameOver: boolean;
  winner: PlaySessionWinner | null;
  /** FIFO queue of guest-submitted actions awaiting host validation. */
  actionRequests: PlaySessionActionRequest[];
  hostHeartbeatAt: number;
  createdAt: unknown;
  updatedAt: unknown;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid 0/O, 1/I

/** Generate a 6-char unambiguous session code. */
export function generatePlaySessionCode(): string {
  let code = '';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) code += CODE_CHARS[arr[i] % CODE_CHARS.length];
  return code;
}

/** Recursively strip `undefined` (Firestore rejects them). */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Firestore does not support nested arrays. `RoundState.discardPlies` is
 * `Card[][]`, so we serialize each ply to `{ cards: Card[] }` before write
 * and reverse it on read.
 */
function serializeRound(
  round: RoundState | null | undefined,
): unknown {
  if (!round) return round ?? null;
  return {
    ...round,
    discardPlies: round.discardPlies.map((cards) => ({ cards })),
  };
}

function deserializeRound(raw: unknown): RoundState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RoundState & {
    discardPlies: Array<{ cards: RoundState['discardPlies'][number] } | RoundState['discardPlies'][number]>;
  };
  const plies = Array.isArray(r.discardPlies)
    ? r.discardPlies.map((p) =>
        Array.isArray(p) ? p : (p as { cards: RoundState['discardPlies'][number] }).cards,
      )
    : [];
  return { ...r, discardPlies: plies } as RoundState;
}

function serializePartialDoc(
  partial: Partial<PlaySessionDocument>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...partial };
  if ('round' in partial) {
    copy.round = serializeRound(partial.round);
  }
  return copy;
}

function deserializeDoc(
  raw: Record<string, unknown> | null,
): PlaySessionDocument | null {
  if (!raw) return null;
  const result = { ...raw } as unknown as PlaySessionDocument;
  if (raw.round !== undefined) {
    result.round = deserializeRound(raw.round);
  }
  return result;
}

/** Create a new lobby with the host as the sole participant. */
export async function createPlaySession(
  code: string,
  host: { username: string; displayName: string; color: string },
  length: PlayFriendsLength,
): Promise<void> {
  const now = Date.now();
  const docData: PlaySessionDocument = {
    hostUsername: host.username,
    status: 'lobby',
    length,
    participants: [
      {
        username: host.username,
        displayName: host.displayName,
        color: host.color,
        joinedAt: now,
        connected: true,
      },
    ],
    seating: [],
    playerNames: {},
    usernameByPlayerId: {},
    round: null,
    cumulativeTotals: {},
    roundHistory: [],
    log: [],
    lastEvents: [],
    gameOver: false,
    winner: null,
    actionRequests: [],
    hostHeartbeatAt: now,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), stripUndefined(docData));
}

/**
 * Join a lobby. Idempotent on (code, username): if the user already appears
 * in the participants list (e.g. after a refresh) their slot is reused and
 * marked connected. Throws if the session is missing, not in lobby, or full.
 */
export async function joinPlaySession(
  code: string,
  profile: { username: string; displayName: string; color: string },
): Promise<void> {
  const ref = doc(db, PLAY_SESSIONS_COLLECTION, code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Game not found.');
    const data = snap.data() as PlaySessionDocument;
    if (data.status === 'cancelled') throw new Error('Game was cancelled.');
    if (data.status === 'ended') throw new Error('Game has ended.');
    const existingIdx = data.participants.findIndex(
      (p) => p.username === profile.username,
    );
    let participants = data.participants;
    if (existingIdx >= 0) {
      participants = participants.map((p, i) =>
        i === existingIdx ? { ...p, connected: true } : p,
      );
    } else {
      if (data.status !== 'lobby') {
        throw new Error('Game already started.');
      }
      if (participants.length >= 4) throw new Error('Game is full.');
      participants = [
        ...participants,
        {
          username: profile.username,
          displayName: profile.displayName,
          color: profile.color,
          joinedAt: Date.now(),
          connected: true,
        },
      ];
    }
    tx.update(ref, {
      participants: stripUndefined(participants),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Mark a participant as disconnected (best-effort, e.g. on tab close). */
export async function setParticipantConnected(
  code: string,
  username: string,
  connected: boolean,
): Promise<void> {
  const ref = doc(db, PLAY_SESSIONS_COLLECTION, code);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as PlaySessionDocument;
      const participants = data.participants.map((p) =>
        p.username === username ? { ...p, connected } : p,
      );
      tx.update(ref, {
        participants: stripUndefined(participants),
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    /* best-effort */
  }
}

export function subscribeToPlaySession(
  code: string,
  cb: (data: PlaySessionDocument | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, PLAY_SESSIONS_COLLECTION, code), (snap) => {
    cb(
      snap.exists()
        ? deserializeDoc(snap.data() as Record<string, unknown>)
        : null,
    );
  });
}

export async function fetchPlaySession(
  code: string,
): Promise<PlaySessionDocument | null> {
  const snap = await getDoc(doc(db, PLAY_SESSIONS_COLLECTION, code));
  return snap.exists()
    ? deserializeDoc(snap.data() as Record<string, unknown>)
    : null;
}

/** Host: merge new state fields into the doc. */
export async function pushHostState(
  code: string,
  partial: Partial<PlaySessionDocument>,
): Promise<void> {
  await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
    ...stripUndefined(serializePartialDoc(partial)),
    updatedAt: serverTimestamp(),
  });
}

/** Guest: append an action request to the FIFO queue. */
export async function submitActionRequest(
  code: string,
  request: PlaySessionActionRequest,
): Promise<void> {
  await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
    actionRequests: arrayUnion(stripUndefined(request)),
    updatedAt: serverTimestamp(),
  });
}

/** Host: remove a processed action request. */
export async function consumeActionRequest(
  code: string,
  request: PlaySessionActionRequest,
): Promise<void> {
  await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
    actionRequests: arrayRemove(stripUndefined(request)),
    updatedAt: serverTimestamp(),
  });
}

/** Host: bump heartbeat timestamp (guests use it to detect host disconnect). */
export async function setHostHeartbeat(code: string): Promise<void> {
  try {
    await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
      hostHeartbeatAt: Date.now(),
    });
  } catch {
    /* best-effort */
  }
}

/** Host: cancel a lobby (no game ever started). */
export async function cancelPlaySession(code: string): Promise<void> {
  try {
    await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
      status: 'cancelled' as PlayFriendsStatus,
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* best-effort */
  }
}

/** Host: end an in-progress game (winner may be null when host bails out). */
export async function endPlaySession(
  code: string,
  winner: PlaySessionWinner | null,
): Promise<void> {
  try {
    await updateDoc(doc(db, PLAY_SESSIONS_COLLECTION, code), {
      status: 'ended' as PlayFriendsStatus,
      winner: winner ? stripUndefined(winner) : null,
      gameOver: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* best-effort */
  }
}
