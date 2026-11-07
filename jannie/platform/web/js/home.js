// Home screen (name, quick play, new game, join), the join-link invite, and
// the lobby where seats and options are arranged: the same for every game.
// What differs per game comes from its game.js, given to init: the option
// rows and their defaults, Snel spelen's options and subtitle, extra tiles
// (klaverjas: Oefenen), the help button, the texts that name the game, the
// easter egg under the version, and how the lobby places its seats.
import { sound } from './sound.js';
import { app, h, clear, icon, store, toast, seatCount, avatar, playerName, countWord, copyText, DEFAULT_NAME, versionText, supportURL } from './util.js';
import * as panels from './panels.js';

const E = {};
let game = {}; // this site's game (game.js), from init
const rows = () => game.home?.options || [];
const defaults = () => game.home?.defaults || {};
const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
// The lobby's start button ignores taps this long after it first shows: a
// double tap on "Maak spel" lands on it and would start without friends.
const START_GUARD_MS = 800;
// The public source (AGPL-3.0-only): the commit under the footer links to
// it. A site running a modified version links to its own source instead.
const SOURCE_URL = 'https://github.com/gieljl/gieljl.github.io/tree/main/jannie';

// The game's option rows (game.home.options); a row that does not apply to
// the number of players (o.players) hides: in klaverjas troef with three
// (they bid), the rules with two (nobody has a partner). A row with multi
// shows toggles, their values from o.value(opts[key]). onChange hears every
// choice; more adds a line to a row's info, for this form only.
export function optionsForm(opts, onChange, keys = rows().map(o => o.key), more = {}) {
  const form = h('div', { class: 'opts' }, rows().filter(o => keys.includes(o.key)).map(o =>
    h('div', { class: 'opt-row', dataset: { key: o.key } },
      h('div', { class: 'opt-lbl' }, h('span', { text: o.label }), panels.infoBtn(o.label, more[o.key] ? [o.info, more[o.key]].flat() : o.info)),
      o.input ? seedField(opts[o.key], v => onChange(o.key, v))
      : o.multi
        ? panels.toggles(o.choices, o.value(opts[o.key]), v => onChange(o.key, v), o.label)
        : panels.segmented(o.choices, opts[o.key] ?? defaults()[o.key], v => {
          onChange(o.key, v);
          if (o.key === 'players') showRows(form, v);
        }, o.label))));
  showRows(form, opts.players ?? defaults().players);
  return form;
}

// The seed: digits only, at most nine; empty (null) is a new seed per match.
function seedField(value, fn) {
  return numberField(value, fn, { max: 999999999, placeholder: 'Willekeurig', label: 'Seed' });
}

// A whole number from 1 to max, or empty (null).
export function numberField(value, fn, { max, placeholder, label }) {
  const digits = String(max).length;
  const el = h('input', {
    type: 'text', inputMode: 'numeric', class: 'field seed-field', maxLength: digits, placeholder,
    value: value ? String(value) : '', autocomplete: 'off', enterKeyHint: 'done', 'aria-label': label,
  });
  el.addEventListener('change', () => {
    const n = Math.min(max, Number(el.value.replace(/\D/g, '').slice(0, digits)) || 0);
    el.value = n ? String(n) : '';
    fn(n || null);
  });
  return el;
}

function showRows(form, players) {
  for (const row of form.querySelectorAll('.opt-row')) {
    const o = rows().find(x => x.key === row.dataset.key);
    row.hidden = !!o?.players && !o.players.includes(players);
  }
}



// Shows the quick-play subtitle with "AI-spelers" kept whole: a narrow
// phone would break the line after "AI-".
function showQuickSub() {
  E.quickSub.replaceChildren(...game.home.quickSub().split(/(AI-spelers?)/).filter(Boolean)
    .map(part => (part.startsWith('AI-speler') ? h('span', { class: 'nobreak', text: part }) : part)));
}

// ---------- home ----------

