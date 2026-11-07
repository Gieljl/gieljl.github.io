// The table of Yasat (games/yasat/README.md#the-site): the seats around the
// felt (two to six), the draw pile and the discard pile in the middle, your
// cards, the call, the aces at the end of a round, and the overlays: the
// round's result, game over, the standings and the rules. The shell
// (main.js, home.js, panels.js) does the rest; game.js ties the two
// together. Pure parts: rules.js.
import { app, h, clear, icon, toast, avatar, fillAvatar, playerName, wait, anim, dur, vibrate } from './util.js';
import { createCard, createBack, cardName, cardShort } from './cards.js';
import { sound } from './sound.js';
import * as panels from './panels.js';
import * as R from './rules.js';

const E = {};
let built = false;
let seatEls = [];       // per seat: its parts
let pending = null;     // {at, key}: a decision sent, awaiting the server
let chosen = [];        // the cards picked to throw away, in the order picked
let eleven = new Set(); // the aces picked to count 11
let acesSent = 0;       // the round whose aces went out
let summaryFor = 0;     // the round whose result is up
const STUCK_MS = 4000;

export function init() {
  if (built) return;
  built = true;
  const root = document.getElementById('game');
  E.top = h('header', { class: 'topbar tp-top' },
    E.pill = h('button', { class: 'tp-pill', type: 'button', title: 'Stand: totalen en gewogen score', onclick: openStand },
      h('span', { class: 'tp-pill-lbl', text: 'Jij' }), E.mine = h('b', { class: 'tp-pill-n', text: '0' }), h('span', { class: 'tp-pill-lim', text: '/100' })),
    h('div', { class: 'potje', title: 'De hoeveelste ronde' },
      h('span', { class: 'potje-lbl', text: 'Ronde' }), h('span', { class: 'potje-n' }, E.round = h('b', { text: '1' }))),
    E.wTop = h('div', { class: 'tp-stake-top', title: 'Je gewogen score' },
      h('span', { class: 'tp-st-lbl', text: 'Score' }), E.wN = h('b', { text: '0' })),
    h('span', { class: 'spacer' }),
    ...panels.toolButtons(['chat', 'help', 'score', 'settings', 'sound', 'menu']));
  E.table = h('div', { class: 'tp-table' }, h('div', { class: 'tp-felt', 'aria-hidden': 'true' }));
  E.seats = h('div', { class: 'tp-seats' });
  E.deck = h('button', { class: 'ys-deck', type: 'button', 'aria-label': 'Dichte stapel', onclick: () => draw({ deck: true }) },
    createBack({ size: 'md' }), E.deckN = h('b', { class: 'ys-deck-n' }));
  E.pile = h('div', { class: 'ys-pile', role: 'group', 'aria-label': 'Aflegstapel' });
  E.mid = h('div', { class: 'ys-mid' }, E.deck, E.pile);
  E.fx = h('div', { class: 'tp-fx', 'aria-live': 'polite' });
  E.table.append(E.seats, E.mid, E.fx);
  E.me = h('div', { class: 'tp-me' }, E.meAv = h('span', { class: 'avatar' }),
    h('span', { class: 'tp-me-txt' }, E.meName = h('b'), E.mePts = h('span', { class: 'tp-pts' })));
  E.text = h('div', { class: 'tp-text', 'aria-live': 'polite' }, E.textMain = h('b'), E.textSub = h('small'));
  E.actions = h('div', { class: 'tp-actions' });
  E.ring = panels.countdownRing();
  E.ringBox = h('span', { class: 'tp-ring', hidden: true }, E.ring.el);
  E.vote = h('div', { class: 'tp-vote', hidden: true });
  E.prompt = h('div', { class: 'tp-prompt' }, E.me, E.text, E.ringBox, E.actions, E.vote);
  E.hand = h('div', { class: 'tp-hand ys-hand', role: 'group', 'aria-label': 'Jouw kaarten' });
  root.append(E.top, E.table, E.prompt, E.hand);
  document.addEventListener('keydown', onKey);
}

// ---------- render ----------

const stateKey = s => `${s.round}/${s.phase}/${s.turn}/${s.moves?.length}/${s.caller}/${s.aces?.[s.you]}`;
const myTurn = s => s.phase === 'play' && s.turn === s.you;

