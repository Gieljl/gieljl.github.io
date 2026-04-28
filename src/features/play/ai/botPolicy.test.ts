import { Card } from '../engine/cards';
import { RoundState } from '../engine/round';
import { chooseAction, chooseBotAceValues, getPersonality } from './botPolicy';

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

  test('normal bot calls Yasat on 2 points when no ace-risk is observed', () => {
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });

    const action = chooseAction(state, 'bot', 'normal', {
      visibleRoundEvents: [],
      personality: 'balanced',
    });

    expect(action.type).toBe('declareYasat');
  });

  test('normal bot avoids Yasat on 2 points after seeing opponent take Ace from discard', () => {
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });

    const action = chooseAction(state, 'bot', 'normal', {
      visibleRoundEvents: [
        {
          type: 'drewFromDiscard',
          playerId: 'hum',
          card: c('seenA', 'diamonds', 'A'),
        },
      ],
      personality: 'balanced',
    });

    expect(action.type).toBe('discardThenDraw');
  });

  test('normal bot still calls Yasat on 2 points when observed one-card risk is a seen 2 (not Ace)', () => {
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });

    const action = chooseAction(state, 'bot', 'normal', {
      visibleRoundEvents: [
        {
          type: 'drewFromDiscard',
          playerId: 'hum',
          card: c('seen2', 'diamonds', '2'),
        },
      ],
      personality: 'balanced',
    });

    expect(action.type).toBe('declareYasat');
  });

  test('normal bot avoids Yasat on 3 points when opponent has one visible low card', () => {
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b2', 'hearts', '2')], // 3 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b2', 'hearts', '2')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });

    const action = chooseAction(state, 'bot', 'normal', {
      visibleRoundEvents: [
        {
          type: 'drewFromDiscard',
          playerId: 'hum',
          card: c('seen2', 'diamonds', '2'),
        },
      ],
      personality: 'balanced',
    });

    expect(action.type).toBe('discardThenDraw');
  });

  test('easy bot is more reckless than normal on 2 points even with seen ace pickup', () => {
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });

    const action = chooseAction(state, 'bot', 'easy', {
      visibleRoundEvents: [
        {
          type: 'drewFromDiscard',
          playerId: 'hum',
          card: c('seenA', 'diamonds', 'A'),
        },
      ],
      personality: 'balanced',
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

describe('botPolicy personality system', () => {
  test('personality assignment is deterministic per botId', () => {
    expect(getPersonality('bot-a')).toBe(getPersonality('bot-a'));
    expect(getPersonality('bot-b')).toBe(getPersonality('bot-b'));
  });

  test('cautious personality avoids risky Yasat that balanced would call', () => {
    // 2 pts vs 1-card unknown opponent: balanced(0) eff=2 <4 → call,
    // cautious(-2) eff=4 not <4 → discard.
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h?', 'clubs', 'A')] },
      ],
    });

    const balanced = chooseAction(state, 'bot', 'normal', {
      personality: 'balanced',
      totalsBefore: { bot: 30, hum: 30 },
      visibleRoundEvents: [],
    });
    const cautious = chooseAction(state, 'bot', 'normal', {
      personality: 'cautious',
      totalsBefore: { bot: 30, hum: 30 },
      visibleRoundEvents: [],
    });

    expect(balanced.type).toBe('declareYasat');
    expect(cautious.type).toBe('discardThenDraw');
  });

  test('aggressive personality calls Yasat in scenario where balanced would not', () => {
    // 3 pts vs 1-card opp seen taking low '2' from discard.
    // Risk: minPossible=2<3 → +4(1-card observed) +2(fully observed) = 6.
    // balanced(0) eff=6 not <5 → discard.
    // aggressive(+2) eff=4 <5 → call.
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b2', 'hearts', '2')], // 3 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b2', 'hearts', '2')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h?', 'clubs', '2')] },
      ],
    });
    const events: Parameters<typeof chooseAction>[3] = {
      visibleRoundEvents: [
        { type: 'drewFromDiscard', playerId: 'hum', card: c('seen2', 'diamonds', '2') },
      ],
    };

    const balanced = chooseAction(state, 'bot', 'normal', { ...events, personality: 'balanced' });
    const aggressive = chooseAction(state, 'bot', 'normal', { ...events, personality: 'aggressive' });

    expect(balanced.type).toBe('discardThenDraw');
    expect(aggressive.type).toBe('declareYasat');
  });
});

