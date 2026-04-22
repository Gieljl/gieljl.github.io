import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { player } from '../players/playersSlice';
import { ScoreState } from '../game/scoreSlice';
import { GameState } from '../game/gameSlice';
import { statsState } from '../stats/statsSlice';

export interface SessionDocument {
  players: player[];
  scores: {
    present: ScoreState;
    past: ScoreState[];
  };
  stats: statsState;
  game: GameState;
  createdAt: any;
  updatedAt: any;
}

const SESSIONS_COLLECTION = 'sessions';

/**
 * Recursively strip `undefined` values from an object so Firestore doesn't
 * reject the write. Firestore does not accept `undefined` as a field value.
 */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous chars 0/O, 1/I
  let code = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export async function createSession(
  code: string,
  gameState: {
    players: player[];
    scores: { present: ScoreState; past: ScoreState[] };
    stats: statsState;
    game: GameState;
  }
): Promise<void> {
  const sessionDoc: SessionDocument = {
    players: stripUndefined(gameState.players),
    scores: stripUndefined(gameState.scores),
    stats: stripUndefined(gameState.stats),
    game: stripUndefined(gameState.game),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, SESSIONS_COLLECTION, code), sessionDoc);
}

export async function updateSession(
  code: string,
  gameState: {
    players: player[];
    scores: { present: ScoreState; past: ScoreState[] };
    stats: statsState;
    game: GameState;
  }
): Promise<void> {
  await setDoc(
    doc(db, SESSIONS_COLLECTION, code),
    {
      players: stripUndefined(gameState.players),
      scores: stripUndefined(gameState.scores),
      stats: stripUndefined(gameState.stats),
      game: stripUndefined(gameState.game),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteSession(code: string): Promise<void> {
  await deleteDoc(doc(db, SESSIONS_COLLECTION, code));
}

export async function fetchSession(
  code: string
): Promise<SessionDocument | null> {
  const snap = await getDoc(doc(db, SESSIONS_COLLECTION, code));
  if (!snap.exists()) return null;
  return snap.data() as SessionDocument;
}

export function subscribeToSession(
  code: string,
  callback: (data: SessionDocument | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, SESSIONS_COLLECTION, code), (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback(snap.data() as SessionDocument);
    }
  });
}
