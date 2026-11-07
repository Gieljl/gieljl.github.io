// Overlays and side panels every game shares: the modal stack, the back
// button, settings, the bot picker, the menu, info popovers, feedback and
// chat. A game's own overlays (score sheet, summary, game over, rules) are
// in its own modules; useGame gives this module the game's tools, menu
// items and texts (its game.js).
import { sound } from './sound.js';
import { app, h, $$, icon, prefs, savePrefs, store, toast, dur, avatar, suitify, BASE } from './util.js';

let game = {}; // the game of this site (game.js), from useGame at boot
export function useGame(g) { game = g; }

const stack = [];
const fine = matchMedia('(pointer: fine)');
const touch = matchMedia('(pointer: coarse)');
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// ---------- modal stack ----------

export function openModal({ id = '', title = '', body = [], cls = '', closable = true, onClose = null, label = '' }) {
  if (id) byId(id)?.close(true);
  const back = document.activeElement;
  const m = { id, onClose };
  const head = title ? h('header', { class: 'dlg-head' },
    m.titleEl = h('h2', { text: title }),
    closable ? h('button', { class: 'icon-btn dlg-x', type: 'button', 'aria-label': 'Sluiten', title: 'Sluiten', onclick: () => m.close() }, icon('close')) : null) : null;
  m.body = h('div', { class: 'dlg-body' }, body);
  m.dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || label, tabIndex: -1 }, head, m.body);
  m.root = h('div', { class: 'modal ' + cls },
    h('div', { class: 'backdrop', onclick: closable ? () => m.close() : null }), m.dlg);
  m.closable = closable;
  m.close = (quiet = false) => {
    const i = stack.indexOf(m);
    if (i < 0) return;
    stack.splice(i, 1);
    m.root.classList.remove('open');
    setTimeout(() => { m.root.remove(); m.onRemove?.(); }, dur(240) + 10);
    if (!quiet) m.onClose?.();
    if (back?.isConnected && !stack.length) back.focus?.({ preventScroll: true });
    syncHistory();
  };
  document.getElementById('modals').append(m.root);
  stack.push(m);
  requestAnimationFrame(() => {
    if (!stack.includes(m)) return; // closed again within the frame
    m.root.classList.add('open');
    if (!m.root.classList.contains('passive')) m.dlg.focus({ preventScroll: true });
  });
  syncHistory();
  return m;
}

export const byId = id => stack.find(m => m.id === id);
const passive = m => m.root.classList.contains('passive');
export const isOpen = () => stack.some(m => !passive(m)) || chatOpen;
export function closeAll() {
  for (const m of [...stack]) m.close(true);
  setChat(false);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Tab') { trapFocus(e); return; }
  if (e.key !== 'Escape') return;
  const top = [...stack].reverse().find(m => m.closable);
  if (top) { top.close(); e.preventDefault(); return; }
  if (chatOpen) { setChat(false); e.preventDefault(); }
});

// Tab and Shift+Tab stay inside the top dialog; the table behind the
// backdrop is out of reach until it closes. Passive overlays (hand summary,
// game over) leave the chat beside them usable.
function trapFocus(e) {
  const top = [...stack].reverse().find(m => !passive(m));
  if (!top) return;
  const items = [...top.dlg.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.getClientRects().length);
  const ae = document.activeElement;
  if (!items.length) { e.preventDefault(); top.dlg.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (!top.dlg.contains(ae)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && (ae === first || ae === top.dlg)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && ae === last) { e.preventDefault(); first.focus(); }
}

// Focuses the main button of an overlay for keyboard users (not on touch
// screens: no focus ring there), unless they are busy elsewhere (typing in
// the chat beside it, another dialog).
export function focusMain(btn) {
  if (touch.matches) return;
  requestAnimationFrame(() => {
    if (btn.closest('.modal.open') && !btn.disabled && !isOpen() && focusFree()) btn.focus({ preventScroll: true });
  });
}

// Nothing has the focus, or only something on its way out (the button of
// the hand summary that is closing as the next overlay opens).
export function focusFree() {
  const ae = document.activeElement;
  return !ae || ae === document.body || !ae.isConnected || !!ae.closest('#modals .modal:not(.open)');
}

// ---------- back button ----------

// Every closable overlay (modal or chat drawer) and, while at a table, one
// sentinel entry get a history entry: the Android back gesture then closes
// the top overlay, and at the table asks before leaving, instead of leaving
// the page (or the installed app). history.state.kj is an entry's depth.
let depth = 0;      // our entries above the page's own
let expect = -1;    // depth a traversal we started will arrive at
let expectTimer = 0;
let syncTimer = 0;

const inRoom = () => document.body.classList.contains('in-room');
const overlays = () => stack.filter(m => m.closable).length + (chatOpen ? 1 : 0);
const wanted = () => (inRoom() ? 1 : 0) + overlays();

// Brings the history in line with what is open, once the current task is
// done (closing the menu and opening the score sheet is no change).
export function syncHistory() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(applyHistory, 0);
}

