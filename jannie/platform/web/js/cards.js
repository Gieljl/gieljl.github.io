// Playing cards: faces and backs as inline SVG built through the DOM.
// Contract: docs/frontend.md#shared-modules; styles live in web/css/cards.css.
//
// Beyond the contract:
//   parseCard(code)       → {rank, suit}, or null for anything that is not a card code
//   suitIcon(suit, opts)  → <svg class="suit-icon"> for UI badges (trump indicator, buttons);
//                           inherits currentColor; opts.colored uses the deck inks (see cards.css)
//   createBack(opts)      → opts.color 'blue' (default) or 'red'
// Faces carry data-card, data-rank and data-suit; state classes are listed in cards.css.

export const SUITS = Object.freeze({
  C: Object.freeze({ name: 'klaveren', symbol: '♣', color: 'black' }),
  D: Object.freeze({ name: 'ruiten', symbol: '♦', color: 'red' }),
  H: Object.freeze({ name: 'harten', symbol: '♥', color: 'red' }),
  S: Object.freeze({ name: 'schoppen', symbol: '♠', color: 'black' }),
});

export const RANKS = Object.freeze({ 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'B', Q: 'V', K: 'H', A: 'A' });

const RANK_NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'boer', Q: 'vrouw', K: 'heer', A: 'aas' };

export function parseCard(code) {
  if (typeof code !== 'string' || code.length !== 2) return null;
  const rank = code[0];
  const suit = code[1];
  if (!Object.hasOwn(RANKS, rank) || !Object.hasOwn(SUITS, suit)) return null;
  return { rank, suit };
}

// "harten boer", "schoppen 10"; '' for anything that is not a card.
export function cardName(code) {
  const c = parseCard(code);
  return c ? `${SUITS[c.suit].name} ${RANK_NAMES[c.rank]}` : '';
}

// "♥B", "♠10"; '' for anything that is not a card.
export function cardShort(code) {
  const c = parseCard(code);
  return c ? SUITS[c.suit].symbol + RANKS[c.rank] : '';
}

const SIZES = new Set(['sm', 'md', 'lg']);

export function createCard(code, opts = {}) {
  const c = parseCard(code);
  if (!c) throw new RangeError(`createCard: invalid card code ${JSON.stringify(code)}`);
  let proto = faceCache.get(code);
  if (!proto) {
    proto = buildFace(c.rank, c.suit);
    faceCache.set(code, proto);
  }
  return sized(proto.cloneNode(true), opts.size);
}

export function createBack(opts = {}) {
  const color = opts.color === 'red' ? 'red' : 'blue';
  let proto = backCache.get(color);
  if (!proto) {
    proto = buildBack(color);
    backCache.set(color, proto);
  }
  return sized(proto.cloneNode(true), opts.size);
}

