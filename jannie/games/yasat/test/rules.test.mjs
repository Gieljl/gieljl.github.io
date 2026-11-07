// Yasat's pure helpers (web/js/rules.js): the discards and the scoring, as
// package yasat has them (yasat_test.go).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../web/js/rules.js';

test('classify', () => {
  const cases = [['7H', 'single'], ['7H 7S', 'pair'], ['7H 7S 7D', 'three'], ['7H 7S 7D 7C', 'four'], ['7H 8S', ''],
    ['5H 6D 7H', 'straight'], ['5H 6S 7H', ''], ['AH 2H 3D', 'straight'], ['QS KS AC', 'straight'], ['KS AS 2S', ''],
    ['9C TC JC QC KC', 'straight'], ['5H 5H', '']];
  for (const [cards, want] of cases) assert.equal(R.classify(cards.split(' ')), want, cards);
});

test('points', () => {
  assert.equal(R.points(['AS', 'KH', '7D', '2C']), 20);
  assert.equal(R.points(['TH']), 10);
});

const has = (r, e) => r.events.includes(e);

test('score', () => {
  let { won, results: r } = R.score([3, 10, 20], 0, [0, 0, 0]);
  assert.ok(won && r[0].total === 0 && has(r[0], 'yasat') && r[1].total === 10);
  ({ won, results: r } = R.score([5, 2, 9], 0, [10, 10, 10]));
  assert.ok(!won && r[0].total === 45 && has(r[0], 'owned') && has(r[1], 'own') && r[1].total === 10 && r[2].total === 19);
  ({ results: r } = R.score([2, 20, 30], 0, [0, 90, 80]));
  assert.ok(has(r[1], 'death') && has(r[2], 'death') && has(r[0], 'double-kill') && !has(r[0], 'kill'));
  ({ results: r } = R.score([2, 10], 0, [0, 40]));
  assert.ok(has(r[1], 'nullify-50') && has(r[0], 'enable-50') && r[1].total === 0);
  ({ results: r } = R.score([2, 31], 0, [0, 69]));
  assert.ok(has(r[1], 'lullify') && has(r[0], 'enable-69'));
  ({ results: r } = R.score([5, 1], 0, [15, 0]));
  assert.ok(has(r[0], 'contra-own-50') && !has(r[0], 'nullify-50') && has(r[0], 'enable-50'));
});

test('weighted', () => {
  const round = evs => ({ results: evs.map(events => ({ events })) });
  const { w, owner } = R.weighted([round([['yasat'], []]), round([['yasat'], []]), round([['owned'], ['own']])], 2);
  assert.equal(owner, 0);
  assert.deepEqual(w, [1 + 1 - 2 + R.LONGEST_STREAK, 3]);
});