function applyHistory() {
  if (expect >= 0) return; // our own traversal is still under way
  const want = wanted();
  while (depth < want) history.pushState({ kj: ++depth }, '');
  if (depth > want) {
    expect = want;
    clearTimeout(expectTimer);
    expectTimer = setTimeout(() => { expect = -1; }, 1500); // the browser had nothing to go back to
    history.go(want - depth);
    depth = want;
  }
}

// The entries share the URL they were pushed with; keep it right for now.
function fixUrl() {
  const path = BASE; // the table is in this page only: its code is not in the URL
  if (location.pathname !== path) history.replaceState(history.state, '', path);
}

addEventListener('popstate', e => {
  const d = Number(e.state?.kj) || 0;
  if (expect >= 0 && d === expect) {
    expect = -1;
    clearTimeout(expectTimer);
  } else {
    // The user went back (or forward): close overlays from the top until
    // what is open fits; back past the sentinel at the table asks first.
    expect = -1;
    depth = d;
    while (wanted() > d && overlays()) closeTop();
    if (inRoom() && d === 0 && !overlays()) confirmLeave();
  }
  fixUrl();
  syncHistory();
});

function closeTop() {
  const top = [...stack].reverse().find(m => m.closable);
  if (top) top.close();
  else setChat(false);
}

history.replaceState({ kj: 0 }, '');

// Small explanation popover for ⓘ buttons.
export function info(title, text) {
  sound.play('click');
  openModal({ id: 'info', title, cls: 'm-info', body: [].concat(text).map(t => h('p', { text: t })) });
}

export function infoBtn(title, text) {
  return h('button', {
    class: 'info-btn', type: 'button', title: `Uitleg: ${title}`, 'aria-label': `Uitleg: ${title}`,
    onclick: e => { e.stopPropagation(); info(title, text); },
  }, icon('info'));
}

// ---------- tool buttons (top bars) ----------

// The shell's tools; a game adds its own (game.TOOLS: the same form, with
// an optional fifth element {hidden}) and names the menu's contents in its
// tooltip (game.menuTitle).
const TOOLS = {
  chat: ['chat', 'Chat', 'Chat met de tafel', () => toggleChat()],
  settings: ['settings', 'Instellingen', 'Instellingen: geluid, kaarten, animaties en je naam', () => openSettings()],
  sound: ['soundOn', 'Geluid', 'Geluid aan', () => toggleSound()], // a toggle: soundState sets icon, tooltip, aria-pressed
  menu: ['menu', 'Meer', 'Meer: instellingen', () => openMenu()],
};

export function toolButtons(names) {
  return names.map(n => {
    const [ic, label, tip, fn, opts] = game.TOOLS?.[n] || TOOLS[n];
    const title = n === 'menu' && game.menuTitle ? game.menuTitle : tip;
    const b = h('button', { class: 'tb tb-' + n, type: 'button', title, 'aria-label': label, onclick: () => { sound.unlock(); fn(); } }, icon(ic));
    if (n === 'chat') b.append(h('span', { class: 'chat-badge', hidden: true }));
    if (n === 'sound') soundState(b);
    if (opts?.hidden) b.hidden = true; // the game shows it when it applies
    return b;
  });
}