export function suitIcon(suit, opts = {}) {
  if (!Object.hasOwn(SUITS, suit)) throw new RangeError(`suitIcon: invalid suit ${JSON.stringify(suit)}`);
  const svg = node('svg', {
    class: opts.colored ? 'suit-icon suit-ink' : 'suit-icon',
    viewBox: '0 0 100 100',
    'data-suit': suit,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  node('path', { d: SUIT_PATHS[suit], fill: 'currentColor' }, svg);
  return svg;
}

const faceCache = new Map();
const backCache = new Map();

function sized(el, size) {
  el.classList.add(`card-${SIZES.has(size) ? size : 'md'}`);
  return el;
}

// ---- SVG primitives -------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// Rounds coordinates so the generated markup stays compact.
const r3 = (n) => Math.round(n * 1000) / 1000;

// Suit symbols drawn in a 100×100 box; every subpath winds clockwise so the
// club's lobes merge under the nonzero fill rule. Spade and club keep apart
// as small or distant blurs: the spade a needle point over low, wide lobes
// on a broad foot, the club three round lobes set wide, with deep notches,
// on a slim stem.
const SUIT_PATHS = {
  H: 'M50 92C44 84 31 73 20 61 9 49 4 40 4 29 4 15 15 5 28 5c9 0 17 5 22 14C55 10 63 5 72 5c13 0 24 10 24 24 0 11-5 20-16 32C69 73 56 84 50 92Z',
  D: 'M50 2C59 19 71 34 88 50 71 66 59 81 50 98 41 81 29 66 12 50 29 34 41 19 50 2Z',
  S: 'M50 1C52 16 60 28 74 38C89 48 98 57 98 69c0 11-9 19-20 19-8 0-14-4-18-9 1 8 5 14 12 19H28c7-5 11-11 12-19-4 5-10 9-18 9C11 88 2 80 2 69c0-12 9-21 24-31C40 28 48 16 50 1Z',
  C: 'M28 24a22 22 0 1 1 44 0a22 22 0 1 1-44 0Z' +
    'M1 57a22 22 0 1 1 44 0a22 22 0 1 1-44 0Z' +
    'M55 57a22 22 0 1 1 44 0a22 22 0 1 1-44 0Z' +
    'M50 30L70 58C60 60 54 62 53.5 70C53.5 80 58 90 67 98H33C42 90 46.5 80 46.5 70 46 62 40 60 30 58Z',
};

// Rank glyphs as stroked centre lines in a box 100 units high (stroke 15),
// condensed like classic card indices: identical on every platform and
// bolder than system fonts at tiny sizes. k scales the stroke per glyph.
// The boer's B is two closed loops with mitred joins: a straight stem with
// square corners, so even a tiny B never reads as the round-sided 8.
const GLYPHS = {
  2: { w: 46, d: 'M2 25C2 12 11 3 23 3S44 12 44 26C44 45 28 60 2 100H46' },
  3: { w: 44, d: 'M2 13C6 7 13 3 22 3 34 3 42 11 42 24S33 47 19 47C35 47 44 57 44 73S34 100 21 100C12 100 5 96 1 90' },
  4: { w: 48, d: 'M36 100V3L1 70H48' },
  5: { w: 46, d: 'M42 3H9L5 48C10 42 16 40 23 40 37 40 45 52 45 69S36 100 22 100C13 100 6 96 1 91' },
  6: { w: 46, d: 'M41 10C37 5 31 3 26 3 11 3 2 22 2 55 2 85 11 100 24 100S45 89 45 72 36 44 24 44 4 54 2 64' },
  7: { w: 48, d: 'M0 3H48C35 30 25 62 21 100' },
  8: { w: 46, d: 'M23 47C13 47 6 37 6 25S13 3 23 3 40 13 40 25 33 47 23 47ZM23 47C35 47 45 57 45 73.5S35 100 23 100 1 90 1 73.5 11 47 23 47Z' },
  9: { w: 46, d: 'M45 31C45 15 35 3 23 3S1 15 1 31 11 59 23 59 45 47 45 31ZM45 31V58C45 85 34 100 19 100 11 100 6 97 2.5 92' },
  T: { w: 63, k: 0.87, d: 'M0 19L12 4V100M46 3C35 3 29 22 29 51.5S35 100 46 100 63 81 63 51.5 57 3 46 3Z' },
  J: { w: 46, join: 'miter', d: 'M1 47.5V3H23C35 3 42 11 42 24S35 47.5 23 47.5ZM1 47.5H26C38 47.5 46 57 46 73S38 100 26 100H1Z' },
  Q: { w: 50, d: 'M0 3L25 100L50 3' },
  K: { w: 44, d: 'M0 3V100M44 3V100M0 51H44' },
  A: { w: 52, d: 'M0 100L26 3L52 100M10 67H42' },
};

function suitAt(parent, suit, cx, cy, size, flip, cls) {
  const s = size / 100;
  let t = `translate(${r3(cx - 50 * s)} ${r3(cy - 50 * s)}) scale(${r3(s)})`;
  if (flip) t = `rotate(180 ${cx} ${cy}) ${t}`;
  const attrs = { d: SUIT_PATHS[suit], transform: t, fill: 'currentColor' };
  if (cls) attrs.class = cls;
  return node('path', attrs, parent);
}

function rankAt(parent, rank, cx, top, height) {
  const g = GLYPHS[rank];
  const s = height / 100;
  return node('path', {
    d: g.d,
    transform: `translate(${r3(cx - (g.w * s) / 2)} ${r3(top)}) scale(${r3(s)})`,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': r3(15 * (g.k || 1)),
    'stroke-linecap': 'round',
    'stroke-linejoin': g.join || 'round',
  }, parent);
}

// ---- Faces ------------------------------------------------------------------

const W = 200;
const H = 280;
const MID = H / 2;

function buildFace(rank, suit) {
  const root = document.createElement('div');
  root.className = 'card';
  root.dataset.card = rank + suit;
  root.dataset.suit = suit;
  root.dataset.rank = rank;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', cardName(rank + suit));

  const svg = node('svg', {
    class: 'card-svg',
    viewBox: `0 0 ${W} ${H}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  root.appendChild(svg);

  if (rank === 'A') drawAce(svg, suit);
  else if (rank === 'J' || rank === 'Q' || rank === 'K') drawCourt(svg, rank, suit);
  else drawPips(svg, rank, suit);
  const idx = drawIndex(svg, rank, suit);
  const idx2 = idx.cloneNode(true);
  idx2.setAttribute('transform', `rotate(180 ${W / 2} ${MID})`);
  svg.appendChild(idx2);
  return root;
}

// Corner index: rank over suit, sized to stay readable when only the left
// ~30% of a regular card shows in a fan. The inner group is what cards.css
// scales up on narrow cards, about the corner, while the picture shrinks; a
// grown index can reach past that strip.
function drawIndex(parent, rank, suit) {
  const g = node('g', { class: 'card-index' }, parent);
  const inner = node('g', {}, g);
  rankAt(inner, rank, 28, 12, 54);
  suitAt(inner, suit, 28, 92, 34);
  return g;
}

const COL_L = 72;
const COL_C = 100;
const COL_R = 128;
const ROW = [52, 110.67, 169.33, 228];
const PIP_SIZE = 32;

const PIPS = {
  2: [[COL_C, ROW[0]], [COL_C, ROW[3], 1]],
  3: [[COL_C, ROW[0]], [COL_C, MID], [COL_C, ROW[3], 1]],
  4: [[COL_L, ROW[0]], [COL_R, ROW[0]], [COL_L, ROW[3], 1], [COL_R, ROW[3], 1]],
  5: [[COL_L, ROW[0]], [COL_R, ROW[0]], [COL_C, MID], [COL_L, ROW[3], 1], [COL_R, ROW[3], 1]],
  6: [[COL_L, ROW[0]], [COL_R, ROW[0]], [COL_L, MID], [COL_R, MID], [COL_L, ROW[3], 1], [COL_R, ROW[3], 1]],
  7: [[COL_L, 52], [COL_R, 52], [COL_C, 96], [COL_L, MID], [COL_R, MID], [COL_L, 228, 1], [COL_R, 228, 1]],
  8: [[COL_L, 52], [COL_R, 52], [COL_C, 96], [COL_L, MID], [COL_R, MID], [COL_C, 184, 1], [COL_L, 228, 1], [COL_R, 228, 1]],
  9: [[COL_L, ROW[0]], [COL_R, ROW[0]], [COL_L, ROW[1]], [COL_R, ROW[1]], [COL_C, MID],
    [COL_L, ROW[2], 1], [COL_R, ROW[2], 1], [COL_L, ROW[3], 1], [COL_R, ROW[3], 1]],
  T: [[COL_L, ROW[0]], [COL_R, ROW[0]], [COL_C, 81.33], [COL_L, ROW[1]], [COL_R, ROW[1]],
    [COL_L, ROW[2], 1], [COL_R, ROW[2], 1], [COL_C, 198.67, 1], [COL_L, ROW[3], 1], [COL_R, ROW[3], 1]],
};

function drawPips(parent, rank, suit) {
  const g = node('g', { class: 'card-pips' }, parent);
  for (const [x, y, flip] of PIPS[rank]) suitAt(g, suit, x, y, PIP_SIZE, flip);
}

// Fixed palette for illustrations; the suit ink itself comes from CSS (currentColor).
const GOLD = '#e2ad2f';
const GOLD_DARK = '#8f650f';
const LINE = '#2a1f17';
const SKIN = '#f6d7b9';
const PAPER = '#fffdf6';
const PARCHMENT = '#f8eedb';
const RUBY = '#c62a3d';
const SAPPHIRE = '#2f5fb3';

function drawAce(parent, suit) {
  const g = node('g', { class: 'card-ace' }, parent);
  const cx = W / 2;
  const cy = MID;
  node('circle', { cx, cy, r: 56, fill: PARCHMENT, stroke: GOLD, 'stroke-width': 2 }, g);
  node('circle', {
    cx, cy, r: 61.5, fill: 'none', stroke: GOLD_DARK, 'stroke-width': 2.2,
    'stroke-linecap': 'round', 'stroke-dasharray': `0 ${r3((Math.PI * 2 * 61.5) / 48)}`,
  }, g);
  for (const [dx, dy] of [[0, -56], [56, 0], [0, 56], [-56, 0]]) {
    const x = cx + dx;
    const y = cy + dy;
    node('path', {
      d: `M${x} ${y - 7}L${x + 4.5} ${y}L${x} ${y + 7}L${x - 4.5} ${y}Z`,
      fill: GOLD, stroke: GOLD_DARK, 'stroke-width': 1,
    }, g);
  }
  // An engraved inner line, built from fills so the club's overlapping
  // lobes show no internal arcs.
  suitAt(g, suit, cx, cy, 78);
  suitAt(g, suit, cx, cy, 63).setAttribute('fill', PAPER);
  suitAt(g, suit, cx, cy, 59);
}

// Court cards: a framed, double-headed portrait; the top half is drawn once
// and mirrored for the bottom half.
const FRAME = { x: 54, y: 12, w: 92, h: 256 };
const BADGE = { K: [68, 26], Q: [68, 26], J: [132, 74] };

function drawCourt(parent, rank, suit) {
  const g = node('g', { class: 'card-court' }, parent);
  const { x, y, w, h } = FRAME;
  node('rect', { x, y, width: w, height: h, rx: 6, fill: PARCHMENT }, g);

  const top = node('g', {}, g);
  if (rank === 'K') drawHeer(top);
  else if (rank === 'Q') drawVrouw(top);
  else drawBoer(top);
  const [bx, by] = BADGE[rank];
  suitAt(top, suit, bx, by, 20);

  const bottom = top.cloneNode(true);
  bottom.setAttribute('transform', `rotate(180 ${W / 2} ${MID})`);
  g.appendChild(bottom);

  node('path', { d: `M${x} ${MID}H${x + w}`, stroke: GOLD_DARK, 'stroke-width': 1.2 }, g);
  node('rect', {
    x: x + 3.5, y: y + 3.5, width: w - 7, height: h - 7, rx: 3.5,
    fill: 'none', stroke: GOLD, 'stroke-width': 1.3,
  }, g);
  node('rect', {
    x, y, width: w, height: h, rx: 6,
    fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2,
  }, g);
}

function p(parent, d, fill, stroke, sw, extra) {
  const attrs = { d, fill: fill || 'none' };
  if (stroke) {
    attrs.stroke = stroke;
    attrs['stroke-width'] = sw;
    attrs['stroke-linejoin'] = 'round';
    attrs['stroke-linecap'] = 'round';
  }
  return node('path', Object.assign(attrs, extra), parent);
}

function dot(parent, cx, cy, r, fill, extra) {
  return node('circle', Object.assign({ cx, cy, r, fill }, extra), parent);
}

// A garment that cards.css may colour by suit (.court-accent); its own fill
// is the colour it keeps otherwise.
const ACCENT = { class: 'court-accent' };

// Broad-shouldered torso shared by all three figures; it meets its mirror
// image at the centre line as one continuous garment.
const TORSO = 'M57 140V127C57 113 64 105 76 102L90 97H110L124 102C136 105 143 113 143 127V140Z';

function head(parent, rx = 15) {
  node('ellipse', { cx: 100, cy: 64, rx, ry: 18, fill: SKIN, stroke: LINE, 'stroke-width': 1.2 }, parent);
  dot(parent, 94.4, 63, 1.7, LINE);
  dot(parent, 105.6, 63, 1.7, LINE);
  p(parent, 'M91 58.6Q94.4 56.4 97.6 58.2M102.4 58.2Q105.6 56.4 109 58.6', null, LINE, 1.1);
  p(parent, 'M100.5 64Q98.3 70 100.8 71.4', null, LINE, 1);
}

function neck(parent) {
  p(parent, 'M93 76V100H107V76Z', SKIN, LINE, 1.2);
}

function drawHeer(g) {
  const hair = '#ebe6dc';
  // robe, tunic, gold placket, ermine cape and chain
  p(g, TORSO, 'currentColor', LINE, 1.2);
  p(g, 'M80 108L76 140H124L120 108Z', 'currentColor', LINE, 1.1, ACCENT);
  p(g, 'M93.5 112H106.5V140H93.5Z', GOLD, GOLD_DARK, 0.9);
  for (const y of [118, 126, 134]) p(g, `M100 ${y - 3}L103 ${y}L100 ${y + 3}L97 ${y}Z`, RUBY);
  p(g, 'M57 124C58 110 67 102 80 99L91 96L100 108L109 96L120 99C133 102 142 110 143 124C131 117 116 117 100 125C84 117 69 117 57 124Z', PAPER, LINE, 1.1);
  for (const [x, y] of [[66, 113], [77, 106], [88, 102], [112, 102], [123, 106], [134, 113]]) {
    p(g, `M${x} ${y - 2.8}L${x + 1.8} ${y + 2.3}L${x} ${y + 1.3}L${x - 1.8} ${y + 2.3}Z`, LINE);
  }
  p(g, 'M79 121Q100 139 121 121', null, GOLD_DARK, 2.8);
  p(g, 'M79 121Q100 139 121 121', null, GOLD, 1.5);
  dot(g, 100, 130.5, 4.4, GOLD, { stroke: GOLD_DARK, 'stroke-width': 1 });
  dot(g, 100, 130.5, 1.7, RUBY);
  // sceptre
  p(g, 'M135 140V57', null, GOLD_DARK, 5);
  p(g, 'M135 140V57', null, GOLD, 2.6);
  dot(g, 135, 51, 6, GOLD, { stroke: GOLD_DARK, 'stroke-width': 1.1 });
  p(g, 'M135 36.5V44.5M131.5 40.5H138.5', null, GOLD_DARK, 2);
  // hair, head, beard
  p(g, 'M83 50C79 64 80 80 86 90H114C120 80 121 64 117 50Z', hair, LINE, 1.1);
  neck(g);
  head(g);
  p(g, 'M85 63C85 84 92 97 100 97S115 84 115 63C112 72 107 76 100 76S88 72 85 63Z', hair, LINE, 1.1);
  p(g, 'M91.5 73.6Q96.4 69.8 100 72.2Q103.6 69.8 108.5 73.6Q103.6 75 100 74.2Q96.4 75 91.5 73.6Z', hair, LINE, 0.9);
  // crown
  p(g, 'M83 51L80 25L90.5 36L100 19L109.5 36L120 25L117 51Z', GOLD, GOLD_DARK, 1.2);
  p(g, 'M82.5 44H117.5V52H82.5Z', GOLD, GOLD_DARK, 1.1);
  dot(g, 100, 48, 2.7, RUBY, { stroke: GOLD_DARK, 'stroke-width': 0.7 });
  dot(g, 90.5, 48, 2, SAPPHIRE, { stroke: GOLD_DARK, 'stroke-width': 0.6 });
  dot(g, 109.5, 48, 2, SAPPHIRE, { stroke: GOLD_DARK, 'stroke-width': 0.6 });
  for (const [x, y] of [[80, 25], [100, 19], [120, 25]]) {
    dot(g, x, y, 2.6, PAPER, { stroke: GOLD_DARK, 'stroke-width': 0.8 });
  }
}

function drawVrouw(g) {
  const hair = '#a8642a';
  // long hair behind the shoulders
  p(g, 'M81 56C77 78 76 100 69 118C83 115 90 107 92 99H108C110 107 117 115 131 118C124 100 123 78 119 56C117 39 83 39 81 56Z', hair, LINE, 1.1);
  // gown with laced bodice and a gold neckline
  p(g, 'M57 140V127C57 113 64 105 76 102L86 99C90 106 95 109 100 109S110 106 114 99L124 102C136 105 143 113 143 127V140Z', 'currentColor', LINE, 1.2);
  p(g, 'M86 105C91.5 108 95.8 109.4 100 109.4S108.5 108 114 105L108 140H92Z', GOLD, GOLD_DARK, 1, ACCENT);
  p(g, 'M96.6 114L103.4 120M103.4 114L96.6 120M97.4 123L102.6 129M102.6 123L97.4 129M98 132L102 137M102 132L98 137', null, 'currentColor', 1.1);
  p(g, 'M73 104C69 114 67 127 68 140M127 104C131 114 133 127 132 140', null, GOLD, 1.4);
  p(g, 'M93 76V96C90 97 88 98 86 99C90 106 95 109 100 109S110 106 114 99C112 98 110 97 107 96V76Z', SKIN, LINE, 1.1);
  p(g, 'M86 99C90 106 95 109 100 109S110 106 114 99', null, GOLD, 2.6);
  for (const [x, y] of [[91, 96.4], [93.9, 98.9], [96.9, 100.3], [100, 100.8], [103.1, 100.3], [106.1, 98.9], [109, 96.4]]) {
    dot(g, x, y, 1.5, PAPER, { stroke: '#b3a07c', 'stroke-width': 0.5 });
  }
  dot(g, 100, 104.4, 2.3, 'currentColor', { stroke: GOLD, 'stroke-width': 1 });
  // face
  head(g, 14);
  dot(g, 92.2, 69.8, 2.8, '#e8836f', { 'fill-opacity': 0.4 });
  dot(g, 107.8, 69.8, 2.8, '#e8836f', { 'fill-opacity': 0.4 });
  p(g, 'M96.6 74.6Q100 72.8 103.4 74.6Q100 77.8 96.6 74.6Z', '#c43a4a', '#8e2232', 0.5);
  p(g, 'M91.8 61.8L90.4 60.6M108.2 61.8L109.6 60.6', null, LINE, 0.9);
  // parted fringe
  p(g, 'M86 62C85 49 93 44.2 100 45.2C107 44.2 115 49 114 62C111 54 105 51 100 54C95 51 89 54 86 62Z', hair, LINE, 1.1);
  // tiara
  p(g, 'M86 52C92 46 108 46 114 52L112 55C106 50 94 50 88 55Z', GOLD, GOLD_DARK, 0.9);
  p(g, 'M95.5 48.6L100 36L104.5 48.6Z', GOLD, GOLD_DARK, 0.9);
  p(g, 'M88.6 51.4L89 44.5L93.4 49Z', GOLD, GOLD_DARK, 0.8);
  p(g, 'M111.4 51.4L111 44.5L106.6 49Z', GOLD, GOLD_DARK, 0.8);
  dot(g, 100, 44.2, 2, SAPPHIRE, { stroke: GOLD_DARK, 'stroke-width': 0.6 });
  dot(g, 100, 35.2, 1.9, PAPER, { stroke: GOLD_DARK, 'stroke-width': 0.6 });
  dot(g, 89, 43.6, 1.4, PAPER, { stroke: GOLD_DARK, 'stroke-width': 0.5 });
  dot(g, 111, 43.6, 1.4, PAPER, { stroke: GOLD_DARK, 'stroke-width': 0.5 });
  // rose
  p(g, 'M131 140C131 124 132.5 112 133.5 100', null, '#3d7a3a', 2.2);
  p(g, 'M131.6 120C135.5 114.5 141 114.5 143 116.5C139.5 121 135 121.5 131.6 120Z', '#4f8f45', '#2e5e2b', 0.7);
  p(g, 'M132 128C128 123.5 123.5 124 122 126C125 130 129 130.5 132 128Z', '#4f8f45', '#2e5e2b', 0.7);
  dot(g, 133.5, 95, 7.5, 'currentColor', { stroke: LINE, 'stroke-width': 1 });
  p(g, 'M133.5 95.5m-3.8 0a3.8 3.8 0 1 1 3.8 3.8M133.5 95.5a1.7 1.7 0 1 0-1.7-1.7', null, PAPER, 1, { 'stroke-opacity': 0.75 });
}

function drawBoer(g) {
  const hair = '#4b2e1c';
  // tunic with slashed sleeves, doublet, buttons and collar
  p(g, TORSO, 'currentColor', LINE, 1.2);
  p(g, 'M65 106L69.5 124M73.5 103L77 121M126.5 103L123 121M135 106L130.5 124', null, GOLD, 1.8);
  p(g, 'M89 98L100 110L111 98L114.5 140H85.5Z', PAPER, LINE, 1, ACCENT);
  p(g, 'M91.5 106V140M95.6 110V140M104.4 110V140M108.5 106V140', null, 'currentColor', 1.1, { 'stroke-opacity': 0.55 });
  for (const y of [117, 126, 135]) dot(g, 100, y, 2.2, GOLD, { stroke: GOLD_DARK, 'stroke-width': 0.6 });
  neck(g);
  p(g, 'M88 97L100 111L112 97L107 92.5L100 102L93 92.5Z', PAPER, LINE, 1.1);
  // hair, head
  p(g, 'M84.5 56C83 66 84 74 88 80L90.5 61ZM115.5 56C117 66 116 74 112 80L109.5 61Z', hair, LINE, 1);
  head(g);
  p(g, 'M96.2 74.4Q100 77.4 103.8 74.4', null, LINE, 1.1);
  // beret with a plume
  p(g, 'M110 44C113 33 121 23.5 133 18.5C132 28 124.5 38 115 48Z', GOLD, GOLD_DARK, 0.9);
  p(g, 'M112.4 45.5C116 35.5 123 26.5 132 20M118.6 37.4L124 36.2M122.4 31.4L127.6 30.6M115.8 42.6L120.6 41.8', null, GOLD_DARK, 0.7);
  p(g, 'M80 55C77 41 89 33 103 34C117 35 125 42 122 52C116 55 108.5 54 100 54S86 56 80 55Z', 'currentColor', LINE, 1.2, ACCENT);
  p(g, 'M81.5 52C92 49 110 49 121.3 51L120.8 55C110 53.5 92 53.6 82 56.4Z', GOLD, GOLD_DARK, 0.8);
  // spear
  p(g, 'M66 140V52', null, '#6e4524', 3.4);
  p(g, 'M66 29L71.5 45L66 51.5L60.5 45Z', '#d7dbe2', '#596170', 1);
  p(g, 'M61.5 51.5H70.5', null, GOLD_DARK, 2.4);
}

// ---- Back ---------------------------------------------------------------

// Diagonal lattice clipped by a nested <svg> viewport (no ids, so clones
// never collide). Lines run x+y=c and x-y=d over a range wider than the
// viewport, each starting on a crossing, so a dashed stroke with round caps
// along one family puts a gold dot on every crossing.
function latticePaths() {
  const step = 20;
  const rising = [];
  const falling = [];
  for (let c = 0; c <= 480; c += step) {
    rising.push(`M${(c - 260) / 2} ${(c + 260) / 2}L${(c + 180) / 2} ${(c - 180) / 2}`);
  }
  for (let d = -260; d <= 180; d += step) {
    falling.push(`M${d / 2} ${-d / 2}L${(d + 480) / 2} ${(480 - d) / 2}`);
  }
  return { rising: rising.join(''), falling: falling.join(''), dots: `0 ${r3((Math.SQRT2 * step) / 2)}` };
}

function buildBack(color) {
  const root = document.createElement('div');
  root.className = 'card back';
  root.dataset.back = color;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'dichte kaart');

  const svg = node('svg', {
    class: 'card-svg',
    viewBox: `0 0 ${W} ${H}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  root.appendChild(svg);

  node('rect', { class: 'cb-base', x: 8, y: 8, width: 184, height: 264, rx: 10 }, svg);
  const clip = node('svg', { x: 18, y: 18, width: 164, height: 244, viewBox: '18 18 164 244', overflow: 'hidden' }, svg);
  const { rising, falling, dots } = latticePaths();
  node('path', { class: 'cb-line', d: rising + falling, fill: 'none', 'stroke-width': 0.9 }, clip);
  node('path', {
    class: 'cb-gold', d: rising, fill: 'none', 'stroke-width': 3.2,
    'stroke-linecap': 'round', 'stroke-dasharray': dots,
  }, clip);

  node('rect', { class: 'cb-frame', x: 14, y: 14, width: 172, height: 252, rx: 6, fill: 'none', 'stroke-width': 2.2 }, svg);
  node('rect', { class: 'cb-frame', x: 18.5, y: 18.5, width: 163, height: 243, rx: 3, fill: 'none', 'stroke-width': 0.9 }, svg);

  // Corner clovers on small medallions.
  for (const [x, y] of [[34, 34], [166, 34], [34, 246], [166, 246]]) {
    node('circle', { class: 'cb-base cb-ring', cx: x, cy: y, r: 10, 'stroke-width': 1.2 }, svg);
    suitAt(svg, 'C', x, y, 13, false, 'cb-fill');
  }

  // Central medallion with the klaver.
  const cx = W / 2;
  node('ellipse', { class: 'cb-base cb-ring', cx, cy: MID, rx: 48, ry: 64, 'stroke-width': 2.4 }, svg);
  node('ellipse', { class: 'cb-frame', cx, cy: MID, rx: 42, ry: 58, fill: 'none', 'stroke-width': 0.9 }, svg);
  for (const y of [MID - 64, MID + 64]) {
    node('path', { class: 'cb-fill cb-ring', d: `M${cx} ${y - 7}L${cx + 5} ${y}L${cx} ${y + 7}L${cx - 5} ${y}Z`, 'stroke-width': 0.8 }, svg);
  }
  suitAt(svg, 'C', cx, MID, 58, false, 'cb-fill');
  return root;
}
