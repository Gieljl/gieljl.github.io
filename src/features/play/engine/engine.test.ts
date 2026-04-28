import {
  buildDeck,
  cardValue,
  colorOf,
  handPoints,
  handPointsWithChoices,
  isRed,
  rankOrdinal,
  shuffle,
  Card,
} from './cards';
import {
  classifyDiscard,
  isPair,
  isStraight,
  isValidDiscard,
  pickableFromDiscard,
} from './combos';
import { applyAction, startRound } from './round';
import { scoreRound } from './scoring';

const c = (id: string, suit: Card['suit'], rank: Card['rank']): Card => ({ id, suit, rank });

describe('cards', () => {
  test('buildDeck makes 52 unique cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((d) => d.id)).size).toBe(52);
  });

  test('cardValue: face cards are 10, ace 1 or 11', () => {
    expect(cardValue({ id: 'x', suit: 'spades', rank: 'K' })).toBe(10);
    expect(cardValue({ id: 'x', suit: 'spades', rank: 'J' })).toBe(10);
    expect(cardValue({ id: 'x', suit: 'spades', rank: 'A' }, 1)).toBe(1);
    expect(cardValue({ id: 'x', suit: 'spades', rank: 'A' }, 11)).toBe(11);
    expect(cardValue({ id: 'x', suit: 'hearts', rank: '7' })).toBe(7);
  });

  test('isRed / colorOf', () => {
    expect(isRed(c('a', 'hearts', '5'))).toBe(true);
    expect(isRed(c('a', 'diamonds', '5'))).toBe(true);
    expect(isRed(c('a', 'spades', '5'))).toBe(false);
    expect(colorOf(c('a', 'clubs', '5'))).toBe('black');
  });

  test('rankOrdinal', () => {
    expect(rankOrdinal('A')).toBe(1);
    expect(rankOrdinal('10')).toBe(10);
    expect(rankOrdinal('K')).toBe(13);
  });

  test('handPoints sums with aces as 1', () => {
    expect(
      handPoints([
        c('1', 'spades', 'A'),
        c('2', 'hearts', 'K'),
        c('3', 'clubs', '5'),
      ]),
    ).toBe(16);
  });

  test('shuffle with seed is deterministic', () => {
    const a = shuffle(buildDeck(), 42);
    const b = shuffle(buildDeck(), 42);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
});

describe('combos', () => {
  test('pair', () => {
    expect(isPair([c('1', 'spades', '7'), c('2', 'hearts', '7')])).toBe(true);
    expect(isPair([c('1', 'spades', '7'), c('2', 'hearts', '8')])).toBe(false);
  });

  test('straight requires same color, ≥3, consecutive', () => {
    // 5-6-7 hearts (red)
    expect(
      isStraight([
        c('1', 'hearts', '5'),
        c('2', 'diamonds', '6'),
        c('3', 'hearts', '7'),
      ]),
    ).toBe(true);
    // mixed color
    expect(
      isStraight([
        c('1', 'hearts', '5'),
        c('2', 'spades', '6'),
        c('3', 'hearts', '7'),
      ]),
    ).toBe(false);
    // too short
    expect(isStraight([c('1', 'hearts', '5'), c('2', 'diamonds', '6')])).toBe(false);
    // non-consecutive
    expect(
      isStraight([
        c('1', 'hearts', '5'),
        c('2', 'diamonds', '7'),
        c('3', 'hearts', '8'),
      ]),
    ).toBe(false);
  });

  test('straight wraps: A-2-3 and Q-K-A', () => {
    expect(
      isStraight([
        c('1', 'hearts', 'A'),
        c('2', 'diamonds', '2'),
        c('3', 'hearts', '3'),
      ]),
    ).toBe(true);
    expect(
      isStraight([
        c('1', 'hearts', 'Q'),
        c('2', 'diamonds', 'K'),
        c('3', 'hearts', 'A'),
      ]),
    ).toBe(true);
  });

  test('classifyDiscard', () => {
    expect(classifyDiscard([c('1', 'spades', '5')])).toBe('single');
    expect(classifyDiscard([c('1', 'spades', '7'), c('2', 'hearts', '7')])).toBe('pair');
    expect(
      classifyDiscard([
        c('1', 'spades', '7'),
        c('2', 'hearts', '7'),
        c('3', 'clubs', '7'),
      ]),
    ).toBe('three-of-a-kind');
    expect(isValidDiscard([c('1', 'spades', '5'), c('2', 'hearts', '8')])).toBe(false);
  });

  test('pickableFromDiscard: any card of the last discard is pickable', () => {
    const single = [c('1', 'hearts', '9')];
    expect(pickableFromDiscard(single).map((x) => x.id)).toEqual(['1']);

    const pair = [c('1', 'spades', '7'), c('2', 'hearts', '7')];
    expect(pickableFromDiscard(pair).map((x) => x.id).sort()).toEqual(['1', '2']);

    // 3-card straight: all three are pickable
    const straight3 = [
      c('a', 'hearts', '5'),
      c('b', 'diamonds', '6'),
      c('c', 'hearts', '7'),
    ];
    expect(pickableFromDiscard(straight3).map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);

    // 4-card straight: all four are pickable
    const straight4 = [
      c('a', 'hearts', '5'),
      c('b', 'diamonds', '6'),
      c('c', 'hearts', '7'),
      c('d', 'diamonds', '8'),
    ];
    expect(pickableFromDiscard(straight4).map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('round.startRound / applyAction', () => {
  const setup = () =>
    startRound({
      players: [
        { id: 'p1', name: 'Alice', isBot: false },
        { id: 'p2', name: 'Bob', isBot: true },
      ],
      dealerId: 'p1',
      seed: 7,
    });

  test('deals 4 cards each and flips top discard', () => {
    const s = setup();
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.players[1].hand).toHaveLength(4);
    expect(s.discardPlies[0]).toHaveLength(1);
    expect(s.drawPile.length).toBe(52 - 8 - 1);
    // first to act is left of dealer (index 1 when dealer is index 0)
    expect(s.currentPlayerIndex).toBe(1);
  });

  test('rejects Yasat with >7 points', () => {
    let s = setup();
    // Force hand: give current player 4 kings
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? {
              ...p,
              hand: [
                c('k1', 'spades', 'K'),
                c('k2', 'hearts', 'K'),
                c('k3', 'clubs', 'K'),
                c('k4', 'diamonds', 'K'),
              ],
            }
          : p,
      ),
    };
    const r = applyAction(s, { type: 'declareYasat' });
    expect(r.error).toMatch(/Cannot declare Yasat/);
    expect(r.state.phase).toBe('in-progress');
  });

  test('accepts Yasat with ≤7 points and ends round', () => {
    let s = setup();
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? { ...p, hand: [c('a', 'spades', 'A'), c('b', 'hearts', '3')] }
          : p,
      ),
    };
    const r = applyAction(s, { type: 'declareYasat' });
    expect(r.error).toBeUndefined();
    expect(r.state.phase).toBe('ended');
    expect(r.state.callerId).toBe(s.players[s.currentPlayerIndex].id);
  });

  test('discardThenDraw: rejects invalid combo', () => {
    const s = setup();
    const actor = s.players[s.currentPlayerIndex];
    const two = actor.hand.slice(0, 2); // random two cards — unlikely to be a pair
    if (two[0].rank === two[1].rank) return; // skip when accidentally valid
    const r = applyAction(s, {
      type: 'discardThenDraw',
      discard: two,
      drawFrom: 'deck',
    });
    expect(r.error).toMatch(/Invalid discard/);
  });

  test('discardThenDraw: single-card + draw from deck advances turn', () => {
    const s = setup();
    const actor = s.players[s.currentPlayerIndex];
    const r = applyAction(s, {
      type: 'discardThenDraw',
      discard: [actor.hand[0]],
      drawFrom: 'deck',
    });
    expect(r.error).toBeUndefined();
    expect(r.state.currentPlayerIndex).not.toBe(s.currentPlayerIndex);
    const newActor = r.state.players.find((p) => p.id === actor.id)!;
    expect(newActor.hand).toHaveLength(4);
    expect(newActor.hand.some((ch) => ch.id === actor.hand[0].id)).toBe(false);
  });

  test('drawing from discard is limited to pickable cards', () => {
    // Pickable cards are the cards of the last discard. Asking for an id that
    // wasn't part of it must fail.
    let s = setup();
    const straight = [
      c('s1', 'hearts', '5'),
      c('s2', 'diamonds', '6'),
      c('s3', 'hearts', '7'),
      c('s4', 'diamonds', '8'),
    ];
    s = { ...s, discardPlies: [straight] };
    const actor = s.players[s.currentPlayerIndex];
    const r = applyAction(s, {
      type: 'discardThenDraw',
      discard: [actor.hand[0]],
      drawFrom: { fromDiscardId: 'not-in-discard' },
    });
    expect(r.error).toMatch(/not available/);
  });
});

describe('scoring.scoreRound', () => {
  const mkEnded = (
    caller: string,
    hands: Record<string, Card[]>,
  ) => {
    const players = Object.entries(hands).map(([id, hand]) => ({
      id,
      name: id,
      isBot: false,
      hand,
    }));
    return {
      players,
      currentPlayerIndex: 0,
      dealerId: players[0].id,
      drawPile: [],
      discardPlies: [[]],
      phase: 'ended' as const,
      callerId: caller,
      awaitingDraw: false,
    };
  };

  test('caller wins — +yasat, round points = 0', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', 'A'), c('b', 'hearts', '3')], // 4 pts
      p2: [c('c', 'clubs', 'K'), c('d', 'hearts', '9')], // 19 pts
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 0 } });
    expect(out.callerWon).toBe(true);
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.pointsAdded).toBe(0);
    expect(p1.events).toContain('yasat');
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.pointsAdded).toBe(19);
  });

  test('owned — caller gets 35 penalty and owner resets to 0', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'hearts', '6'), c('b', 'spades', 'A')], // 7 pts
      p2: [c('c', 'clubs', 'A'), c('d', 'hearts', '2')], // 3 pts — below caller
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 0 } });
    expect(out.callerWon).toBe(false);
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.pointsAdded).toBe(35);
    expect(p1.events).toContain('owned');
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.pointsAdded).toBe(0);
    expect(p2.events).toContain('own');
  });

  test('death: total over 100 resets to 0 and caller gets kill', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', '2'), c('b', 'hearts', '2')], // 4
      p2: [c('c', 'clubs', 'K'), c('d', 'hearts', 'K')], // 20
    });
    const out = scoreRound({ state, totalsBefore: { p1: 10, p2: 90 } });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.newTotal).toBe(0);
    expect(p2.events).toContain('death');
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.events).toContain('kill');
  });

  test('double kill awards only double-kill (no normal kill)', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', '2'), c('b', 'hearts', '2')], // 4
      p2: [c('c', 'clubs', 'K'), c('d', 'hearts', 'K')], // 20 -> death from 90
      p3: [c('e', 'spades', 'Q'), c('f', 'diamonds', '10')], // 20 -> death from 90
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 90, p3: 90 } });
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.events).toContain('double-kill');
    expect(p1.events).not.toContain('kill');
  });

  test('multi/mega/monster are single-tier events with no normal kill', () => {
    const mk = (nVictims: number) => {
      const hands: Record<string, Card[]> = {
        p1: [c('a', 'spades', '2')],
      };
      const totals: Record<string, number> = { p1: 0 };
      for (let i = 0; i < nVictims; i++) {
        const id = `p${i + 2}`;
        hands[id] = [c(`k${i}`, 'clubs', 'K'), c(`q${i}`, 'hearts', 'Q')]; // 20
        totals[id] = 90;
      }
      return scoreRound({ state: mkEnded('p1', hands), totalsBefore: totals });
    };

    const multi = mk(3).perPlayer.find((r) => r.playerId === 'p1')!;
    expect(multi.events).toContain('multi-kill');
    expect(multi.events).not.toContain('kill');

    const mega = mk(4).perPlayer.find((r) => r.playerId === 'p1')!;
    expect(mega.events).toContain('mega-kill');
    expect(mega.events).not.toContain('kill');

    const monster = mk(5).perPlayer.find((r) => r.playerId === 'p1')!;
    expect(monster.events).toContain('monster-kill');
    expect(monster.events).not.toContain('kill');
  });

  test('nullify-50: landing on exactly 50 resets to 0', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', 'A'), c('b', 'hearts', '2')], // 3
      p2: [c('c', 'clubs', '5'), c('d', 'hearts', '5')], // 10 → 40+10=50
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 40 } });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.newTotal).toBe(0);
    expect(p2.events).toContain('nullify-50');
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.events).toContain('enable-50');
  });

  test('lullify: prev 69 lands on 100', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', 'A')], // 1
      p2: [c('c', 'clubs', 'K'), c('d', 'hearts', '9'), c('e', 'spades', '2'), c('f', 'clubs', '10')], // 31 → 69+31=100
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 69 } });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.newTotal).toBe(0);
    expect(p2.events).toContain('lullify');
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.events).toContain('enable-69');
  });

  test('contra-own-50: Owned caller at 15 gets +35 penalty landing on 50', () => {
    // p1 declares Yasat but p2 has lower score → p1 is Owned (+35).
    // p1 was at 15 total before → 15+35=50 = contra-own-50.
    const state = mkEnded('p1', {
      p1: [c('a', 'hearts', '7'), c('b', 'spades', '3')], // 10 pts
      p2: [c('c', 'clubs', 'A'), c('d', 'hearts', '2')],  // 3 pts — below caller
    });
    const out = scoreRound({ state, totalsBefore: { p1: 15, p2: 0 } });
    expect(out.callerWon).toBe(false);
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.pointsAdded).toBe(35);
    expect(p1.newTotal).toBe(0);
    expect(p1.events).toContain('owned');
    expect(p1.events).toContain('contra-own-50');
  });

  test('contra-own-100: Owned caller at 65 gets +35 penalty landing on 100', () => {
    const state = mkEnded('p1', {
      p1: [c('a', 'hearts', '7'), c('b', 'spades', '3')], // 10 pts
      p2: [c('c', 'clubs', 'A'), c('d', 'hearts', '2')],  // 3 pts
    });
    const out = scoreRound({ state, totalsBefore: { p1: 65, p2: 0 } });
    const p1 = out.perPlayer.find((r) => r.playerId === 'p1')!;
    expect(p1.pointsAdded).toBe(35);
    expect(p1.newTotal).toBe(0);
    expect(p1.events).toContain('owned');
    expect(p1.events).toContain('contra-own-100');
  });

  test('normal nullify-50 for non-owned player is not labelled contra-own', () => {
    // p1 wins Yasat. p2 had 40 total + 10 hand = 50 → plain nullify-50.
    const state = mkEnded('p1', {
      p1: [c('a', 'spades', 'A'), c('b', 'hearts', '2')], // 3 pts
      p2: [c('c', 'clubs', '5'), c('d', 'hearts', '5')],  // 10 pts
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 40 } });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.events).toContain('nullify-50');
    expect(p2.events).not.toContain('contra-own-50');
  });
});

