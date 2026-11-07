// Shared helpers: app context, DOM building, icons, storage, preferences,
// toasts, motion timing, the on-screen keyboard, names, suits and avatars.
import { SUITS } from './cards.js';

// Mutable application context shared by all modules (filled by main.js).
export const app = {
  s: null,        // last rendered server state
  view: null,     // state the table shows: during an event's animation that is
                  // already the next one (the trump badge after a choice)
  code: '',       // room code we are in (or joining)
  ff: false,      // fast-forward: skip animations while the queue catches up
  backlog: false, // many updates are waiting: they are history, no turn cue
  hurry: false,   // a few updates are waiting: animate faster
  send: () => false,
  leave: () => {},
  call: null,     // call.js once loaded (main.js): the call with the others at the table
};

// ---------- DOM ----------

// h('button', {class:'btn', text:'Ok', onclick}, child, ...)
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'for') el.setAttribute(k, v === true ? 'true' : String(v));
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// Stroke icons on a 24×24 grid, built as SVG elements (CSP-safe).
const ICONS = {
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4.5V9H8', 'M12 8v4.2l3 1.8'],
  score: ['M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2z', 'M9 9h6', 'M9 13h6', 'M9 17h3'],
  chat: ['M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.3-4.4A8 8 0 1 1 20.5 11.5z'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2.9-1.2 1.7v.4', 'M12 17h.01'],
  settings: ['M4 7h8', 'M18 7h2', 'M15 4.5v5', 'M4 17h2', 'M12 17h8', 'M9 14.5v5'],
  soundOn: ['M11 5 6.5 9H3.5v6h3L11 19z', 'M15.5 9a4.5 4.5 0 0 1 0 6', 'M18.5 6a8.5 8.5 0 0 1 0 12'],
  soundOff: ['M11 5 6.5 9H3.5v6h3L11 19z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  menu: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7'],
  back: ['M15 18l-6-6 6-6'],
  forward: ['M9 18l6-6-6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 7.8h.01'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  send: ['M4 12 20 4l-4 16-4-7z', 'M12 13l8-9'],
  leave: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  bot: ['M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z', 'M12 4v4', 'M9 13h.01', 'M15 13h.01'],
  play: ['M8 5v14l11-7z'],
  shuffle: ['M4 17h3l9-10h4', 'M17 4l3 3-3 3', 'M4 7h3l2.5 2.8', 'M13.5 14.2 16 17h4', 'M17 14l3 3-3 3'],
  school: ['M2.5 9 12 4.5 21.5 9 12 13.5z', 'M6.5 11v5c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-5', 'M21.5 9v5.5'],
  book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z', 'M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'],
  users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14a6.5 6.5 0 0 1 3.5 6'],
  enter: ['M10 4h9v16h-9', 'M3 12h11', 'M10 8l4 4-4 4'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  hand: ['M8 12.5V5.8a1.6 1.6 0 0 1 3.2 0V11', 'M11.2 11V4.2a1.6 1.6 0 0 1 3.2 0V11', 'M14.4 11V5.6a1.6 1.6 0 0 1 3.2 0V12', 'M17.6 8.6a1.6 1.6 0 0 1 3.2 0V14a8 8 0 0 1-8 8h-1.3a7 7 0 0 1-5-2.1L3 16.2a1.7 1.7 0 0 1 2.4-2.4L8 16.2'],
  search: ['M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M15.5 15.5 20.5 20.5'],
  mic: ['M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  micOff: ['M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21', 'M4 4l16 16'],
  cam: ['M3.5 8A1.5 1.5 0 0 1 5 6.5h8.5A1.5 1.5 0 0 1 15 8v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16z', 'M15 10.5l5.5-3v9l-5.5-3'],
  camOff: ['M3.5 8A1.5 1.5 0 0 1 5 6.5h8.5A1.5 1.5 0 0 1 15 8v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16z', 'M15 10.5l5.5-3v9l-5.5-3', 'M3 3l18 18'],
  phone: ['M5.5 3.5H9l1.5 4.5-2.3 1.5a11.5 11.5 0 0 0 6.3 6.3l1.5-2.3 4.5 1.5v3.5a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 4 5.1a1.5 1.5 0 0 1 1.5-1.6z'],
  hangup: ['M2.5 14.2c5.3-4.9 13.7-4.9 19 0l-2 3-4-1.6v-2.4a12.5 12.5 0 0 0-7 0v2.4l-4 1.6z'],
  noLink: ['M12 4 21.5 20h-19z', 'M12 10v4.5', 'M12 17.3h.01'],
};

export function icon(name, cls = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// ---------- storage (all keys prefixed kj.) ----------

// Values that could not be written to localStorage (blocked or full) live
// on in memory for the life of the page, so the name and the seat tokens
// still survive a reconnect. They win over whatever localStorage holds.
const unsaved = new Map();

export const store = {
  get(key, def = null) {
    if (unsaved.has(key)) return unsaved.get(key);
    try { const v = localStorage.getItem('kj.' + key); return v == null ? def : v; } catch { return def; }
  },
  set(key, val) {
    const v = String(val);
    try {
      localStorage.setItem('kj.' + key, v);
      unsaved.delete(key);
    } catch {
      unsaved.set(key, v);
    }
  },
  del(key) {
    unsaved.delete(key);
    try { localStorage.removeItem('kj.' + key); } catch { /* storage unavailable */ }
  },
  json(key, def) {
    try { const v = JSON.parse(store.get(key, 'null')); return v ?? def; } catch { return def; }
  },
  setJSON(key, val) { store.set(key, JSON.stringify(val)); },
};

const coarse = matchMedia('(pointer: coarse)').matches;

// Per-device preferences (kj.prefs).
export const prefs = Object.assign(
  { fourColor: false, tap: coarse ? 'two' : 'one', reduced: false, tab: 'bediening' },
  store.json('prefs', {}),
);
export function savePrefs() { store.setJSON('prefs', prefs); }

// ---------- toasts ----------

let toastRoot;
export function toast(text, { sub = '', kind = '', ms = 2800 } = {}) {
  toastRoot ??= document.getElementById('toasts');
  if (!toastRoot) return;
  const same = [...toastRoot.children].find(t => t.dataset.text === text + '|' + sub);
  if (same) {
    clearTimeout(same.timer);
    same.timer = setTimeout(() => dismiss(same), ms);
    return;
  }
  const el = h('div', { class: 'toast' + (kind ? ' toast-' + kind : ''), role: 'status', dataset: { text: text + '|' + sub } },
    h('div', { class: 'toast-main' }, suitify(text)), sub ? h('div', { class: 'toast-sub' }, suitify(sub)) : null);
  toastRoot.append(el);
  while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  el.timer = setTimeout(() => dismiss(el), ms);
}

function dismiss(el) {
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

// ---------- motion ----------

export const EASE = 'cubic-bezier(.2,.8,.2,1)';
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');

// Multiplier for every animation: 0 skips, 0.35 for "minder animaties".
export function motion() {
  if (app.ff || document.hidden) return 0;
  return (prefs.reduced || reducedMQ.matches ? 0.35 : 1) * (app.hurry ? 0.55 : 1);
}
export const dur = ms => Math.round(ms * motion());
export function wait(ms) {
  const d = dur(ms);
  return d > 0 ? new Promise(r => setTimeout(r, d)) : Promise.resolve();
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs el.animate unless motion is off; always resolves.
export function anim(el, frames, ms, opts = {}) {
  const d = dur(ms);
  if (!d || !el.animate) return Promise.resolve();
  const a = el.animate(frames, { duration: d, easing: EASE, ...opts, delay: opts.delay ? dur(opts.delay) : 0 });
  return a.finished.catch(() => {});
}

// ---------- on-screen keyboard ----------

// index.html asks for interactive-widget=resizes-content, so an on-screen
// keyboard shrinks the layout viewport. A phone held upright then looks
// short and wide, and the rules for landscape phones would kick in: the
// banner beside the name field, the table in its landscape layout behind
// the chat drawer. While the keyboard is open, html.kb is set: the
// stylesheets gate their landscape rules on :where(html:not(.kb)) and hide
// the banner, and the focused field is scrolled into view. A phone really
// turned sideways keeps its landscape layout.
const touchMQ = matchMedia('(pointer: coarse)');
const shortLandscapeMQ = matchMedia('(orientation: landscape) and (max-height: 520px)');
const KB_MIN = 120;      // px: a keyboard takes at least this much height
const KB_CLOSE_MS = 900; // after a blur the keyboard slides away: keep the layout still
const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const kb = { on: false, blurAt: -Infinity, full: {}, subs: [] };

// A field the on-screen keyboard opens for.
export function textField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return !NOT_TEXT.has(el.type);
  return el.isContentEditable === true;
}

// Whether the keyboard counts as open: a text field has the focus (or
// just lost it, while the viewport has not grown back yet) on an upright
// touch screen, and the viewport is clearly shorter than without a field
// focused (full: that height; 0 when not measured yet).
export function keyboardOpen({ touch, upright, focused, full, height, wasOn, sinceBlur }) {
  if (!touch || !upright) return false;
  if (full && full - height < KB_MIN) return false;
  return focused || (wasOn && sinceBlur < KB_CLOSE_MS);
}

function screenUpright() {
  const type = screen.orientation?.type;
  if (type) return type.startsWith('portrait');
  if (typeof window.orientation === 'number') return window.orientation % 180 === 0;
  return screen.height >= screen.width;
}

// Unzoomed height of what is visible: the visual viewport also shrinks for
// the keyboard where the layout viewport does not (iOS).
const viewHeight = () => (window.visualViewport ? visualViewport.height * visualViewport.scale : innerHeight);

function syncKeyboard(e) {
  const upright = screenUpright();
  const key = upright ? 'portrait' : 'landscape';
  const field = document.activeElement;
  const focused = textField(field);
  const height = viewHeight();
  const on = keyboardOpen({
    touch: touchMQ.matches, upright, focused, full: kb.full[key] || 0, height,
    wasOn: kb.on, sinceBlur: performance.now() - kb.blurAt,
  });
  // The full height is taken on a resize with no field focused: a blur
  // alone does not close the keyboard yet.
  if (e?.type === 'resize' && !focused && !on) kb.full[key] = height;
  if (on !== kb.on) {
    kb.on = on;
    document.documentElement.classList.toggle('kb', on);
    for (const fn of kb.subs) fn(on);
  }
  if (on && focused && e?.type !== 'focusout') revealField(field);
}

// Keeps the focused field (and the button beside or below it) in view.
let revealFrame = 0;
function revealField(el) {
  cancelAnimationFrame(revealFrame);
  revealFrame = requestAnimationFrame(() => {
    if (document.activeElement !== el) return;
    const r = el.getBoundingClientRect();
    const top = window.visualViewport?.offsetTop ?? 0;
    const bottom = top + (window.visualViewport?.height ?? innerHeight);
    if (r.top < top + 8 || r.bottom > bottom - 8) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

// Starts watching for the keyboard (main.js, before the table listens to
// resizes). fn(open) hears every change.
export function watchKeyboard() {
  if (!Object.keys(kb.full).length && !textField(document.activeElement)) kb.full[screenUpright() ? 'portrait' : 'landscape'] = viewHeight();
  addEventListener('resize', syncKeyboard);
  window.visualViewport?.addEventListener('resize', syncKeyboard);
  screen.orientation?.addEventListener?.('change', syncKeyboard);
  touchMQ.addEventListener?.('change', syncKeyboard);
  document.addEventListener('focusin', syncKeyboard);
  document.addEventListener('focusout', e => {
    kb.blurAt = performance.now();
    setTimeout(() => syncKeyboard(e)); // the next field, if any, has the focus by then
    setTimeout(syncKeyboard, KB_CLOSE_MS + 20);
  });
}

export const onKeyboard = fn => kb.subs.push(fn);

// The short landscape layout of the stylesheets applies: a phone on its
// side, and not an upright one made short by its keyboard.
export const shortLandscape = () => shortLandscapeMQ.matches && !kb.on;

export function vibrate(ms) {
  // Before the first tap (e.g. a rejoin after a reload) Chrome blocks it and logs an error.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

// The version the home page shows: the commit the web image was built from
// (index.html's meta version, filled in by the Containerfile), shortened as
// git does, with -dirty kept; "dev" when it was not filled in.
export function versionText(v) {
  const m = /^([0-9a-f]{7})[0-9a-f]*(-dirty)?$/.exec(v || '');
  return m ? m[1] + (m[2] || '') : 'dev';
}

// The payment link behind "Support deze app" (index.html's meta support,
// filled in by the Containerfile from the deployment's SUPPORT_URL): an
// https URL, or '' when there is none and the home page shows no button.
export function supportURL(v) {
  return /^https:\/\/[^\s"'<>]+$/.test(v || '') ? v : '';
}

// ---------- game helpers ----------

// The number of seats at the table of state s: four without a state yet.
export const seatCount = s => s?.players?.length || 4;

// Dutch number words for counts at the table ("drie AI-spelers").
export const countWord = n => ['geen', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes'][n] ?? String(n);

// The name for whoever gave none: Snel spelen and Oefenen do not ask for
// one (nobody else sees it), and the server calls a nameless player so too.
export const DEFAULT_NAME = 'Speler';

// Where the site lives: "/" on a site of its own, "/new/" under another.
export const BASE = new URL('../', import.meta.url).pathname;

// Display name; "Jij" for yourself when `jij` is set.
export function nameOf(s, seat, jij = true) {
  if (seat == null || seat < 0) return '';
  if (jij && seat === s.you) return 'Jij';
  return s.players?.[seat]?.name || DEFAULT_NAME;
}

// A name for a tight spot: a long name shortens with an ellipsis, but the
// " (AI)" of a bot always stays readable ("Kees de Vi… (AI)"). The width
// limit goes on cls (see .pname in app.css); title gives the full name.
const AI_MARK = /^(.*?)( \(AI\))$/;
export function playerName(name, { cls = '', title = false } = {}) {
  const m = AI_MARK.exec(name || '');
  return h('span', { class: 'pname' + (cls ? ' ' + cls : ''), title: title ? name : null },
    h('span', { class: 'pname-base', text: m ? m[1] : name || '' }),
    m ? h('span', { class: 'pname-ai', text: m[2] }) : null);
}

export const suitSym = c => SUITS[c]?.symbol ?? '';
export const suitName = c => SUITS[c]?.name ?? '';
export const suitText = c => `${suitSym(c)} ${suitName(c)}`;
export const isRed = c => SUITS[c]?.color === 'red';

// Text with its suit symbols wrapped for colouring (built safely, no HTML).
const SUIT_OF = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S' };
export function suitify(text) {
  const frag = document.createDocumentFragment();
  for (const part of String(text).split(/([♣♦♥♠])/)) {
    if (!part) continue;
    const suit = SUIT_OF[part];
    frag.append(suit ? h('span', { class: 'ss' + (isRed(suit) ? ' red' : ''), dataset: { suit }, text: part }) : part);
  }
  return frag;
}

// First letter upper case: "harten is troef" → "Harten is troef".
export const cap = text => (text ? text[0].toUpperCase() + text.slice(1) : '');

// Avatar circle for a player: emoji for bots, initial for humans.
export function avatar(p, cls = '') {
  const el = h('span', { class: 'avatar ' + cls });
  fillAvatar(el, p);
  return el;
}
export function fillAvatar(el, p) {
  const face = p?.bot ? (p.emoji || '🤖') : (p?.name || '?').trim().charAt(0).toUpperCase() || '?';
  if (el.dataset.face !== face) {
    el.dataset.face = face;
    el.textContent = face;
  }
  el.classList.toggle('is-bot', !!p?.bot);
  el.style.setProperty('--persona', p?.bot && p.color ? p.color : '');
}

// Animated number count-up.
export function countUp(el, to, ms = 900) {
  const from = Number(el.dataset.n ?? el.textContent) || 0;
  el.dataset.n = to;
  const d = dur(ms);
  if (!d || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / d);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1 && el.dataset.n == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, readOnly: true, class: 'offscreen' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