export function render(s) {
  if (!s) return;
  init();
  app.view = s;
  if (pending && (pending.key !== stateKey(s) || performance.now() - pending.at > STUCK_MS)) pending = null;
  if (!myTurn(s)) chosen = [];
  chosen = chosen.filter(c => s.hand.includes(c));
  E.table.dataset.players = s.players.length;
  renderTop(s);
  renderSeats(s);
  renderMid(s);
  renderPrompt(s);
  renderHand(s);
  syncOverlays(s);
}

export function renderCall() {}
export function settle() {}
export function welcomeBack() {}
export function relayout() {}

function renderTop(s) {
  E.mine.textContent = s.totals?.[s.you] ?? 0;
  E.round.textContent = s.round || 1;
  E.wN.textContent = s.weighted?.[s.you] ?? 0;
}

function seatParts() {
  const S = {};
  S.root = h('div', { class: 'tp-seat' },
    S.ring = h('span', { class: 'ring' }, S.av = h('span', { class: 'avatar' }),
      S.chip = h('span', { class: 'dealer-chip', title: 'Gever', text: 'G', hidden: true })),
    h('span', { class: 'tp-plate' }, S.name = h('span', { class: 'nm' }),
      S.pts = h('span', { class: 'tp-pts' }), S.status = h('span', { class: 'st', hidden: true })),
    S.backs = h('div', { class: 'tp-backs', 'aria-hidden': 'true' }),
    S.bubble = h('div', { class: 'bubble', hidden: true }));
  return S;
}

function renderSeats(s) {
  const n = s.players.length;
  if (seatEls.length !== n) {
    clear(E.seats);
    seatEls = [];
    for (let seat = 0; seat < n; seat++) {
      const S = seatParts();
      seatEls.push(S);
      E.seats.append(S.root);
    }
  }
  const open = s.hands && s.caller >= 0;
  for (let seat = 0; seat < n; seat++) {
    const S = seatEls[seat];
    const p = s.players[seat];
    const at = R.onEllipse(R.seatAngle(s, seat), 39, 42, 50, 55);
    S.root.hidden = seat === s.you;
    S.root.style.left = at.x + '%';
    S.root.style.top = at.y + '%';
    S.root.dataset.side = at.x < 35 ? 'l' : at.x > 65 ? 'r' : 'c';
    S.root.className = 'tp-seat' + (s.turn === seat && s.phase === 'play' ? ' turn' : '') + (p ? '' : ' empty') +
      (p?.bot ? ' bot' : '') + (s.caller === seat ? ' poor' : '') + (S.root.classList.contains('talking') ? ' talking' : '');
    fillAvatar(S.av, p);
    S.name.replaceChildren(playerName(p?.name || 'Vrij'));
    S.root.title = p ? `${p.name}: ${s.totals?.[seat] ?? 0} punten, gewogen ${s.weighted?.[seat] ?? 0}` : 'Lege plaats';
    S.pts.textContent = `${s.totals?.[seat] ?? 0}/100 · ${s.weighted?.[seat] ?? 0}`;
    const status = s.aces?.[seat] ? 'kiest azen' : seat === s.streak ? 'langste reeks' : '';
    S.status.hidden = !status;
    S.status.textContent = status;
    S.chip.hidden = s.dealer !== seat || s.phase === 'lobby';
    setBacks(S, R.IN_HAND.has(s.phase) ? p?.cards ?? 0 : 0, open ? s.hands[seat] : null);
  }
  fillAvatar(E.meAv, s.players[s.you]);
  E.meName.replaceChildren(playerName(s.players[s.you]?.name || 'Jij'));
  const hp = R.points(s.hand || []);
  E.mePts.textContent = R.IN_HAND.has(s.phase) ? `${hp} ${hp === 1 ? 'punt' : 'punten'} in je hand · totaal ${s.totals?.[s.you] ?? 0}`
    : `totaal ${s.totals?.[s.you] ?? 0} · gewogen ${s.weighted?.[s.you] ?? 0}`;
  E.me.classList.toggle('turn', myTurn(s));
}

function setBacks(S, n, open = null) {
  const key = open ? open.join() : String(n);
  if (S.backs.dataset.key === key) return;
  S.backs.dataset.key = key;
  S.backs.classList.toggle('open', !!open);
  S.backs.replaceChildren(...(open ? open.map(c => createCard(c, { size: 'sm' }))
    : Array.from({ length: n }, () => createBack({ size: 'sm' }))));
}

