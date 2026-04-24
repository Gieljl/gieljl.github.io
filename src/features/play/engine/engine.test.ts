import {
  buildDeck,
  cardValue,
  colorOf,
  handPoints,
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

  test('pickableFromDiscard: single → itself, set → any, straight → edges', () => {
    const single = [c('1', 'hearts', '9')];
    expect(pickableFromDiscard(single).map((x) => x.id)).toEqual(['1']);

    const pair = [c('1', 'spades', '7'), c('2', 'hearts', '7')];
    expect(pickableFromDiscard(pair).map((x) => x.id).sort()).toEqual(['1', '2']);

    const straight = [
      c('a', 'hearts', '5'),
      c('b', 'diamonds', '6'),
      c('c', 'hearts', '7'),
    ];
    const edges = pickableFromDiscard(straight).map((x) => x.id).sort();
    expect(edges).toEqual(['a', 'c']);

    // ace-low straight edges
    const aceLow = [
      c('a', 'hearts', 'A'),
      c('b', 'diamonds', '2'),
      c('c', 'hearts', '3'),
    ];
    expect(pickableFromDiscard(aceLow).map((x) => x.id).sort()).toEqual(['a', 'c']);
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
    // Craft a straight on the discard pile, then try to pick a middle card.
    let s = setup();
    const straight = [
      c('s1', 'hearts', '5'),
      c('s2', 'diamonds', '6'),
      c('s3', 'hearts', '7'),
    ];
    s = { ...s, discardPlies: [straight] };
    const actor = s.players[s.currentPlayerIndex];
    const r = applyAction(s, {
      type: 'discardThenDraw',
      discard: [actor.hand[0]],
      drawFrom: { fromDiscardId: 's2' }, // middle card — illegal
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
});