export function setLastEnabled(on) {
  for (const b of $$('.tb-last')) b.disabled = !on;
}

function toggleSound() {
  sound.setMuted(!sound.isMuted());
  if (!sound.isMuted()) sound.play('click');
  refreshSound();
  toast(sound.isMuted() ? 'Geluid uit' : 'Geluid aan', { ms: 1200 });
}

export function refreshSound() {
  for (const b of $$('.tb-sound')) soundState(b);
}

// The sound button is a toggle: pressed while the sound is on. Its icon and
// tooltip say which it is now ("Geluid aan", "Geluid uit"); the label
// stays "Geluid", so a screen reader says "Geluid, ingedrukt".
function soundState(b) {
  const on = !sound.isMuted();
  b.replaceChildren(icon(on ? 'soundOn' : 'soundOff'));
  b.classList.toggle('muted', !on);
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Geluid aan' : 'Geluid uit';
}

function openMenu() {
  const s = app.s;
  const item = (ic, text, fn, cls = '') => h('button', { class: 'menu-item ' + cls, type: 'button', onclick: () => { m.close(true); fn(); } }, icon(ic), h('span', { text }));
  const m = openModal({
    id: 'menu', cls: 'm-menu', label: 'Menu', body: [
      ...(game.menu?.(item) || []), // the game's own: score sheet, rules…
      item('settings', 'Instellingen', openSettings),
      item(sound.isMuted() ? 'soundOff' : 'soundOn', sound.isMuted() ? 'Geluid aanzetten' : 'Geluid uitzetten', toggleSound),
      app.call?.inCall() ? item('hangup', 'Ophangen', () => app.call.hangup())
        : app.call?.possible() && app.call.supported() ? item('phone', 'Bellen', () => app.call.openSheet()) : null,
      s ? item('leave', 'Spel verlaten', () => confirmLeave(), 'danger') : null,
    ],
  });
}

// Mid-game the seat stays empty until someone joins in it, or until the
// others agree that an AI takes it (docs/server.md#takeover-consent);
// alone with bots there is nobody to ask.
export function confirmLeave() {
  const s = app.s;
  const running = s && s.phase !== 'lobby' && s.phase !== 'gameOver';
  const others = s && s.players.some((p, seat) => p && !p.bot && !p.left && seat !== s.you);
  const m = openModal({
    id: 'leave', title: 'Spel verlaten?', cls: 'm-confirm', body: [
      h('p', { text: running && others ? 'De anderen beslissen samen of een AI-speler je plaats inneemt.' : 'Je verlaat de tafel.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Blijven'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { m.close(true); app.leave(); } }, 'Verlaten')),
    ],
  });
}

// ---------- settings ----------

export function toggleRow(label, sub, on, fn) {
  const input = h('input', { type: 'checkbox', checked: on, onchange: e => fn(e.target.checked) });
  return h('label', { class: 'set-row' }, h('span', { class: 'set-txt' }, h('b', { text: label }), sub ? h('small', { text: sub }) : null),
    h('span', { class: 'switch' }, input, h('i')));
}

export function segmented(choices, value, fn, name = '') {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name });
  const btns = choices.map(([v, label]) => h('button', {
    type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': String(v === value),
    onclick: () => { for (const b of btns) b.setAttribute('aria-checked', String(b === btn(v))); sound.play('click'); fn(v); },
  }, label));
  const btn = v => btns[choices.findIndex(c => c[0] === v)];
  wrap.append(...btns);
  return wrap;
}

// Toggle buttons for agreements that combine: values is an object of
// booleans by key; fn hears the whole object after every change.
export function toggles(choices, values, fn, name = '') {
  const now = { ...values };
  const wrap = h('div', { class: 'seg seg-multi', role: 'group', 'aria-label': name });
  wrap.append(...choices.map(([k, label]) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(!!now[k]),
    onclick: e => {
      now[k] = !now[k];
      e.currentTarget.setAttribute('aria-pressed', String(now[k]));
      sound.play('click');
      fn({ ...now });
    },
  }, label)));
  return wrap;
}