// The middle: the draw pile, and the ply on top of the discard pile. On
// your turn, once a legal discard is picked, both can be tapped.
function renderMid(s) {
  const live = s.phase === 'play' || s.phase === 'aces';
  E.mid.hidden = !live;
  const can = myTurn(s) && !pending && R.classify(chosen) !== '';
  E.deck.disabled = !can;
  E.deck.classList.toggle('legal', can);
  E.deckN.textContent = s.deck ?? '';
  E.deck.title = can ? 'Pak de bovenste kaart van de stapel' : `${s.deck ?? 0} kaarten in de stapel`;
  const key = (s.top || []).join() + (can ? '+' : '');
  if (E.pile.dataset.key === key) return;
  E.pile.dataset.key = key;
  E.pile.replaceChildren(...(s.top || []).map(code => {
    const c = createCard(code, { size: 'md' });
    c.classList.toggle('legal', can);
    if (can) {
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `Pak ${cardName(code)}`);
      c.addEventListener('click', e => { e.stopPropagation(); draw({ take: code }); });
    }
    return c;
  }));
}

function renderPrompt(s) {
  const vote = votePanel(s);
  E.vote.hidden = !vote;
  if (vote) E.vote.replaceChildren(...vote);
  let main = '';
  let sub = '';
  const acts = [];
  E.ringBox.hidden = true;
  if (s.phase === 'play' && s.turn === s.you) {
    const shape = R.classify(chosen);
    if (!chosen.length) {
      main = s.canCall ? 'Yasat roepen, of verder spelen?' : 'Kies wat je weggooit';
      sub = 'Eén kaart, een paar, drie of vier gelijke, of een straat in één kleur.';
    } else if (!shape) {
      main = 'Dat is geen geldige combinatie';
      sub = 'Een straat: minstens drie opeenvolgende kaarten van één kleur.';
    } else {
      main = 'Pak nu een kaart';
      sub = `Je gooit ${R.SHAPES[shape]} weg (${R.points(chosen)} punten). Tik op de stapel of op een kaart van de aflegstapel.`;
    }
    if (s.canCall) acts.push({ label: 'Yasat!', sub: `met ${R.points(s.hand)} ${R.points(s.hand) === 1 ? 'punt' : 'punten'}`, kind: 'toep', fn: callYasat });
    if (chosen.length) acts.push({ label: 'Wissen', kind: 'ghost', fn: () => { chosen = []; sound.play('click'); render(app.view); } });
  } else if (s.phase === 'play' && s.turn >= 0) {
    main = `${R.nameOf(s, s.turn)} is aan de beurt`;
    sub = s.canCall === false && R.points(s.hand || []) <= 7 ? 'Op je beurt mag je Yasat roepen.' : '';
  } else if (s.phase === 'play') {
    main = 'De kaarten worden gedeeld';
  } else if (s.phase === 'aces') {
    const caller = R.nameOf(s, s.caller);
    if (s.aces?.[s.you] && acesSent !== s.round) {
      main = 'Tel je azen als 1 of 11';
      const aces = (s.hand || []).filter(R.isAce);
      const hp = R.points(s.hand) + 10 * aces.filter(a => eleven.has(a)).length;
      const total = (s.totals?.[s.you] ?? 0) + hp;
      sub = `${caller} riep Yasat. Je hand telt ${hp}; als je erbij krijgt, kom je op ${total}${total === 50 || total === 100 ? ' (precies raak!)' : total > 100 ? ' (over de 100)' : ''}.`;
      for (const a of aces) {
        acts.push({ label: `${cardShort(a)} = ${eleven.has(a) ? 11 : 1}`, kind: 'ghost', fn: () => { eleven.has(a) ? eleven.delete(a) : eleven.add(a); sound.play('click'); render(app.view); } });
      }
      acts.push({ label: 'Klaar', kind: 'go', fn: sendAces });
    } else {
      main = `${caller} riep Yasat!`;
      sub = 'Wie een aas heeft, kiest of die 1 of 11 telt.';
    }
    if (s.acesEnd) { E.ringBox.hidden = false; E.ring.set(s.acesEnd); }
  } else if (s.phase === 'handEnd') {
    main = 'De ronde is uit.';
  } else if (s.phase === 'gameOver') {
    main = 'Het spel is uit.';
  }
  E.prompt.classList.toggle('mine', myTurn(s) || !!s.aces?.[s.you]);
  E.textMain.textContent = main;
  E.textSub.textContent = sub;
  E.textSub.hidden = !sub;
  E.actions.replaceChildren(...acts.map(a => h('button', {
    class: `btn tp-act tp-${a.kind}`, type: 'button', disabled: !!pending, onclick: a.fn,
  }, h('b', { text: a.label }), a.sub ? h('small', { text: a.sub }) : null)));
}

