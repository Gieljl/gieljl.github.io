// Yasat's helpers without the DOM (games/yasat/README.md#the-site): card
// values and discards as the server checks them, the events and their
// weights, the seats' places, and the texts of the rules.

// ---------- cards ----------

const ORD = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13 };
export const rankOf = code => code[0];
export const red = code => code[1] === 'H' || code[1] === 'D';
export const value = code => Math.min(10, ORD[code[0]] || 0);
export const points = cards => cards.reduce((n, c) => n + value(c), 0);
export const isAce = code => code[0] === 'A';

// The shape of a discard, '' when it is not a legal one (as package yasat).
export function classify(cards) {
  if (!cards.length || new Set(cards).size !== cards.length) return '';
  if (cards.length === 1) return 'single';
  if (cards.length <= 4 && cards.every(c => c[0] === cards[0][0])) return ['', '', 'pair', 'three', 'four'][cards.length];
  return isStraight(cards) ? 'straight' : '';
}

function consecutive(o) {
  for (let k = 1; k < o.length; k++) if (o[k] !== o[k - 1] + 1) return false;
  return true;
}

export function isStraight(cards) {
  if (cards.length < 3 || !cards.every(c => red(c) === red(cards[0]))) return false;
  const aces = cards.filter(isAce).length;
  const o = cards.filter(c => !isAce(c)).map(c => ORD[c[0]]).sort((a, b) => a - b);
  if (new Set(o).size !== o.length) return false;
  if (aces === 0) return consecutive(o);
  if (aces === 1) return consecutive([1, ...o]) || consecutive([...o, 14]);
  return false;
}

export const SHAPES = { single: 'één kaart', pair: 'een paar', three: 'drie gelijke', four: 'vier gelijke', straight: 'een straat' };

// Sorts a hand: by rank, then suit.
export const sortHand = hand => [...hand].sort((a, b) => ORD[a[0]] - ORD[b[0]] || a[1].localeCompare(b[1]));

// ---------- events ----------

export const EVENTS = {
  yasat: ['Yasat!', 1], own: ['Own', 3], owned: ['Owned', -2], 'multi-owned': ['Multi-owned', -1],
  kill: ['Kill', 2], 'double-kill': ['Double Kill', 5], 'multi-kill': ['Multi Kill', 8], 'mega-kill': ['Mega Kill', 11],
  'monster-kill': ['MONSTER KILL', 14], death: ['Death', -5], 'nullify-50': ['Nullify 50', 1], 'nullify-100': ['Nullify 100', 2],
  'enable-50': ['Enable 50', -1], 'enable-100': ['Enable 100', -1], lullify: ['Lullify', 2], 'enable-69': ['Enable 69', 0],
  'contra-own-50': ['Contra-own 50', 2], 'contra-own-100': ['Contra-own 100', 2],
};
export const LONGEST_STREAK = 2;

// Short codes for the cells of the score tables.
const SHORT = {
  yasat: 'Y!', own: 'Own', owned: 'Owned', 'multi-owned': 'M-own', kill: 'K', 'double-kill': '2K', 'multi-kill': '3K',
  'mega-kill': '4K', 'monster-kill': '5K', death: '†', 'nullify-50': 'N50', 'nullify-100': 'N100', 'enable-50': 'E50',
  'enable-100': 'E100', lullify: 'L', 'enable-69': 'E69', 'contra-own-50': 'C50', 'contra-own-100': 'C100',
};
export const eventShort = e => SHORT[e] || e;
export const eventLabel = e => EVENTS[e]?.[0] || e;
export const eventWeight = e => EVENTS[e]?.[1] ?? 0;
export const eventGood = e => eventWeight(e) > 0;

// ---------- scoring, as package yasat ----------

const PENALTY = 35;