export function init(g) {
  game = g;
  const root = document.getElementById('home');
  E.name = h('input', {
    id: 'name', class: 'field field-name', type: 'text', maxLength: 20, placeholder: 'Hoe heet je?', autocomplete: 'nickname',
    autocapitalize: 'words', spellcheck: false, enterKeyHint: 'done', value: store.get('name', ''), 'aria-label': 'Je naam',
  });
  E.name.addEventListener('change', saveName);
  E.name.addEventListener('input', () => E.name.classList.remove('ask'));
  E.name.addEventListener('blur', () => E.name.classList.remove('ask'));
  // Enter (the keyboard's go key) does what the name was asked for: join
  // the invite, or the code already typed; otherwise it just closes the
  // keyboard.
  E.name.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (document.body.classList.contains('busy')) return; // already joining
    if (!E.invite.hidden) {
      sound.unlock();
      if (currentName()) app.join(E.inviteCode);
    } else if (CODE_RE.test(E.code.value)) joinCode(E.code.value);
    else {
      saveName();
      E.name.blur();
    }
  });
  E.code = h('input', {
    class: 'field field-code', type: 'text', maxLength: 4, placeholder: 'CODE', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, enterKeyHint: 'go', 'aria-label': 'Spelcode van vier letters',
  });
  E.code.addEventListener('input', () => {
    const v = E.code.value.toUpperCase().replace(/[^A-Z]/g, '').replace(/[IO]/g, '').slice(0, 4);
    if (E.code.value !== v) E.code.value = v;
    if (v.length === 4) joinCode(v);
  });
  E.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinCode(E.code.value); });

  E.invite = h('div', { class: 'invite', hidden: true });
  E.main = h('div', { class: 'home-main' },
    h('button', { class: 'btn btn-hero', type: 'button', id: 'btn-quick', onclick: quick },
      h('span', { class: 'hero-ico', 'aria-hidden': 'true' }, icon('bolt')),
      h('span', { class: 'hero-txt' }, h('b', { text: 'Snel spelen' }), E.quickSub = h('small', { id: 'quick-sub' }))),
    h('div', { class: 'tiles' },
      h('button', { class: 'btn btn-tile', type: 'button', id: 'btn-new', onclick: openNewGame },
        icon('users'), h('b', { text: 'Nieuw spel' }), h('small', { text: 'Kies tegenstanders en regels' })),
      ...(game.home.tiles?.() || [])),
    h('button', { class: 'btn btn-link', type: 'button', id: 'btn-help', onclick: () => game.home.help.open() }, icon('book'), game.home.help.label));
  E.code.id = 'join-code';
  showQuickSub();
  E.card = h('div', { class: 'home-card' },
    h('label', { class: 'name-lbl', for: 'name', text: 'Je naam' }), E.name, E.invite, E.main);
  const support = supportURL(document.querySelector('meta[name="support"]')?.content);
  const version = versionText(document.querySelector('meta[name="version"]')?.content);
  root.querySelector('.home-inner').append(E.card,
    h('footer', { class: 'home-foot' },
      h('span', { text: game.home.footer }),
      h('div', { class: 'home-meta' },
        h('small', { class: 'home-ver' },
          h('span', { class: 'home-egg', text: 'Versie', 'aria-hidden': true, onclick: versionTap }), ' ',
          h('a', { class: 'home-src', href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer', title: 'Broncode', 'aria-label': `Versie ${version}, broncode`, text: version })),
        support ? h('button', { class: 'home-support', type: 'button', id: 'btn-support', onclick: () => openSupport(support) }, icon('hand'), 'Support deze app') : null)),
  );
  E.lobby = document.getElementById('lobby');
  buildLobby();
}

function saveName() {
  const v = E.name.value.replace(/\s+/g, ' ').trim().slice(0, 20);
  E.name.value = v;
  if (v) store.set('name', v);
  return v;
}

// The player's name, or '' after asking for it: for a game with friends,
// who will see it. The field takes the focus, with a word on why.
export function currentName() {
  const v = saveName();
  if (v) return v;
  E.name.focus();
  E.name.classList.add('ask');
  toast('Hoe heet je?', { sub: 'Vul je naam in, dan weten de anderen aan tafel wie je bent.' });
  return '';
}

// Snel spelen and Oefenen are with bots only: they never wait for a name.
// The one typed is used (and kept); without one the player is "Speler",
// which is not stored as their name.
export function soloName() {
  return saveName() || DEFAULT_NAME;
}

export function show() {
  E.invite.hidden = true;
  E.main.hidden = false;
  E.name.enterKeyHint = 'done';
  showQuickSub();
  E.name.value = store.get('name', '') || E.name.value;
  setBusy(false);
  if (!E.name.value && matchMedia('(pointer: fine)').matches) setTimeout(() => E.name.focus(), 50);
}

// Join link without a stored name: ask only for the name. The keyboard's
// go key joins as well (see init).
export function showInvite(code) {
  E.main.hidden = true;
  E.invite.hidden = false;
  E.inviteCode = code;
  E.name.enterKeyHint = 'go';
  E.invite.replaceChildren(
    h('p', { class: 'invite-txt' }, 'Je bent uitgenodigd voor spel ', h('b', { class: 'code-inline', text: code })),
    h('button', { class: 'btn btn-hero', type: 'button', onclick: () => { if (currentName()) app.join(code); } },
      h('span', { class: 'hero-ico', 'aria-hidden': 'true' }, icon('enter')),
      h('span', { class: 'hero-txt' }, h('b', { text: 'Meedoen' }), h('small', { text: 'Vul je naam in en schuif aan' }))),
    h('button', { class: 'btn btn-link', type: 'button', onclick: () => { history.replaceState(history.state, '', '/'); show(); } }, 'Liever zelf een spel beginnen'));
  setTimeout(() => E.name.focus(), 50);
}

// Puts a code in the join field without joining (the field joins on
// input): a refused join that may work later is one tap on Meedoen.
export function setCode(code) {
  E.code.value = CODE_RE.test(code) ? code : '';
}

export function setBusy(on) {
  document.body.classList.toggle('busy', on);
  for (const b of E.card.querySelectorAll('button')) b.disabled = on;
}

function quick() {
  sound.unlock();
  sound.play('click');
  app.create({ opts: game.home.quickOpts(), start: true, name: soloName() });
}

function joinCode(v) {
  const code = (v || '').toUpperCase();
  if (!CODE_RE.test(code)) {
    toast('Een spelcode heeft vier letters', { kind: 'warn' });
    return;
  }
  sound.unlock();
  if (!currentName()) return;
  E.code.blur();
  app.join(code);
}

function openNewGame() {
  sound.unlock();
  sound.play('click');
  const opts = { ...defaults(), ...store.json('opts', {}) };
  delete opts.open;
  const m = panels.openModal({
    id: 'new', title: 'Nieuw spel', cls: 'm-sheet m-new', body: [
      // A seed holds for this game only: a remembered one would deal the same cards forever.
      optionsForm(opts, (k, v) => { opts[k] = v; store.setJSON('opts', { ...opts, seed: undefined }); showQuickSub(); }),
      h('p', { class: 'sheet-note', text: 'Je speelt in deze browser tegen AI-spelers: lege plaatsen worden aangevuld met AI-spelers.' }),
      h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-go btn-big btn-block', type: 'button', id: 'btn-create', onclick: () => {
        m.close(true);
        app.create({ opts, start: false, name: soloName() });
      } }, 'Maak spel')),
    ],
  });
}