describe('botPolicy survival mode', () => {
  test('bot near 100 cumulative becomes more cautious (loss = death)', () => {
    // 2 pts vs 1-card unknown opp.
    // Without survival pressure (total=0): risk=2, eff=2 <4 → call.
    // Near death (total=95) with cautious: survival=+3, eff=2-(-2)+3=7 not <4 → discard.
    const state = makeState({
      hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')], // 2 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('bA', 'spades', 'A'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h?', 'clubs', 'A')] },
      ],
    });

    const safeTotal = chooseAction(state, 'bot', 'normal', {
      personality: 'cautious',
      totalsBefore: { bot: 0, hum: 0 },
      visibleRoundEvents: [],
    });
    const nearDeath = chooseAction(state, 'bot', 'normal', {
      personality: 'cautious',
      totalsBefore: { bot: 95, hum: 0 },
      visibleRoundEvents: [],
    });

    expect(safeTotal.type).toBe('declareYasat');
    expect(nearDeath.type).toBe('discardThenDraw');
  });
});

describe('botPolicy tactical bonuses', () => {
  test('Kill opportunity tactical bonus tips a borderline declare', () => {
    // 4 pts vs 1-card opp known '2' — borderline (risk=6, threshold <6).
    // Without context (no totals): tactical=0, eff=6 not <6 → discard.
    // With opp at 99 total (kill setup): tactical+=1 (>=95 branch), survival=-1
    // (low bot total) → eff=6-1-1=4 <6 → call.
    const state = makeState({
      hand: [c('b3', 'spades', '3'), c('b1', 'hearts', 'A')], // 4 pts
      players: [
        { id: 'bot', name: 'Bot', isBot: true, hand: [c('b3', 'spades', '3'), c('b1', 'hearts', 'A')] },
        { id: 'hum', name: 'Hum', isBot: false, hand: [c('h2', 'clubs', '2')] },
      ],
    });
    const events: Parameters<typeof chooseAction>[3] = {
      visibleRoundEvents: [
        { type: 'drewFromDiscard', playerId: 'hum', card: c('seen2', 'diamonds', '2') },
      ],
    };

    const noTactical = chooseAction(state, 'bot', 'normal', {
      ...events,
      personality: 'balanced',
      totalsBefore: { bot: 30, hum: 30 },
    });
    const withKill = chooseAction(state, 'bot', 'normal', {
      ...events,
      personality: 'balanced',
      totalsBefore: { bot: 30, hum: 99 },
    });

    expect(noTactical.type).toBe('discardThenDraw');
    expect(withKill.type).toBe('declareYasat');
  });
});

describe('chooseBotAceValues with difficulty/personality', () => {
  test('easy bot defaults all aces to 1 (skips optimization)', () => {
    const hand: Card[] = [c('a1', 'spades', 'A'), c('a2', 'hearts', 'A'), c('k1', 'clubs', '5')];
    // total before = 33, with 2 aces as 1+1+5 = 7, total = 40.
    // Optimal would consider 11+1+5 = 17 → total 50 (Nullify).
    // Easy + cautious should NOT find this.
    const choices = chooseBotAceValues(hand, 'bot', 33, false, 'caller', false, 'easy', 'cautious');
    expect(choices['a1']).toBe(1);
    expect(choices['a2']).toBe(1);
  });

  test('godlike bot finds optimal nullify-50 with aces', () => {
    const hand: Card[] = [c('a1', 'spades', 'A'), c('a2', 'hearts', 'A'), c('k1', 'clubs', '5')];
    // 33 + (11+1+5) = 50 (Nullify). 33 + (1+11+5) = 50 also. 33 + (11+11+5) = 60.
    const choices = chooseBotAceValues(hand, 'bot', 33, false, 'caller', false, 'godlike', 'balanced');
    const total = 33 + (choices['a1'] === 11 ? 11 : 1) + (choices['a2'] === 11 ? 11 : 1) + 5;
    expect(total).toBe(50);
  });
});