// score is the round's results: hands[i] the points of seat i, caller the
// seat that called, before the totals before the round.
export function score(hands, caller, before) {
  const n = hands.length;
  const owners = hands.filter((p, i) => i !== caller && p < hands[caller]).length;
  const won = owners === 0;
  const res = hands.map((p, i) => {
    const r = { hand: p, added: p, total: 0, events: [] };
    if (i === caller && won) { r.added = 0; r.events.push('yasat'); }
    else if (i === caller) { r.added = PENALTY; r.events.push('owned'); if (owners > 1) r.events.push('multi-owned'); }
    else if (p < hands[caller]) { r.added = 0; r.events.push('own'); }
    return r;
  });
  const enable = e => { if (!res[caller].events.includes(e)) res[caller].events.push(e); };
  for (let i = 0; i < n; i++) {
    const r = res[i];
    const prev = before[i] || 0;
    const sum = prev + r.added;
    if (sum > 100) { r.total = 0; r.events.push('death'); }
    else if (prev === 69 && sum === 100) { r.total = 0; r.events.push('lullify'); enable('enable-69'); }
    else if (sum === 50 || sum === 100) {
      r.total = 0;
      if (i === caller && !won && r.added === PENALTY) {
        r.events.push(`contra-own-${sum}`);
        enable(`enable-${sum}`);
      } else {
        r.events.push(`nullify-${sum}`);
        if (i !== caller) enable(`enable-${sum}`);
      }
    } else r.total = sum;
  }
  const kills = res.filter((r, i) => i !== caller && r.events.includes('death')).length;
  if (kills && won) res[caller].events.push(['kill', 'double-kill', 'multi-kill', 'mega-kill', 'monster-kill'][Math.min(kills, 5) - 1]);
  return { won, results: res };
}

// weighted is everyone's weighted score after the rounds, and who holds the
// longest streak (-1: nobody).
export function weighted(rounds, n) {
  const w = Array(n).fill(0);
  const run = Array(n).fill(0);
  let best = 1;
  let owner = -1;
  for (const r of rounds) {
    for (let i = 0; i < n; i++) {
      const evs = r.results[i].events;
      run[i] = evs.includes('yasat') ? run[i] + 1 : 0;
      if (run[i] > best) { best = run[i]; owner = i; }
      for (const e of evs) w[i] += eventWeight(e);
    }
  }
  if (owner >= 0) w[owner] += LONGEST_STREAK;
  return { w, owner };
}

// ---------- seats ----------

// Where a seat sits on the felt, as an angle: you at the bottom, the others
// clockwise from your left.
export function seatAngle(s, seat) {
  const n = s.players.length;
  const k = (seat - s.you + n) % n;
  return k === 0 ? 270 : 210 - (k * 240) / n;
}

// A point on an ellipse around (cx, cy) with radii rx, ry, in percent.
export function onEllipse(angle, rx, ry, cx = 50, cy = 50) {
  const a = (angle * Math.PI) / 180;
  return { x: +(cx + rx * Math.cos(a)).toFixed(2), y: +(cy - ry * Math.sin(a)).toFixed(2) };
}

export const IN_HAND = new Set(['play', 'aces']);

export const nameOf = (s, seat) => (seat === s.you ? 'Jij' : s.players[seat]?.name || 'Speler');

// Everyone by weighted score, then by the lowest total.
export function standings(s) {
  return s.players.map((p, seat) => ({ seat, name: nameOf(s, seat), weighted: s.weighted?.[seat] ?? 0, total: s.totals?.[seat] ?? 0 }))
    .sort((a, b) => b.weighted - a.weighted || a.total - b.total);
}

export const LENGTHS = { bo10: '10 rondes', first10: 'Tot 10 punten', classic: 'Eindeloos' };

export function lengthText(o) {
  return { bo10: 'Tien rondes: de hoogste gewogen score wint', first10: 'Wie het eerst een gewogen score van 10 heeft, wint', classic: 'Eindeloos: stop wanneer je wilt' }[o.length] || '';
}

// ---------- the rules ----------