// ---------- support ----------

// A free contribution to whoever runs the site, through the deployment's
// own payment link (SUPPORT_URL in local.mk, see the Makefile). Without one
// there is no button: a fork does not show someone else's link, and the
// store apps, which may not point to a payment outside the store, are built
// without it.
function openSupport(url) {
  sound.unlock();
  sound.play('click');
  panels.openModal({
    id: 'support', title: 'Support deze app', cls: 'm-info',
    body: [
      h('p', { text: game.home.support }),
      h('p', { text: 'Je kiest zelf het bedrag en betaalt via je eigen bank.' }),
      h('a', { class: 'btn btn-go btn-block', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Bijdragen met iDEAL'),
    ],
  });
}

// ---------- easter egg ----------

// A game may hide something under the version (game.home.egg; klaverjas:
// the expert mode; docs/frontend.md#home): five quick taps on the word
// "Versie" open it (the commit beside it is a link).
const EGG_TAPS = 5;
const EGG_GAP_MS = 1500;
let taps = 0;
let tapAt = 0;

function versionTap() {
  const now = performance.now();
  taps = now - tapAt < EGG_GAP_MS ? taps + 1 : 1;
  tapAt = now;
  if (taps < EGG_TAPS) return;
  taps = 0;
  game.home.egg?.();
}

// ---------- lobby ----------

function buildLobby() {
  E.lbTitle = h('h1', { class: 'lb-title', text: 'Klaarzetten' });
  const bar = h('header', { class: 'lobby-bar' },
    h('button', { class: 'tb tb-back', type: 'button', title: 'Tafel verlaten', 'aria-label': 'Tafel verlaten', onclick: () => app.leave() }, icon('back')),
    E.lbTitle, h('span', { class: 'spacer' }),
    ...panels.toolButtons(['chat', 'help', 'settings', 'sound']));
  E.lbCode = h('div', { class: 'code-big', 'aria-label': 'Spelcode' });
  E.lbCodeCard = h('section', { class: 'lb-card lb-code', hidden: true }, // nobody can join a table in this page
    h('div', { class: 'lb-lbl', text: 'Spelcode' }), E.lbCode,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: copyLink }, icon('copy'), 'Kopieer link'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: shareLink }, icon('share'), 'Delen')),
    E.lbHint = h('p', { class: 'lb-hint' }));
  E.lbTable = h('div', { class: 'mini-table' }, h('div', { class: 'mini-felt' }));
  E.lbSeats = {};
  // The game puts its seat slots on the mini table (game.lobby.seats).
  E.lbSlots = game.lobby.seats(E.lbTable);
  E.lbCount = h('p', { class: 'lb-count' });
  E.lbCall = h('div', { class: 'call-dock lb-call', role: 'group', 'aria-label': 'Bellen', hidden: true });
  E.lbAv = [];
  E.lbOpts = h('section', { class: 'lb-card lb-opts' });
  E.lbFoot = h('div', { class: 'lobby-foot' });
  E.lobby.append(bar, h('div', { class: 'lobby-main' },
    h('div', { class: 'lb-col' }, E.lbCodeCard, h('section', { class: 'lb-card lb-seats' }, h('div', { class: 'lb-lbl', text: 'Aan tafel' }), E.lbTable, E.lbCount, E.lbCall)),
    h('div', { class: 'lb-col' }, E.lbOpts)), E.lbFoot);
}

