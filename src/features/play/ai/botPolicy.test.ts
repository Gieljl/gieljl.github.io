import { Card } from '../engine/cards';
import { RoundState } from '../engine/round';
import { chooseAction } from './botPolicy';

const c = (id: string, suit: Card['suit'], rank: Card['rank']): Card => ({ id, suit, rank });

function makeState(overrides: Partial<RoundState> & { hand: Card[]; topPly?: Card[] }): RoundState {
  return {
    players: [
      { id: 'bot', name: 'Bot', isBot: true, hand: overrides.hand },
      {
        id: 'hum',
        name: 'Hum',
        isBot: false,
        hand:
          overrides.players?.[1]?.hand ??
          [c('x1', 'spades', '2'), c('x2', 'hearts', '3'), c('x3', 'clubs', '4')],
      },
    ],
    currentPlayerIndex: 0,
    dealerId: 'hum',
    drawPile: overrides.drawPile ?? [c('d1', 'spades', '5')],
    discardPlies: overrides.discardPlies ?? [overrides.topPly ?? [c('t1', 'hearts', '9')]],
    phase: 'in-progress',
    callerId: null,
    awaitingDraw: false,
  };
}

describe('botPolicy.chooseAction', () => {
  test('declares Yasat when hand is very low (normal difficulty, ≤4 pts)', () => {
    const state = makeState({
      hand: [c('a1', 'spades', 'A'), c('a2', 'hearts', '2')], // 3 pts
    });
    const action = chooseAction(state, 'bot', 'normal');
    expect(action.type).toBe('declareYasat');
  });

  test('does NOT declare Yasat with >7 pts', () => {
    const state = makeState({
      hand: [c('k', 'spades', 'K'), c('q', 'hearts', 'Q')], // 20 pts
    });
    const action = chooseAction(state, 'bot', 'normal');
    expect(action.type).toBe('discardThenDraw');
  });

  test('prefers four-of-a-kind over singles', () => {
    const state = makeState({
      hand: [
        c('q1', 'spades', 'Q'),
        c('q2', 'hearts', 'Q'),
        c('q3', 'clubs', 'Q'),
        c('q4', 'diamonds', 'Q'),
      ],
    });
    const action = chooseAction(state, 'bot', 'normal');
    expect(action.type).toBe('discardThenDraw');
    if (action.type !== 'discardThenDraw') throw new Error('expected discardThenDraw');
    expect(action.discard).toHaveLength(4);
    expect(action.discard.every((c) => c.rank === 'Q')).toBe(true);
  });

  test('prefers pair over single highest', () => {
    const state = makeState({
      hand: [
        c('k', 'spades', 'K'),
        c('p1', 'hearts', '7'),
        c('p2', 'clubs', '7'),
        c('l', 'diamonds', '4'),
      ],
    });
    const action = chooseAction(state, 'bot', 'normal');
    if (action.type !== 'discardThenDraw') throw new Error('expected discard');
    expect(action.discard).toHaveLength(2);
    expect(action.discard.every((c) => c.rank === '7')).toBe(true);
  });

  test('draws from discard pile when it forms a pair', () => {
    const state = makeState({
      hand: [
        c('k', 'spades', 'K'),
        c('s1', 'hearts', '5'),
        c('l', 'diamonds', '4'),
        c('m', 'clubs', '3'),
      ],
      // top ply: a 5 (matches the 5 in hand → pair opportunity)
      topPly: [c('t5', 'diamonds', '5')],
    });
    const action = chooseAction(state, 'bot', 'normal');
    if (action.type !== 'discardThenDraw') throw new Error('expected discard');
    expect(action.drawFrom).toEqual({ fromDiscardId: 't5' });
  });

  test('draws from deck when discard top is high and unhelpful', () => {
    const state = makeState({
      hand: [
        c('a', 'spades', '6'),
        c('b', 'hearts', '8'),
        c('c', 'diamonds', '9'),
        c('d', 'clubs', '10'),
      ],
      topPly: [c('tk', 'spades', 'K')],
    });
    const action = chooseAction(state, 'bot', 'normal');
    if (action.type !== 'discardThenDraw') throw new Error('expected discard');
    expect(action.drawFrom).toBe('deck');
  });

  test('with stat weights, avoids declaring when projected outcome is negative', () => {
    const state = makeState({
      // bot has 7, opponent has 3 -> bot would be Owned if declaring now
      hand: [c('b1', 'spades', '4'), c('b2', 'hearts', '3')],
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('b1', 'spades', '4'), c('b2', 'hearts', '3')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h1', 'clubs', 'A'), c('h2', 'diamonds', '2')] },
      ],
    });
    const action = chooseAction(state, 'bot', 'normal', {
      totalsBefore: { bot: 0, hum: 0 },
      statWeights: [
        { statName: 'Yasat', weight: 1 },
        { statName: 'Owned', weight: -5 },
        { statName: 'Multi-owned', weight: -1 },
      ],
      roundHistory: [],
    });
    expect(action.type).toBe('discardThenDraw');
  });

  test('with stat weights, declares when projected weighted gain is positive', () => {
    const state = makeState({
      // bot has 3, opponent has 9 -> successful Yasat expected
      hand: [c('a1', 'spades', 'A'), c('a2', 'hearts', '2')],
    });
    const action = chooseAction(state, 'bot', 'normal', {
      totalsBefore: { bot: 0, hum: 0 },
      statWeights: [
        { statName: 'Yasat', weight: 2 },
        { statName: 'Owned', weight: -5 },
      ],
      roundHistory: [],
    });
    expect(action.type).toBe('declareYasat');
  });

  test('godlike difficulty deterministically picks best-scored draw source', () => {
    const state = makeState({
      hand: [
        c('hK', 'hearts', 'K'),
        c('s9', 'spades', '9'),
        c('c2', 'clubs', '2'),
        c('d4', 'diamonds', '4'),
      ],
      topPly: [c('ta', 'hearts', 'A')],
      drawPile: [c('d2', 'spades', '2')],
    });
    const action = chooseAction(state, 'bot', 'godlike');
    if (action.type !== 'discardThenDraw') throw new Error('expected discard');
    expect(action.drawFrom).toEqual({ fromDiscardId: 'ta' });
  });
});