function send(m) {
  pending = { at: performance.now(), key: stateKey(app.view) };
  for (const b of E.actions.querySelectorAll('button')) b.disabled = true;
  app.send(m);
}

function callYasat() {
  const s = app.view;
  if (!s?.canCall || pending) return;
  sound.unlock();
  sound.play('knock');
  send({ t: 'yasat' });
}

function sendAces() {
  const s = app.view;
  if (!s?.aces?.[s.you]) return;
  sound.play('click');
  acesSent = s.round;
  app.send({ t: 'aces', eleven: [...eleven].filter(a => s.hand.includes(a)) });
  eleven = new Set();
  render(s);
}

function draw(from) {
  const s = app.view;
  if (!s || !myTurn(s) || pending) return;
  if (!R.classify(chosen)) {
    sound.play('error');
    toast(chosen.length ? 'Dat is geen geldige combinatie.' : 'Kies eerst wat je weggooit.', { kind: 'warn', ms: 2200 });
    return;
  }
  sound.unlock();
  sound.play('card');
  send({ t: 'move', discard: chosen, ...(from.deck ? { deck: true } : { take: from.take }) });
  render(s);
}

// ---------- your cards ----------

function renderHand(s) {
  const hand = R.IN_HAND.has(s.phase) ? R.sortHand(s.hand || []) : [];
  const mine = myTurn(s) && !pending;
  E.hand.replaceChildren(...hand.map(code => {
    const c = createCard(code, { size: 'lg' });
    const on = chosen.includes(code);
    c.classList.toggle('selected', on);
    c.classList.toggle('legal', mine);
    if (s.phase === 'aces' && R.isAce(code) && eleven.has(code)) c.classList.add('hint');
    c.tabIndex = mine ? 0 : -1;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-pressed', String(on));
    c.setAttribute('aria-label', cardName(code) + (on ? ' (weggooien)' : ''));
    c.addEventListener('click', e => { e.stopPropagation(); tap(code); });
    return c;
  }));
  E.hand.classList.toggle('mine', mine);
  E.hand.classList.toggle('many', hand.length > 5);
}

function tap(code) {
  const s = app.view;
  if (!s || !myTurn(s) || pending) return;
  if (chosen.includes(code)) chosen = chosen.filter(c => c !== code);
  else chosen = [...chosen, code];
  sound.play('click');
  vibrate(8);
  render(s);
}

function onKey(e) {
  const s = app.view;
  if (!s || document.body.dataset.screen !== 'game' || e.target.closest?.('input, textarea') || panels.isOpen()) return;
  const hand = R.sortHand(s.hand || []);
  const k = Number(e.key);
  if (k >= 1 && k <= hand.length && myTurn(s)) {
    e.preventDefault();
    tap(hand[k - 1]);
  } else if ((e.key === 'd' || e.key === 'D') && myTurn(s)) {
    e.preventDefault();
    draw({ deck: true });
  } else if ((e.key === 'y' || e.key === 'Y') && s.canCall) {
    e.preventDefault();
    callYasat();
  }
}

// ---------- the takeover question (not asked at a table in this page) ----------

function votePanel() { return null; }
export function staleVote() { return false; }

// ---------- overlays ----------

export function sync(s) {
  if (s) syncOverlays(s);
}

function syncOverlays(s) {
  if (s.phase === 'handEnd') showSummary(s);
  else if (summaryFor || app.ysSummary) {
    summaryFor = 0;
    app.ysSummary?.close(true);
    app.ysSummary = null;
  }
  if (s.phase === 'gameOver') showOver(s);
  else app.ysOver?.close(true);
  if (s.phase === 'lobby') app.ysStand?.close(true);
  app.ysStand?.refresh?.(s);
}

const chips = events => h('span', { class: 'ys-evs' }, (events || []).map(e =>
  h('span', { class: 'ys-ev' + (R.eventGood(e) ? ' good' : R.eventWeight(e) < 0 ? ' bad' : ''), text: R.eventLabel(e), title: `${R.eventWeight(e) > 0 ? '+' : ''}${R.eventWeight(e)}` })));

