/**
 * Round scoring & meta-stat resolution.
 *
 * Given a terminated RoundState, produces:
 *  - each player's hand points
 *  - the round outcome (who won / got owned / killed / nullified / etc.)
 *  - updated cumulative totals for the tournament
 *
 * All values are plain returns — nothing is dispatched or persisted anywhere.
 */
import { handPoints } from './cards';
import { PlayerId, RoundState } from './round';

export interface PerPlayerRoundResult {
  playerId: PlayerId;
  handPoints: number;
  /** Points added to their cumulative total after all adjustments. */
  pointsAdded: number;
  /** New cumulative total after this round. */
  newTotal: number;
  events: RoundStatEvent[];
}

export type RoundStatEvent =
  | 'yasat'
  | 'own'
  | 'owned'
  | 'multi-owned'
  | 'kill'
  | 'double-kill'
  | 'multi-kill'
  | 'mega-kill'
  | 'monster-kill'
  | 'death'
  | 'nullify-50'
  | 'nullify-100'
  | 'enable-50'
  | 'enable-100'
  | 'lullify'
  | 'enable-69'
  | 'contra-own-50'
  | 'contra-own-100';

export interface RoundOutcome {
  callerId: PlayerId;
  /** Whether the caller actually had the lowest (or tied-lowest) score. */
  callerWon: boolean;
  perPlayer: PerPlayerRoundResult[];
}

export interface ScoringInput {
  state: RoundState;
  /** Cumulative totals going INTO this round. */
  totalsBefore: Record<PlayerId, number>;
}

/**
 * Compute the full outcome of a terminated round.
 */
export function scoreRound(input: ScoringInput): RoundOutcome {
  const { state, totalsBefore } = input;
  if (state.phase !== 'ended' || !state.callerId) {
    throw new Error('Cannot score a non-terminated round.');
  }
  const callerId = state.callerId;

  // 1. Raw hand points per player (aces as 1 by default).
  const rawPoints = new Map<PlayerId, number>();
  for (const p of state.players) {
    rawPoints.set(p.id, handPoints(p.hand));
  }
  const callerPts = rawPoints.get(callerId)!;

  // 2. Determine owners — players strictly below the caller's points.
  const owners = state.players
    .filter((p) => p.id !== callerId && (rawPoints.get(p.id) ?? 0) < callerPts)
    .map((p) => p.id);
  const callerWon = owners.length === 0;

  // 3. Compute per-player pointsAdded + events (first pass: base adjustment).
  const results: PerPlayerRoundResult[] = state.players.map((p) => {
    const hp = rawPoints.get(p.id)!;
    const events: RoundStatEvent[] = [];
    let pointsAdded = hp;

    if (p.id === callerId) {
      if (callerWon) {
        // Successful Yasat: caller's round-points reset to 0, +Yasat stat.
        pointsAdded = 0;
        events.push('yasat');
      } else {
        // Owned: 35 penalty instead of their hand points.
        pointsAdded = 35;
        events.push('owned');
        if (owners.length > 1) events.push('multi-owned');
      }
    } else if (owners.includes(p.id)) {
      // Owner: reset round-points to 0.
      pointsAdded = 0;
      events.push('own');
    }
    // other players: pointsAdded stays at their hand points

    return {
      playerId: p.id,
      handPoints: hp,
      pointsAdded,
      newTotal: 0, // filled in below
      events,
    };
  });

  // 4. Apply cumulative totals + nullify / contra-own / lullify / death.
  //    We consider the *provisional* total (before nullify resets) to detect
  //    the special lands (50 / 100 / 69→100).
  for (const r of results) {
    const prev = totalsBefore[r.playerId] ?? 0;
    const provisional = prev + r.pointsAdded;

    // Death: over 100 → reset to 0, -5 weighted (death event).
    if (provisional > 100) {
      r.newTotal = 0;
      r.events.push('death');
      continue;
    }

    // Lullify: was 69 and landed exactly on 100.
    if (prev === 69 && provisional === 100) {
      r.newTotal = 0;
      r.events.push('lullify');
      // Caller "enabled 69" for this player.
      pushEnableEvent(results, callerId, 'enable-69');
      continue;
    }

    if (provisional === 50 || provisional === 100) {
      // Nullify. Distinguish ordinary nullify vs contra-own (only relevant
      // when this player is an owner that benefited from Own=0 reset).
      const isOwner = owners.includes(r.playerId);
      if (isOwner) {
        // Contra-own: the Own reset pushed them to exactly 50 or 100.
        // We detect this by checking if previous total was 15→50 or 65→100
        // (i.e. provisional == prev because pointsAdded is 0). When
        // pointsAdded is 0 and prev is 50 or 100, that's a contra-own.
        if (r.pointsAdded === 0 && (prev === 50 || prev === 100)) {
          r.newTotal = 0;
          r.events.push(prev === 50 ? 'contra-own-50' : 'contra-own-100');
          continue;
        }
      }
      r.newTotal = 0;
      r.events.push(provisional === 50 ? 'nullify-50' : 'nullify-100');
      // Caller enabled this nullify (only if caller caused it via owning/non-reset path).
      if (r.playerId !== callerId) {
        pushEnableEvent(results, callerId, provisional === 50 ? 'enable-50' : 'enable-100');
      }
      continue;
    }

    r.newTotal = provisional;
  }

  // 5. Kill bonuses: for every non-caller player whose total ended at 0 due to
  //    a Death event, award the caller a kill (with multi-kill escalations).
  const killCount = results.filter(
    (r) => r.playerId !== callerId && r.events.includes('death'),
  ).length;
  if (killCount > 0 && callerWon) {
    const callerResult = results.find((r) => r.playerId === callerId)!;
    callerResult.events.push('kill');
    if (killCount >= 2) callerResult.events.push('double-kill');
    if (killCount >= 3) callerResult.events.push('multi-kill');
    if (killCount >= 4) callerResult.events.push('mega-kill');
    if (killCount >= 5) callerResult.events.push('monster-kill');
  }

  return {
    callerId,
    callerWon,
    perPlayer: results,
  };
}

function pushEnableEvent(
  results: PerPlayerRoundResult[],
  callerId: PlayerId,
  ev: RoundStatEvent,
): void {
  const caller = results.find((r) => r.playerId === callerId);
  if (caller && !caller.events.includes(ev)) {
    caller.events.push(ev);
  }
}