export function applyPrefs() {
  document.body.classList.toggle('four-color', !!prefs.fourColor);
  document.body.classList.toggle('reduced', !!prefs.reduced);
}

export function openSettings() {
  sound.play('click');
  const name = h('input', { type: 'text', class: 'field', maxLength: 20, value: store.get('name', ''), placeholder: 'Je naam', autocomplete: 'nickname', enterKeyHint: 'done' });
  name.addEventListener('change', () => {
    const v = name.value.trim().slice(0, 20);
    if (v) { store.set('name', v); toast('Naam opgeslagen', { sub: app.code ? 'Geldt vanaf je volgende spel.' : '' }); }
  });
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: sound.getVolume?.() ?? 0.6, class: 'range', 'aria-label': 'Volume' });
  vol.addEventListener('input', () => sound.setVolume(Number(vol.value)));
  vol.addEventListener('change', () => sound.play('card'));
  const body = [
    h('section', { class: 'set-group' },
      h('h3', { text: 'Geluid' }),
      toggleRow('Geluidseffecten', game.soundSub || 'Kaarten en je beurt', !sound.isMuted(), on => { sound.setMuted(!on); refreshSound(); if (on) sound.play('click'); }),
      h('div', { class: 'set-row' }, h('span', { class: 'set-txt' }, h('b', { text: 'Volume' })), vol)),
    h('section', { class: 'set-group' },
      h('h3', { text: 'Kaarten' }),
      toggleRow('Vierkleurenspel', 'Klaveren groen en ruiten blauw: makkelijker uit elkaar te houden', prefs.fourColor, on => { prefs.fourColor = on; savePrefs(); applyPrefs(); }),
      h('div', { class: 'set-row col' }, h('span', { class: 'set-txt' }, h('b', { text: 'Kaart spelen op een touchscreen' }),
        h('small', { text: 'Met een muis speel je altijd met één klik.' })),
      segmented([['one', 'Eén tik'], ['two', 'Twee tikken']], prefs.tap, v => { prefs.tap = v; savePrefs(); }, 'Kaart spelen')),
      h('p', { class: 'set-note', text: 'Twee tikken: eerste tik tilt de kaart op, tweede tik (of omhoog vegen) speelt hem.' })),
    h('section', { class: 'set-group' },
      h('h3', { text: 'Bellen' }),
      toggleRow('Bellen voorstellen', 'Bij een spel met andere spelers vragen of je meebelt, als je niet automatisch meebelt', store.json('call', {}).ask !== false,
        on => store.setJSON('call', { ...store.json('call', {}), ask: on })),
      toggleRow('Automatisch meebellen', 'Bij een spel met andere spelers zit je meteen in het gesprek', !!store.json('call', {}).auto,
        on => store.setJSON('call', { ...store.json('call', {}), auto: on }))),
    h('section', { class: 'set-group' },
      h('h3', { text: 'Weergave' }),
      toggleRow('Minder animaties', 'Kortere en rustigere bewegingen', prefs.reduced, on => { prefs.reduced = on; savePrefs(); applyPrefs(); })),
    h('section', { class: 'set-group' },
      h('h3', { text: 'Jij' }),
      h('label', { class: 'set-row col' }, h('span', { class: 'set-txt' }, h('b', { text: 'Naam' })), name)),
  ];
  if (app.code && app.s) {
    body.push(h('section', { class: 'set-group' },
      h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: () => { m.close(true); confirmLeave(); } }, icon('leave'), 'Spel verlaten')));
  }
  const m = openModal({ id: 'settings', title: 'Instellingen', cls: 'm-settings', body });
}

// ---------- bot picker (lobby) ----------

