// Scoreblad: the score of a game of Yasat at a real table, with real
// cards (games/yasat/README.md#scoreblad). After every round you say who
// called Yasat and what everyone held; the sheet works out the events, the
// totals and the weighted score, as the table does. Kept in this browser
// only (kj.score). Loaded when first opened.
import { h, icon, store, toast, avatar } from './util.js';
import { sound } from './sound.js';
import * as panels from './panels.js';
import * as R from './rules.js';

const KEY = 'score';
const COLORS = ['#c2477a', '#2a8c9c', '#e07b24', '#5b6ee1', '#3f9b5a', '#9b59b6', '#c9a227', '#8a5a2b'];

// ---------- the sheet ----------

let sheet = null; // {players: [names], length, rounds: [{caller, results, won}]}
let m = null;

const load = () => {
  const x = store.json(KEY, null);
  return x && Array.isArray(x.players) && Array.isArray(x.rounds) ? x : null;
};
const save = () => store.setJSON(KEY, sheet);
const person = (name, k) => ({ name, emoji: name.trim()[0]?.toUpperCase() || '?', color: COLORS[k % COLORS.length] });

export function open() {
  sound.unlock();
  sound.play('click');
  sheet = load();
  m = panels.openModal({ id: 'ys-score', title: 'Scoreblad', cls: 'm-sheet m-score ys-score', body: [] });
  if (sheet) showSheet();
  else showSetup();
}

function showSetup(names = store.json('scoreNames', []) || []) {
  m.setTitle?.('Scoreblad');
  const list = names.length >= 2 ? [...names] : ['', '', ''];
  let length = 'bo10';
  const rows = h('div', { class: 'ys-names' });
  const draw = () => rows.replaceChildren(...list.map((name, k) => h('div', { class: 'ys-name-row' },
    h('input', { class: 'field', type: 'text', maxLength: 20, placeholder: `Speler ${k + 1}`, value: name, 'aria-label': `Naam van speler ${k + 1}`,
      oninput: e => { list[k] = e.target.value; } }),
    list.length > 2 ? h('button', { class: 'btn btn-ghost ys-x', type: 'button', 'aria-label': 'Weghalen', onclick: () => { list.splice(k, 1); draw(); } }, icon('close')) : null)));
  draw();
  m.body.replaceChildren(
    h('p', { class: 'sheet-note', text: 'Speel je Yasat met echte kaarten? Houd hier de stand bij: na elke ronde vul je in wie Yasat riep en wat iedereen in de hand had.' }),
    h('div', { class: 'lb-lbl', text: 'Spelers' }), rows,
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { if (list.length < 8) { list.push(''); draw(); } } }, icon('plus'), 'Speler erbij'),
    h('div', { class: 'opt-row' }, h('div', { class: 'opt-lbl' }, h('span', { text: 'Lengte' })),
      panels.segmented(Object.entries(R.LENGTHS), length, v => { length = v; }, 'Lengte')),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-go btn-big btn-block', type: 'button', onclick: () => {
      const players = list.map((x, k) => x.replace(/\s+/g, ' ').trim() || `Speler ${k + 1}`);
      if (players.length < 2) { toast('Met minstens twee spelers.', { kind: 'warn' }); return; }
      store.setJSON('scoreNames', players);
      sheet = { players, length, rounds: [] };
      save();
      sound.play('click');
      showSheet();
    } }, 'Begin')));
}

const totalsOf = () => (sheet.rounds.at(-1)?.results.map(r => r.total)) || sheet.players.map(() => 0);

function over() {
  const { w } = R.weighted(sheet.rounds, sheet.players.length);
  if (sheet.length === 'bo10') return sheet.rounds.length >= 10;
  if (sheet.length === 'first10') return Math.max(...w) >= 10;
  return false;
}