const link = () => `${location.origin}/${app.code}`;

async function copyLink() {
  sound.play('click');
  if (await copyText(link())) {
    toast('Link gekopieerd', { sub: 'Plak hem in een appje naar je vrienden.' });
    return;
  }
  // The clipboard is off limits: show the link where it can be copied by hand.
  const field = h('input', { type: 'text', class: 'field link-field', readOnly: true, value: link(), 'aria-label': 'Link naar dit spel', onfocus: e => e.target.select() });
  panels.openModal({
    id: 'link', title: 'Kopieer de link', cls: 'm-info', body: [
      h('p', { text: 'Kopiëren lukte niet vanzelf. Selecteer de link en kopieer hem zelf, of geef de code door.' }),
      field,
    ],
  });
  setTimeout(() => { field.focus(); field.select(); }, 60);
}

async function shareLink() {
  sound.play('click');
  if (navigator.share) {
    try {
      await navigator.share({ title: game.name, text: game.home.shareText(app.code), url: link() });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  copyLink();
}

let lastOptsKey = '';
let lobbyCode = '';  // the room the lobby was last shown for
let lobbyAt = 0;     // when it first showed (performance.now)
let armTimer = 0;

// fresh: the room just came (back) to the lobby, so the start guard runs
// again, as for a new room.
export function renderLobby(s, fresh = false) {
  const host = s.host === s.you;
  const hostName = s.players[s.host]?.name || 'de host';
  if (s.code !== lobbyCode || fresh) {
    lobbyCode = s.code;
    lobbyAt = performance.now();
  }
  E.lbTitle.textContent = host ? 'Klaarzetten' : 'Even wachten';
  E.lbCode.replaceChildren(...[...s.code].map(ch => h('span', { text: ch })));
  const n = seatCount(s);
  E.lbTable.dataset.players = n;
  for (const el of E.lbSlots) el.hidden = true;
  E.lbAv = [];
  for (let seat = 0; seat < n; seat++) renderLobbySeat(s, seat, host);
  renderCall();
  const taken = s.players.filter(Boolean).length;
  const free = taken < n;
  const bots = s.players.some(p => p?.bot);
  const tip = host
    ? (free ? 'tik op een lege plaats voor een AI-speler' : bots ? 'tik op een AI-speler om te wisselen' : 'iedereen zit klaar')
    : (free ? 'tik op een lege plaats om daar te gaan zitten' : 'de tafel is vol');
  E.lbCount.textContent = `${taken} van de ${n} plaatsen bezet · ${tip}`;
  E.lbHint.textContent = codeHint(s, host, free, bots);

  const key = JSON.stringify([s.opts, host]);
  if (key !== lastOptsKey) {
    lastOptsKey = key;
    if (host) {
      // The next new game starts from what the room has: a change the
      // server refused (more people than seats) is not remembered.
      store.setJSON('opts', { ...store.json('opts', {}), ...game.home.remember(s.opts) });
      E.lbOpts.replaceChildren(h('div', { class: 'lb-lbl', text: 'Spelregels' }),
        optionsForm(s.opts, (k, v) => app.send({ t: 'opts', opts: { [k]: v } })));
    } else {
      E.lbOpts.replaceChildren(h('div', { class: 'lb-lbl', text: 'Spelregels' }),
        h('div', { class: 'chips' }, game.home.summary(s.opts).map(t => h('span', { class: 'chip', text: t }))),
        h('p', { class: 'lb-hint', text: `${hostName} bepaalt de spelregels.` }));
    }
  }
  const empty = s.players.filter(p => !p).length;
  const guard = Math.max(0, START_GUARD_MS - (performance.now() - lobbyAt));
  E.lbFoot.replaceChildren(host
    ? h('button', {
      class: 'btn btn-go btn-big btn-start', type: 'button', id: 'btn-start', disabled: guard > 0,
      onclick: e => {
        if (performance.now() - lobbyAt < START_GUARD_MS) return;
        e.currentTarget.disabled = true;
        sound.play('click');
        app.send({ t: 'start' });
      },
    }, icon('play'), h('span', {}, h('b', { text: 'Start spel' }), h('small', { text: empty ? `${empty === 1 ? 'De lege plaats krijgt' : 'Lege plaatsen krijgen'} een AI-speler` : 'Iedereen zit klaar' })))
    : h('div', { class: 'lb-wait' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), ` Wachten tot ${hostName} het spel start`));
  if (guard > 0) {
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      const b = document.getElementById('btn-start');
      if (b) b.disabled = false;
    }, guard + 20);
  }
}