export function manual() {
  const ev = Object.entries(EVENTS);
  return [
    { id: 'regels', title: 'Spelregels', parts: [
      ['Het doel', ['Yasat is een variant op Yaniv, met een standaard spel van 52 kaarten. Elke ronde wil je zo weinig mogelijk punten in je hand hebben, en op het goede moment Yasat roepen: met 7 punten of minder, aan het begin van je beurt.',
        'Daarnaast is er het metaspel: wie de meeste gewogen punten verzamelt met acties als Own, Kill en Nullify, wint het spel.']],
      ['Waarde van de kaarten', ['Een aas telt 1 (of aan het eind van de ronde, als je wilt, 11). Boer, vrouw en heer tellen 10. De andere kaarten tellen hun getal.']],
      ['Een beurt', ['Gooi eerst weg, pak dan één kaart: van de dichte stapel, of één van de kaarten die je voorganger net weggooide (bovenop de aflegstapel).',
        'Weggooien mag: één kaart, een paar, drie of vier gelijke, of een straat van minstens drie kaarten van één kleur (rood of zwart) met opeenvolgende waarden. Een aas mag laag (A-2-3) of hoog (V-H-A).']],
      ['Het begin', ['Iedereen krijgt 4 kaarten, de bovenste kaart van de stapel gaat open op de aflegstapel. Wie als laatste met succes Yasat riep, deelt; de speler links van de gever begint.']],
      ['Yasat roepen', ['Heb je aan het begin van je beurt 7 punten of minder, dan mag je Yasat roepen. Iedereen laat zijn kaarten zien.',
        'Heeft niemand minder punten dan jij (gelijk telt voor jou), dan heb je gewonnen: je krijgt 0 punten erbij. De anderen krijgen hun punten erbij.',
        'Heeft iemand minder, dan ben je Owned: je krijgt 35 strafpunten, en wie minder had krijgt 0.']],
      ['50, 100 en dood', ['Kom je precies op 50 of 100, dan ga je terug naar 0 (Nullify). Ga je over de 100, dan ga je ook terug naar 0, maar dat is een Death.',
        'Aan het eind van een ronde kies je per aas of hij 1 of 11 telt: zo kun je precies op 50 of 100 uitkomen.']],
    ] },
    { id: 'meta', title: 'Metaspel', parts: [
      ['Gewogen score', ['Elke actie heeft een gewicht. De gewogen score is de som daarvan. De langste reeks Yasats achter elkaar (meer dan één) levert eenmalig +2 op voor wie die reeks het eerst haalde.']],
      ...ev.map(([, [label, w]]) => [`${label} (${w > 0 ? '+' : ''}${w})`, [eventInfo(label)]]),
    ] },
    { id: 'bediening', title: 'Bediening', parts: [
      ['Op je beurt', ['Tik op de kaarten die je wilt weggooien: ze gaan omhoog. Tik daarna op de dichte stapel, of op een kaart op de aflegstapel om die te pakken.',
        'Mag je Yasat roepen, dan staat de knop Yasat! onder de tafel.']],
      ['Aan het eind van een ronde', ['Heb je een aas, dan kies je of hij 1 of 11 telt. Daarna zie je de uitslag; tik op Volgende ronde om verder te gaan.']],
      ['Toetsen', ['1 tot en met 9 kiezen een kaart, D pakt van de dichte stapel, Y roept Yasat.']],
    ] },
  ];
}

function eventInfo(label) {
  return {
    'Yasat!': 'Je riep Yasat en had het minst (of evenveel).',
    Own: 'Iemand riep Yasat, maar jij had minder: je gaat naar 0.',
    Owned: 'Je riep Yasat, maar iemand had minder: 35 strafpunten.',
    'Multi-owned': 'Owned door meer dan één speler tegelijk.',
    Kill: 'Je riep Yasat en iemand ging daardoor over de 100.',
    'Double Kill': 'Twee spelers tegelijk over de 100.',
    'Multi Kill': 'Drie spelers tegelijk over de 100.',
    'Mega Kill': 'Vier spelers tegelijk over de 100.',
    'MONSTER KILL': 'Vijf spelers tegelijk over de 100.',
    Death: 'Je ging over de 100 en begint weer bij 0.',
    'Nullify 50': 'Je kwam precies op 50 en gaat naar 0.',
    'Nullify 100': 'Je kwam precies op 100 en gaat naar 0.',
    'Enable 50': 'Jouw Yasat bracht een ander precies op 50.',
    'Enable 100': 'Jouw Yasat bracht een ander precies op 100.',
    Lullify: 'Van precies 69 naar precies 100: terug naar 0.',
    'Enable 69': 'Jouw Yasat bezorgde een ander een Lullify.',
    'Contra-own 50': 'Owned, en de 35 strafpunten brachten je van 15 precies op 50.',
    'Contra-own 100': 'Owned, en de 35 strafpunten brachten je van 65 precies op 100.',
  }[label] || '';
}