function showSheet() {
  const n = sheet.players.length;
  const totals = totalsOf();
  const { w, owner } = R.weighted(sheet.rounds, n);
  const order = sheet.players.map((name, i) => i).sort((a, b) => w[b] - w[a] || totals[a] - totals[b]);
  const done = over();
  const stand = h('div', { class: 'tp-sum-list' }, order.map((i, k) => h('div', { class: 'tp-sum-row' + (done && k === 0 ? ' won' : '') },
    avatar(person(sheet.players[i], i), 'sm'), h('span', { class: 'tp-sum-name', text: sheet.players[i] }),
    h('span', { class: 'tp-sum-gain', text: done && k === 0 ? '🏆' : i === owner ? 'reeks' : '' }),
    h('small', { class: 'ys-total', text: `${totals[i]}/100` }), h('b', { class: 'tp-sum-pts', text: String(w[i]) }))));
  const last = sheet.rounds.at(-1);
  const lastLine = last ? h('div', { class: 'ys-last' }, h('b', { text: `Ronde ${sheet.rounds.length}: ` }),
    ...last.results.flatMap((r, i) => r.events.length ? [h('span', { class: 'ys-last-who', text: sheet.players[i] }),
      h('span', { class: 'ys-evs' }, r.events.map(e => h('span', { class: 'ys-ev' + (R.eventGood(e) ? ' good' : R.eventWeight(e) < 0 ? ' bad' : ''), text: R.eventLabel(e) })))] : [])) : null;
  m.body.replaceChildren(...[
    h('p', { class: 'sheet-note', text: `${R.lengthText(sheet)}. Rechts de gewogen score, daarnaast het totaal.` }),
    done ? h('p', { class: 'ys-done', text: `Het spel is uit: ${sheet.players[order[0]]} wint met ${w[order[0]]} punten.` }) : null,
    stand, lastLine, history(),
    h('div', { class: 'btn-col' },
      done ? null : h('button', { class: 'btn btn-go btn-big', type: 'button', onclick: entry }, icon('plus'), 'Ronde invoeren'),
      sheet.rounds.length ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: undo }, icon('back'), 'Laatste ronde ongedaan maken') : null,
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: restart }, icon('shuffle'), 'Nieuw spel'))].filter(Boolean));
}

function history() {
  if (!sheet.rounds.length) return null;
  const head = h('tr', {}, h('th', { text: '#' }), sheet.players.map((name, i) => h('th', { title: name }, avatar(person(name, i), 'xs'))));
  const rows = sheet.rounds.map((r, k) => h('tr', {}, h('td', { class: 'tp-st-n', text: k + 1 }), r.results.map((x, i) =>
    h('td', { class: i === r.caller ? (r.won ? 'won' : 'out') : '', title: x.events.map(R.eventLabel).join(', ') },
      String(x.total), x.events.length ? h('small', { class: 'ys-cell-ev', text: x.events.map(R.eventShort).join(' ') }) : null))));
  return h('div', { class: 'tp-st-scroll' }, h('table', { class: 'tp-st-table' }, h('thead', {}, head), h('tbody', {}, rows)));
}

// The form of one round: who called, and every hand's points (aces as the
// player chooses them).
function entry() {
  sound.play('click');
  const n = sheet.players.length;
  let caller = -1;
  const pts = Array(n).fill(null);
  const fields = sheet.players.map((name, i) => {
    const el = h('input', { class: 'field ys-pts', type: 'text', inputMode: 'numeric', maxLength: 2, placeholder: 'punten', 'aria-label': `Punten van ${name}`,
      oninput: e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2); pts[i] = e.target.value === '' ? null : Number(e.target.value); } });
    return el;
  });
  const callers = panels.segmented(sheet.players.map((name, i) => [i, name]), -1, v => { caller = v; }, 'Wie riep Yasat?');
  const f = panels.openModal({ id: 'ys-entry', title: `Ronde ${sheet.rounds.length + 1}`, cls: 'm-sheet ys-entry', body: [
    h('div', { class: 'lb-lbl', text: 'Wie riep Yasat?' }), callers,
    h('div', { class: 'lb-lbl', text: 'Punten in de hand' }),
    h('p', { class: 'sheet-note', text: 'Een aas telt 1 of 11, zoals de speler kiest. Boer, vrouw en heer tellen 10.' }),
    h('div', { class: 'ys-entry-list' }, sheet.players.map((name, i) => h('label', { class: 'ys-entry-row' },
      avatar(person(name, i), 'sm'), h('span', { text: name }), fields[i]))),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-go btn-big btn-block', type: 'button', onclick: () => {
      if (caller < 0) { toast('Wie riep Yasat?', { kind: 'warn' }); return; }
      if (pts.some(p => p == null)) { toast('Vul bij iedereen de punten in.', { kind: 'warn' }); return; }
      if (pts[caller] > 7) { toast('Yasat mag alleen met 7 punten of minder.', { kind: 'warn' }); return; }
      const res = R.score(pts, caller, totalsOf());
      sheet.rounds.push({ caller, won: res.won, results: res.results });
      save();
      sound.play(res.won ? 'handWon' : 'handLost');
      f.close(true);
      showSheet();
    } }, 'Opslaan')),
  ] });
}

function undo() {
  sound.play('click');
  sheet.rounds.pop();
  save();
  showSheet();
}

function restart() {
  sound.play('click');
  panels.openModal({ id: 'ys-restart', title: 'Nieuw spel?', cls: 'm-info', body: [
    h('p', { text: 'De stand van dit spel gaat dan weg.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-go', type: 'button', onclick: () => { const names = sheet.players; sheet = null; store.del(KEY); panels.byId('ys-restart')?.close(true); showSetup(names); } }, 'Nieuw spel'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => panels.byId('ys-restart')?.close() }, 'Annuleren')),
  ] });
}