function headline(s, r) {
  const who = R.nameOf(s, r.caller);
  const mine = r.caller === s.you;
  if (r.won) return { title: mine ? 'Yasat! Jij wint de ronde' : `Yasat! ${who} wint de ronde`, sub: 'Niemand had minder punten.', cls: mine ? 'won' : '' };
  const owners = r.results.map((x, seat) => (x.events.includes('own') ? R.nameOf(s, seat) : '')).filter(Boolean);
  return { title: mine ? 'Owned! Iemand had minder' : `${who} is Owned`, sub: `${owners.join(' en ')} had minder punten: 35 strafpunten voor ${mine ? 'jou' : who}.`, cls: mine ? 'lost' : '' };
}

function showSummary(s) {
  const r = s.last;
  if (!r || summaryFor === r.round) { refreshReady(s); return; }
  summaryFor = r.round;
  const T = headline(s, r);
  const list = h('div', { class: 'tp-sum-list ys-sum' }, r.results.map((x, seat) =>
    h('div', { class: 'tp-sum-row ys-sum-row' + (seat === s.you ? ' me' : '') + (seat === r.caller ? ' won' : '') },
      avatar(s.players[seat], 'sm'),
      h('span', { class: 'ys-sum-who' }, playerName(R.nameOf(s, seat), { cls: 'tp-sum-name' }),
        h('span', { class: 'ys-sum-hand' }, (r.hands?.[seat] || []).map(c => createCard(c, { size: 'sm' }))), chips(x.events)),
      h('span', { class: 'ys-sum-nums' },
        h('small', { text: `hand ${x.hand}` }), h('span', { class: 'tp-sum-gain' + (x.added > 0 ? ' plus' : ''), text: `+${x.added}` }),
        h('b', { class: 'tp-sum-pts', text: String(x.total) })))));
  E.go = h('button', { class: 'btn btn-go btn-big', type: 'button', onclick: () => { sound.play('click'); app.send({ t: 'ready' }); E.go.disabled = true; } },
    (E.sumRing = panels.countdownRing()).el, h('span', { text: 'Volgende ronde' }));
  app.ysSummary = panels.openModal({
    id: 'ys-summary', cls: 'm-summary passive tp-summary ' + T.cls, closable: false, label: 'Uitslag van de ronde', body: [
      h('h2', { class: 'sum-title', text: T.title }), h('p', { class: 'sum-sub', text: T.sub }), list,
      h('p', { class: 'sheet-note', text: `Gewogen score: ${R.standings(s).map(x => `${x.name} ${x.weighted}`).join(' · ')}` }),
      h('div', { class: 'sheet-foot' }, E.go)],
  });
  sound.play(r.caller === s.you ? (r.won ? 'handWon' : 'handLost') : r.results[s.you]?.events.includes('own') ? 'handWon' : 'trick');
  refreshReady(s);
}

function refreshReady(s) {
  E.sumRing?.set(s.nextAt || 0);
  if (E.sumRing) E.sumRing.el.hidden = !s.nextAt; // 0: it waits for ready
  if (E.go && s.players[s.you]?.ready) E.go.disabled = true;
}

function standTable(s) {
  return h('div', { class: 'tp-sum-list' }, R.standings(s).map(x =>
    h('div', { class: 'tp-sum-row' + (x.seat === s.you ? ' me' : '') + (x.seat === s.winner ? ' won' : '') },
      avatar(s.players[x.seat], 'sm'), playerName(x.name, { cls: 'tp-sum-name' }),
      h('span', { class: 'tp-sum-gain', text: x.seat === s.winner ? '🏆' : x.seat === s.streak ? 'reeks' : '' }),
      h('small', { class: 'ys-total', text: `${x.total}/100` }),
      h('b', { class: 'tp-sum-pts', text: String(x.weighted) }))));
}