// Under the code: who can still join. A friend who opens the link of a
// full table is turned away, so say so, and how the host makes room.
function codeHint(s, host, free, bots) {
  if (free) return 'Stuur de link of de code naar wie mee wil doen.';
  if (!host) return 'Alle plaatsen zijn bezet.';
  if (bots) return 'Alle plaatsen zijn bezet. Haal een AI-speler weg als er nog iemand mee wil doen.';
  if (seatCount(s) < game.maxPlayers) return 'Alle plaatsen zijn bezet. Zet Spelers hoger als er nog iemand mee wil doen.';
  return `Alle ${countWord(seatCount(s))} de plaatsen zijn bezet.`;
}

// A seat in the lobby. Where it sits, its classes, what it is to you and
// what a free one says come from the game (game.lobby.slot: klaverjas has
// partners, toepen only opponents).
function renderLobbySeat(s, seat, host) {
  const { el, cls, role: theirs, free } = game.lobby.slot(s, seat);
  const p = s.players[seat];
  const me = seat === s.you;
  el.hidden = false;
  el.className = `lseat ${cls}` + (p ? '' : ' empty') + (me ? ' me' : '') + (p?.bot ? ' bot' : '');
  const role = me ? 'jij' : theirs;
  const tag = [p && !p.bot && !p.connected ? 'weg' : role, seat === s.host ? 'host' : ''].filter(Boolean).join(' · ');
  const kids = [];
  if (p) {
    kids.push(h('button', {
      class: 'ls-main', type: 'button', disabled: !(host && p.bot),
      title: host && p.bot ? 'Tik om een andere AI-speler te kiezen' : p.name,
      onclick: host && p.bot ? () => panels.openBotPicker(seat, s) : null,
    }, E.lbAv[seat] = avatar(p), playerName(p.name, { cls: 'ls-name' }), h('span', { class: 'ls-tag', text: tag })));
    if (host && p.bot) kids.push(h('button', { class: 'ls-x', type: 'button', title: 'AI-speler weghalen', 'aria-label': `${p.name} weghalen`, onclick: () => { sound.play('click'); app.send({ t: 'unbot', seat }); } }, icon('close')));
  } else {
    kids.push(h('button', {
      class: 'ls-main', type: 'button',
      title: host ? 'AI-speler neerzetten of zelf hier gaan zitten' : 'Hier gaan zitten',
      onclick: () => { if (host) panels.openBotPicker(seat, s, { canSit: true }); else { sound.play('click'); app.send({ t: 'sit', seat }); } },
    }, h('span', { class: 'avatar empty-av' }, icon('plus')), h('span', { class: 'ls-name', text: host ? 'AI-speler' : 'Hier zitten' }), h('span', { class: 'ls-tag', text: free })));
  }
  el.replaceChildren(...kids);
}

// The call, once call.js is loaded: videos in place of the faces, who is
// in the call, and the call buttons under the table.
export function renderCall() {
  if (!app.call) return;
  app.call.dock(E.lbCall);
  E.lbAv.forEach((av, seat) => av && app.call.decorate(av, seat));
}

export function resetLobby() {
  lastOptsKey = '';
  clear(E.lbOpts);
}
