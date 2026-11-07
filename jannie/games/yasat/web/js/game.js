// Yasat under yasat.nl/new: what the shell (main.js, home.js, panels.js)
// needs from the game of this site (docs/frontend.md#the-game-module;
// games/yasat/README.md#the-site). No side effects when imported.
import { h, icon, store, countWord, cap, toast } from './util.js';
import * as table from './table.js';
import * as R from './rules.js';

export { table };
export const name = 'Yasat';
export const maxPlayers = 6;
export const PLAYING = new Set(['play']);
export const ACKED = new Set(['move', 'yasat']);

export const TOOLS = {
  help: ['help', 'Spelregels', 'Spelregels van Yasat en bediening', () => table.openRules()],
  score: ['score', 'Stand', 'Stand: totalen en gewogen score', () => table.openStand()],
};
export const menuTitle = 'Meer: stand, spelregels, instellingen';
export const menu = item => [
  item('score', 'Stand', table.openStand),
  item('help', 'Spelregels Yasat', table.openRules),
];
export const soundSub = 'Kaarten, Yasat en je beurt';
export const onError = () => table.onError();
export const sync = s => table.sync(s);

// ---------- home and lobby (home.js) ----------

const LEVELS = [['makkelijk', 'Makkelijk'], ['normaal', 'Normaal'], ['sterk', 'Sterk']];
const TEMPOS = [['rustig', 'Rustig'], ['normaal', 'Normaal'], ['snel', 'Snel']];
const DEFAULTS = { players: 4, length: 'bo10', ai: 'normaal', tempo: 'normaal' };

const OPTS = [
  { key: 'players', label: 'Spelers', choices: [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']],
    info: ['Met hoeveel spelers je speelt, jij meegerekend. De andere plaatsen krijgen AI-spelers.'] },
  { key: 'length', label: 'Lengte', choices: Object.entries(R.LENGTHS),
    info: ['10 rondes: na tien rondes wint de hoogste gewogen score.', 'Tot 10 punten: wie het eerst een gewogen score van 10 haalt, wint.',
      'Eindeloos: speel zolang je wilt; stop via het menu.'] },
  { key: 'ai', label: 'AI-sterkte', choices: LEVELS,
    info: ['Makkelijk: vergeet wat er is weggegooid, kijkt alleen naar losse kaarten en paren, en vergist zich vaak.',
      'Normaal: onthoudt het meeste en speelt met vuistregels.',
      'Sterk: de godlike-bot van Yasat. Vergist zich nooit en kijkt in alle kaarten, ook die van jou en de bovenste van de stapel.'] },
  { key: 'tempo', label: 'Tempo', choices: TEMPOS, info: 'Hoe snel de AI-spelers spelen.' },
  { key: 'seed', label: 'Seed', input: true, choices: [],
    info: ['Leeg: elke partij krijgt nieuwe kaarten.', 'Met een getal (1 tot 999999999) krijg je dezelfde kaarten, ook bij Nog een keer.'] },
];
const LABELS = Object.fromEntries(OPTS.map(o => [o.key, Object.fromEntries(o.choices)]));

function quickOpts() {
  const stored = store.json('opts', {});
  const o = {};
  for (const key of ['players', 'length', 'ai', 'tempo']) {
    if (stored?.[key] != null && LABELS[key][stored[key]] !== undefined) o[key] = stored[key];
  }
  return o;
}

function quickSub() {
  const o = { ...DEFAULTS, ...quickOpts() };
  const bots = o.players - 1;
  const parts = [];
  if (o.length !== DEFAULTS.length) parts.push(LABELS.length[o.length].toLowerCase());
  if (o.ai !== DEFAULTS.ai) parts.push(`AI ${LABELS.ai[o.ai].toLowerCase()}`);
  if (o.tempo !== DEFAULTS.tempo) parts.push(`tempo ${LABELS.tempo[o.tempo].toLowerCase()}`);
  const who = `${countWord(bots)} ${bots === 1 ? 'AI-speler' : 'AI-spelers'}`;
  return parts.length ? `${cap(who)} · ${parts.join(' · ')}` : `Meteen aan tafel met ${who}`;
}

function summary(o) {
  const out = [R.LENGTHS[o.length] || o.length, `AI ${LABELS.ai[o.ai]?.toLowerCase() || o.ai}`, `tempo ${LABELS.tempo[o.tempo]?.toLowerCase() || o.tempo}`];
  if (o.seed) out.push(`seed ${o.seed}`);
  return out;
}

const lobbySeats = [];
export const lobby = {
  seats(miniTable) {
    miniTable.classList.add('tp');
    for (let k = 0; k < maxPlayers; k++) miniTable.append(lobbySeats[k] = h('div', { class: 'lseat ls-tp' }));
    return lobbySeats;
  },
  slot(s, seat) {
    const el = lobbySeats[seat];
    const at = R.onEllipse(R.seatAngle(s, seat), 38, 36, 50, 50);
    el.style.left = `${at.x}%`;
    el.style.top = `${at.y}%`;
    return { el, cls: `ls-tp ${seat === s.you ? 'wij' : 'tp-opp'}`, role: 'tegenspeler', free: 'vrij' };
  },
};

// The score sheet (score.js, loaded on demand): a game at a real table.
function openScore() {
  import('./score.js').then(m => m.open()).catch(e => { console.error(e); toast('Dat lukte niet.', { kind: 'warn' }); });
}

export const home = {
  options: OPTS,
  defaults: DEFAULTS,
  quickOpts,
  quickSub,
  summary,
  remember: ({ players, length, ai, tempo }) => ({ players, length, ai, tempo }),
  help: { label: 'Spelregels en bediening', open: () => table.openRules() },
  tiles: () => [h('button', { class: 'btn btn-tile', type: 'button', id: 'btn-score', onclick: () => openScore() },
    icon('score'), h('b', { text: 'Scoreblad' }), h('small', { text: 'Aan een echte tafel' }))],
  route: params => { if (params.get('score') != null) openScore(); },
  footer: 'Yasat in je browser: geen account, geen server.',
  support: '',
  shareText: () => '',
};