// Every round: each player's total after it, with its events.
function roundsTable(s) {
  if (!s.history?.length) return null;
  const n = s.players.length;
  const order = Array.from({ length: n }, (_, k) => (s.you + k) % n);
  const head = h('tr', {}, h('th', { text: '#' }), order.map(seat => h('th', { title: s.players[seat]?.name || '' }, avatar(s.players[seat], 'xs'))));
  const rows = s.history.map(r => h('tr', {}, h('td', { class: 'tp-st-n', text: r.round }), order.map(seat => {
    const x = r.results[seat];
    const evs = x.events.map(R.eventLabel).join(', ');
    return h('td', { class: (seat === r.caller ? (r.won ? 'won' : 'out') : ''), title: evs || '' },
      String(x.total), evs ? h('small', { class: 'ys-cell-ev', text: x.events.map(R.eventShort).join(' ') }) : null);
  })));
  const total = h('tr', { class: 'tp-st-total' }, h('td', { text: 'W' }), order.map(seat => h('td', { text: String(s.weighted?.[seat] ?? 0) })));
  return h('div', { class: 'tp-st-scroll' }, h('table', { class: 'tp-st-table' }, h('thead', {}, head), h('tbody', {}, rows, total)));
}

function showOver(s) {
  if (app.ysOver?.round === s.round) return;
  const won = s.winner === s.you;
  const title = s.winner < 0 ? 'Gelijkspel' : won ? 'Jij wint het spel!' : `${s.players[s.winner]?.name || 'Iemand'} wint het spel`;
  const btns = [
    h('button', { class: 'btn btn-go btn-big', type: 'button', onclick: () => { sound.play('click'); app.send({ t: 'rematch' }); } }, icon('shuffle'), 'Nog een keer'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { sound.play('click'); app.send({ t: 'lobby' }); } }, icon('users'), 'Spelers of regels wijzigen'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => app.leave() }, icon('leave'), 'Naar het begin'),
  ];
  const m = panels.openModal({
    id: 'ys-over', cls: 'm-over passive tp-over' + (won ? ' won' : ' lost'), closable: false, label: title, body: [
      h('h2', { class: 'over-title', text: title }),
      h('p', { class: 'over-sub', text: `Na ${s.history.length} ${s.history.length === 1 ? 'ronde' : 'rondes'}. De hoogste gewogen score wint; bij gelijkstand het laagste totaal.` }),
      standTable(s), roundsTable(s), h('div', { class: 'btn-col' }, btns)],
  });
  m.round = s.round;
  app.ysOver = m;
  sound.play(won ? 'win' : 'lose');
  if (won) panels.confetti(m.dlg);
}

export function openStand() {
  sound.unlock();
  sound.play('click');
  const m = panels.openModal({ id: 'ys-stand', title: 'Stand', cls: 'm-score tp-stand', body: [] });
  m.refresh = s => {
    if (!s) return;
    m.body.replaceChildren(...[
      h('p', { class: 'sheet-note', text: `${R.lengthText(s.opts || {})}. Rechts de gewogen score, daarnaast het totaal (over de 100 is dood).` }),
      standTable(s), roundsTable(s)].filter(Boolean));
  };
  m.refresh(app.view);
  app.ysStand = m;
}

let lastTab = 'regels';
export function openRules(tab) {
  sound.play('click');
  const tabsOf = R.manual();
  const content = h('div', { class: 'man-scroll tp-man', role: 'tabpanel' });
  const bar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Delen van de spelregels' });
  const btns = tabsOf.map(x => h('button', { class: 'tab', type: 'button', role: 'tab', id: `ys-tab-${x.id}`, dataset: { id: x.id }, onclick: () => show(x.id) }, x.title));
  bar.append(...btns);
  function show(id) {
    const t = tabsOf.find(x => x.id === id) || tabsOf[0];
    lastTab = t.id;
    for (const b of btns) {
      const on = b.dataset.id === t.id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    content.setAttribute('aria-labelledby', `ys-tab-${t.id}`);
    content.replaceChildren(...t.parts.flatMap(([title, ps]) => [h('h3', { text: title }), ...ps.map(p => h('p', { text: p }))]));
    const next = tabsOf[tabsOf.indexOf(t) + 1];
    if (next) content.append(h('div', { class: 'man-next' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => show(next.id) }, `Volgende: ${next.title}`, icon('forward'))));
    content.scrollTop = 0;
  }
  panels.openModal({ id: 'ys-rules', title: 'Spelregels Yasat', cls: 'm-manual tp-rules', body: [bar, content] });
  show(tab || lastTab);
}