describe('handPointsWithChoices', () => {
  test('defaults aces to 1 when no choices provided', () => {
    const hand = [c('a', 'spades', 'A'), c('b', 'hearts', '5')];
    expect(handPointsWithChoices(hand, {})).toBe(6); // 1 + 5
  });

  test('ace chosen as 11', () => {
    const hand = [c('a', 'spades', 'A'), c('b', 'hearts', '5')];
    expect(handPointsWithChoices(hand, { a: 11 })).toBe(16); // 11 + 5
  });

  test('multiple aces with mixed choices', () => {
    const hand = [
      c('a1', 'spades', 'A'),
      c('a2', 'hearts', 'A'),
      c('b', 'clubs', '3'),
    ];
    expect(handPointsWithChoices(hand, { a1: 11, a2: 1 })).toBe(15); // 11 + 1 + 3
  });
});

describe('scoring with aceChoices', () => {
  const mkEnded2 = (
    caller: string,
    hands: Record<string, Card[]>,
  ) => ({
    players: Object.entries(hands).map(([id, hand]) => ({
      id,
      name: id,
      isBot: false,
      hand,
    })),
    currentPlayerIndex: 0,
    dealerId: Object.keys(hands)[0],
    drawPile: [],
    discardPlies: [[]],
    phase: 'ended' as const,
    callerId: caller,
    awaitingDraw: false,
  });

  test('ace-as-11 triggers nullify-50', () => {
    // p2: ace + 8 = 9 (default) or 19 (ace=11). Prev total = 31. 31+19=50 → nullify.
    const state = mkEnded2('p1', {
      p1: [c('a', 'spades', '2')], // 2 pts, caller wins
      p2: [c('b', 'hearts', 'A'), c('d', 'clubs', '8')],
    });
    const out = scoreRound({
      state,
      totalsBefore: { p1: 0, p2: 31 },
      aceChoices: { p2: { b: 11 } },
    });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.handPoints).toBe(19); // 11 + 8
    expect(p2.newTotal).toBe(0);
    expect(p2.events).toContain('nullify-50');
  });

  test('ace-as-1 avoids death, ace-as-11 would cause death', () => {
    // p2: ace + K = 11 (default) or 21 (ace=11). Prev total = 90.
    // ace=1: 90+11=101 → death. ace=11: 90+21=111 → also death.
    // But with a different hand: ace + 5 = 6. Prev = 90. 90+6=96 (safe).
    const state = mkEnded2('p1', {
      p1: [c('a', 'spades', '2')], // 2 pts
      p2: [c('b', 'hearts', 'A'), c('d', 'clubs', '5')],
    });
    // ace as 1 → handPoints 6, total 96 (safe)
    const out1 = scoreRound({
      state,
      totalsBefore: { p1: 0, p2: 90 },
      aceChoices: { p2: { b: 1 } },
    });
    const p2a = out1.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2a.handPoints).toBe(6);
    expect(p2a.newTotal).toBe(96);
    expect(p2a.events).not.toContain('death');

    // ace as 11 → handPoints 16, total 106 → death
    const out2 = scoreRound({
      state,
      totalsBefore: { p1: 0, p2: 90 },
      aceChoices: { p2: { b: 11 } },
    });
    const p2b = out2.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2b.handPoints).toBe(16);
    expect(p2b.newTotal).toBe(0);
    expect(p2b.events).toContain('death');
  });

  test('ace-as-11 triggers lullify from 69', () => {
    // p2: ace + K + K = 21 (default) or 31 (ace=11). Prev total = 69.
    // ace=11: 69+31=100 → lullify!
    const state = mkEnded2('p1', {
      p1: [c('a', 'spades', '2')],
      p2: [c('b', 'hearts', 'A'), c('d', 'clubs', 'K'), c('e', 'spades', 'K')],
    });
    const out = scoreRound({
      state,
      totalsBefore: { p1: 0, p2: 69 },
      aceChoices: { p2: { b: 11 } },
    });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.handPoints).toBe(31); // 11 + 10 + 10
    expect(p2.newTotal).toBe(0);
    expect(p2.events).toContain('lullify');
  });

  test('no aceChoices provided behaves like before (aces as 1)', () => {
    const state = mkEnded2('p1', {
      p1: [c('a', 'spades', '2')],
      p2: [c('b', 'hearts', 'A'), c('d', 'clubs', '8')],
    });
    const out = scoreRound({ state, totalsBefore: { p1: 0, p2: 0 } });
    const p2 = out.perPlayer.find((r) => r.playerId === 'p2')!;
    expect(p2.handPoints).toBe(9); // 1 + 8
  });
});