export function openBotPicker(seat, s, { canSit = false } = {}) {
  sound.play('click');
  const pick = id => { m.close(true); sound.play('join'); app.send({ t: 'bot', seat, id }); };
  const cur = s.players[seat];
  const items = [];
  if (canSit) items.push(h('button', { class: 'bot-item sit', type: 'button', onclick: () => { m.close(true); app.send({ t: 'sit', seat }); } },
    h('span', { class: 'avatar' }, icon('enter')), h('span', { class: 'bot-txt' }, h('b', { text: 'Zelf hier gaan zitten' }), h('small', { text: 'Verhuis naar deze plaats' }))));
  items.push(h('button', { class: 'bot-item random', type: 'button', onclick: () => pick('') },
    h('span', { class: 'avatar', text: '🎲' }), h('span', { class: 'bot-txt' }, h('b', { text: 'Willekeurig' }), h('small', { text: 'Verras me maar' }))));
  for (const p of s.roster || []) {
    const taken = s.players.some(x => x?.bot && x.botId === p.id);
    items.push(h('button', { class: 'bot-item', type: 'button', disabled: taken && cur?.botId !== p.id, onclick: () => pick(p.id) },
      avatar({ bot: true, emoji: p.emoji, color: p.color }),
      h('span', { class: 'bot-txt' }, h('b', { text: `${p.name} (AI)` }), h('small', { text: taken ? 'Zit al aan tafel' : p.bio }))));
  }
  const m = openModal({ id: 'bots', title: cur?.bot ? 'Andere AI-speler kiezen' : 'AI-speler kiezen', cls: 'm-bots', body: h('div', { class: 'bot-list' }, items) });
}

export function countdownRing() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('class', 'ring-cd');
  svg.setAttribute('aria-hidden', 'true');
  const C = 2 * Math.PI * 15;
  const bg = document.createElementNS(NS, 'circle');
  const fg = document.createElementNS(NS, 'circle');
  for (const c of [bg, fg]) { c.setAttribute('cx', 18); c.setAttribute('cy', 18); c.setAttribute('r', 15); }
  bg.setAttribute('class', 'ring-bg');
  fg.setAttribute('class', 'ring-fg');
  fg.setAttribute('stroke-dasharray', C.toFixed(2));
  svg.append(bg, fg);
  let at = 0;
  let a = null;
  return {
    el: svg,
    // 0 stops it, for a ring hidden or removed: unseen, its animation would
    // still keep the main thread drawing frames until it ends.
    set(nextAt) {
      if (nextAt === at) return;
      at = nextAt;
      const left = Math.max(0, Math.min(60000, nextAt - Date.now()));
      a?.cancel();
      fg.style.strokeDashoffset = '0';
      if (left > 0 && fg.animate) a = fg.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: C }], { duration: left, fill: 'forwards' });
    },
  };
}


// A free-text form that sends feedback (docs/protocol.md#client--server)
// with what extra() returns (the reasoning sheet: hand and trick of the
// player's own decision; else nothing, the game as a whole). Saved, the text
// stays, marked Bewaard., and Versturen waits for a change. onSaved(about,
// text), when given, hears of every "saved" with what extra() gave and the
// text sent, and returns false when the form shows something else by now
// (the expert's sheet, stepped to another decision). The form's value() and
// load({text, saved}) let the sheet keep a text per decision.
let feedbackWait = null; // the form waiting for its "saved"
export function feedbackForm(extra, label, placeholder = 'Wat viel je op? Wat klopt er volgens jou niet?', onSaved = null) {
  const text = h('textarea', { class: 'field fb-text', maxLength: 2000, rows: 3, placeholder, 'aria-label': label });
  const status = h('span', { class: 'fb-status', role: 'status' });
  let saved = false;
  let sending = false; // one feedback is out at a time: a second "saved" could not be told apart
  const mark = on => {
    saved = on;
    el.classList.toggle('saved', on);
    status.replaceChildren(...(on ? [icon('check'), 'Bewaard.'] : []));
    send.disabled = on || sending;
  };
  const send = h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      if (!text.value.trim()) { text.focus(); return; }
      sound.play('click');
      sending = true;
      mark(false);
      const about = extra();
      const sent = text.value;
      const w = feedbackWait = {
        // Text typed meanwhile is not what was saved.
        saved: () => { sending = false; mark(onSaved?.(about, sent) === false ? saved : text.value === sent); },
        failed: () => { sending = false; mark(saved); },
      };
      w.sent = app.send({ t: 'feedback', text: sent, ...about }); // false: queued until the connection is back
    },
  }, 'Versturen');
  text.addEventListener('input', () => { if (saved || status.textContent) mark(false); });
  const el = h('div', { class: 'fb' }, text, h('div', { class: 'fb-row' }, send, status));
  el.value = () => ({ text: text.value, saved });
  el.load = d => { text.value = d?.text || ''; mark(!!d?.saved); };
  return el;
}