// ---------- animation ----------

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function fly(code, from, to, { ms = 380, back = false, fade = false } = {}) {
  if (!dur(ms) || !from || !to) return;
  const a = rectOf(from);
  const b = rectOf(to);
  const c = back || !code ? createBack({ size: 'md' }) : createCard(code, { size: 'md' });
  c.classList.add('tp-flying');
  document.getElementById('fly').append(c);
  const cw = c.getBoundingClientRect();
  c.style.left = a.x - cw.width / 2 + 'px';
  c.style.top = a.y - cw.height / 2 + 'px';
  await anim(c, [
    { transform: 'translate(0, 0) scale(0.8)', opacity: 0.4 },
    { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(1)`, opacity: fade ? 0 : 1 },
  ], ms, { fill: 'forwards' });
  c.remove();
}

export function bubble(s, seat, text, kind = '', ms = 2400) {
  if (seat === s.you) { flash(text, kind); return; }
  const S = seatEls[seat];
  if (!S || !text) return;
  S.bubble.hidden = false;
  S.bubble.textContent = text;
  S.bubble.className = 'bubble ' + kind;
  S.root.classList.add('talking');
  clearTimeout(S.bubbleTimer);
  S.bubbleTimer = setTimeout(() => { S.bubble.hidden = true; S.root.classList.remove('talking'); }, Math.max(1200, dur(ms) || 1200));
}

async function flash(text, kind = '', ms = 1100) {
  const el = h('div', { class: 'tp-flash ' + kind, text });
  E.fx.append(el);
  await anim(el, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.3 }, { opacity: 1, transform: 'scale(1)', offset: 0.8 }, { opacity: 0, transform: 'scale(1)' }], ms);
  el.remove();
}

const seatEl = (s, seat) => (seat === s.you ? E.hand : seatEls[seat]?.ring || E.table);

export async function animate(ev, prev, next) {
  init();
  if (!ev || !prev) return;
  if (next.phase === 'lobby' || prev.phase === 'lobby' && ev.type !== 'deal') return;
  if (prev.players.length !== next.players.length || !seatEls.length) render(prev);
  switch (ev.type) {
    case 'deal': {
      sound.play('shuffle');
      acesSent = 0;
      eleven = new Set();
      render({ ...next, hand: [], top: [], players: next.players.map(p => p && { ...p, cards: 0 }) });
      const n = next.players.length;
      const flights = [];
      for (let k = 1; k <= n; k++) {
        const seat = (ev.seat + k) % n;
        flights.push(fly('', E.deck, seatEl(next, seat), { ms: 420, back: true, fade: seat === next.you }));
        sound.play('deal');
        await wait(70);
      }
      await Promise.all(flights);
      break;
    }
    case 'move': {
      const from = seatEl(prev, ev.seat);
      sound.play('card');
      if (ev.seat !== next.you) setBacks(seatEls[ev.seat], Math.max(0, (prev.players[ev.seat]?.cards ?? 1) - ev.discard.length));
      const took = ev.took ? E.pile.querySelector(`.card[data-card="${ev.took}"]`) : null;
      await Promise.all(ev.discard.map((c, k) => wait(k * 60).then(() => fly(c, from, E.pile, { ms: 320 }))));
      if (ev.reshuffled) { sound.play('shuffle'); flash('Nieuwe stapel', '', 900); }
      if (ev.took) {
        bubble(next, ev.seat, `Pakt ${cardShort(ev.took)}`, '', 1600);
        await fly(ev.took, took || E.pile, from, { ms: 320, fade: ev.seat === next.you });
      } else {
        await fly('', E.deck, from, { ms: 300, back: true, fade: ev.seat === next.you });
      }
      break;
    }
    case 'call':
      sound.play('trump');
      vibrate(30);
      bubble(next, ev.seat, 'Yasat!', 'toep');
      flash(`${ev.seat === next.you ? 'Jij roept' : `${R.nameOf(next, ev.seat)} roept`} Yasat!`, 'toep', 1500);
      await wait(900);
      break;
    case 'handEnd':
    case 'gameOver':
      render(next);
      break;
    default:
      break;
  }
}

export function onError() {
  pending = null;
  if (app.view) render(app.view);
}

export function resetRoom() {
  pending = null;
  chosen = [];
  eleven = new Set();
  summaryFor = 0;
  acesSent = 0;
  app.ysSummary?.close(true);
  app.ysOver?.close(true);
  app.ysStand?.close(true);
}

export function resync() {
  pending = null;
  if (app.view) render(app.view);
}