// The server kept what was sent (feedback).
export function onSaved() {
  feedbackWait?.saved();
  feedbackWait = null;
}

// The server refused something: feedback can be sent again (the game
// frees what it waits for itself, game.onError).
export function onError() {
  feedbackWait?.failed();
  feedbackWait = null;
}

// The connection is back, the join just sent and what was queued while
// offline not yet: that goes out next, over this connection, and is
// answered. Feedback sent over the old connection may never have arrived,
// or its "saved" went there: the button works again. (What the game asked
// over the old connection, it asks again itself: game.onReconnect.)
export function onReconnect() {
  if (feedbackWait?.sent) {
    feedbackWait.failed();
    feedbackWait = null;
  } else if (feedbackWait) feedbackWait.sent = true;
}

// Confetti burst for a few seconds: small paper strips thrown up from the
// middle, each a compositor-only transform animation (no canvas, no timers
// per frame).
export function confetti(root) {
  const k = dur(1000) / 1000;
  if (!k) return;
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  root.prepend(layer);
  const W = root.clientWidth || innerWidth;
  const H = root.clientHeight || innerHeight;
  const colors = ['#f2c14e', '#2bb3a3', '#ef6f5a', '#ffffff', '#7bd389', '#e84a5f'];
  const n = Math.round((W < 600 ? 70 : 110) * Math.min(1, k + 0.3));
  const life = 3600 * Math.max(0.5, k);
  const steps = 8;
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const p = h('i', { class: 'cf' });
    p.style.background = colors[i % colors.length];
    const w = 6 + Math.random() * 6;
    p.style.width = w + 'px';
    p.style.height = w / 2 + 'px';
    layer.append(p);
    // A throw under gravity, sampled into keyframes.
    const x0 = W * (0.25 + Math.random() * 0.5);
    const y0 = H * (0.35 + Math.random() * 0.1);
    const vx = (Math.random() - 0.5) * W * 0.9;
    const vy = -(0.5 + Math.random() * 0.7) * H;
    const g = 2.2 * H;
    const spin = (Math.random() - 0.5) * 1440;
    const frames = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + vx * t * 0.8;
      const y = y0 + vy * t + 0.5 * g * t * t;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(spin * t).toFixed(1)}deg)`, opacity: t < 0.75 ? 1 : (1 - t) * 4 });
    }
    const a = p.animate(frames, { duration: life * (0.8 + Math.random() * 0.4), easing: 'linear', fill: 'forwards' });
    jobs.push(a.finished.catch(() => {}));
  }
  Promise.all(jobs).then(() => layer.remove());
}

// ---------- chat ----------

let chatOpen = false;
let unread = 0;
let log = [];          // messages shown, to re-render once seats are known
const C = {};
const QUICK = ['👍', '😂', '😱', '😭', 'Mooi!', 'Goed gespeeld!']; // a game may have its own (game.chatQuick)
const wideMQ = matchMedia('(min-width: 1200px)');

export function initChat() {
  C.list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chatberichten' });
  C.input = h('input', { type: 'text', class: 'field chat-input', maxLength: 200, placeholder: 'Zeg iets…', autocomplete: 'off', enterKeyHint: 'send', 'aria-label': 'Chatbericht' });
  const form = h('form', { class: 'chat-form', onsubmit: e => { e.preventDefault(); sendChat(C.input.value); } },
    C.input, h('button', { class: 'icon-btn chat-send', type: 'submit', 'aria-label': 'Versturen', title: 'Versturen' }, icon('send')));
  C.root = h('aside', { class: 'chat', id: 'chat', 'aria-label': 'Chat' },
    h('header', { class: 'chat-head' }, h('h2', { text: 'Chat' }),
      h('button', { class: 'icon-btn chat-x', type: 'button', 'aria-label': 'Chat sluiten', title: 'Sluiten', onclick: () => setChat(false) }, icon('close'))),
    C.list,
    h('div', { class: 'chat-quick' }, (game.chatQuick || QUICK).map(q => h('button', { class: 'quick', type: 'button', onclick: () => sendChat(q) }, q))),
    form);
  C.scrim = h('div', { class: 'chat-scrim', onclick: () => setChat(false) });
  document.getElementById('app').append(C.scrim, C.root);
  wideMQ.addEventListener('change', () => { if (chatVisible()) clearUnread(); });
}

function sendChat(text) {
  const t = text.trim().slice(0, 200);
  if (!t) return;
  if (!app.code) { toast('Je zit nog niet aan een tafel'); return; }
  app.send({ t: 'chat', text: t });
  C.input.value = '';
}

const chatVisible = () => chatOpen || (wideMQ.matches && document.body.classList.contains('in-room'));

export function toggleChat() { setChat(!chatOpen); }

export function setChat(open) {
  if (open && wideMQ.matches && document.body.classList.contains('in-room')) {
    C.input.focus();
    return;
  }
  chatOpen = open;
  document.body.classList.toggle('chat-open', open);
  if (open) {
    clearUnread();
    C.list.scrollTop = C.list.scrollHeight;
    if (fine.matches) setTimeout(() => C.input.focus(), 50);
  }
  syncHistory();
}

function clearUnread() {
  unread = 0;
  badge();
}

function badge() {
  for (const b of $$('.chat-badge')) {
    b.hidden = !unread;
    b.textContent = unread > 9 ? '9+' : unread;
  }
}

function msgEl(m) {
  const s = app.s;
  const sys = m.sys || m.seat < 0;
  const mine = s && m.seat === s.you && !sys;
  const team = s && !sys && m.seat >= 0 ? game.chatCls?.(s, m.seat) || '' : ''; // a side's colour, where the game has sides
  return h('div', { class: 'msg' + (sys ? ' sys' : '') + (mine ? ' mine' : '') + (m.bot ? ' bot' : '') + (m.coach ? ' coach-msg' : '') },
    sys ? null : h('span', { class: 'msg-name ' + team, text: m.name || 'Speler' }),
    h('span', { class: 'msg-text' }, suitify(m.text)));
}

export function chatAdd(m, live = true) {
  const atEnd = C.list.scrollHeight - C.list.scrollTop - C.list.clientHeight < 40;
  log.push(m);
  C.list.append(msgEl(m));
  while (C.list.children.length > 120) { C.list.firstChild.remove(); log.shift(); }
  if (atEnd || m.seat === app.s?.you) C.list.scrollTop = C.list.scrollHeight;
  if (!live) return;
  const mine = app.s && m.seat === app.s.you && !m.sys;
  if (!mine) {
    // Juf Jannie's explanations come with every trick in training: no sound.
    if (!m.sys && !m.coach) sound.play('chat');
    // The badge means a person wrote: system lines do not count, and bot
    // chatter already shows as a speech bubble at the table.
    if (!m.sys && !m.bot && m.seat >= 0 && !chatVisible()) { unread++; badge(); }
  }
}

export function chatSet(msgs) {
  log = [...(msgs || [])];
  C.list.replaceChildren(...log.map(msgEl));
  C.list.scrollTop = C.list.scrollHeight;
}

// Re-renders the log, e.g. once the first state tells who sits where.
export function chatRefresh() {
  chatSet(log);
}

export function chatReset() {
  log = [];
  C.list.replaceChildren();
  clearUnread();
  setChat(false);
}
