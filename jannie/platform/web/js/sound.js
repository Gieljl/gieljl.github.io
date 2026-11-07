// Game sounds, synthesised on the fly with the WebAudio API (no audio files).
//
// Palette: a cosy wooden cafe. Paper and felt noises for the cards, marimba
// and electric-piano chimes for good news, soft muted brass for the big
// moments. Everything runs through one gentle compressor and a soft limiter,
// so overlapping sounds never clip.
//
// Never throws: without AudioContext support, before unlock() or with an
// unknown name every call is a quiet no-op.

const STORE_KEY = 'kj.sound';
const DEFAULT_VOLUME = 0.6;
const MAX_VOICES = 10;
const GAP_MS = 40;          // the same sound at most once per 40 ms ...
const DEAL_GAP_MS = 15;     // ... except dealing, which comes in quick runs
const LEAD = 0.01;          // schedule just ahead of currentTime
const RESUME_GRACE_MS = 1000;
// Silent this long, or muted this long (past the volume fade), the context
// sleeps; howler.js's autoSuspend does the same after 30 s.
const NAP_MS = { idle: 30000, muted: 400 };

const settings = loadSettings();
const chains = new WeakMap();        // BaseAudioContext → output chain
const noiseBuffers = new WeakMap();  // BaseAudioContext → white noise
const lastPlayed = new Map();        // sound name → clock() of last start
const voices = [];                   // sounding voices, oldest first
let ctx = null;                      // the live AudioContext, made by unlock()
let resumeUntil = 0;                 // a pending resume() may still start queued sounds
let calling = false;                 // call.js holds the audio session (setCall)
let napping = false;                 // we suspended the context ourselves
let napTimer = 0;

// ---- settings --------------------------------------------------------------

function loadSettings() {
  const s = { muted: false, volume: DEFAULT_VOLUME };
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(STORE_KEY));
    if (typeof saved?.muted === 'boolean') s.muted = saved.muted;
    if (Number.isFinite(saved?.volume)) s.volume = clamp01(saved.volume);
  } catch { /* storage blocked or corrupt: keep defaults */ }
  return s;
}

function saveSettings() {
  try {
    globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch { /* storage blocked: settings last for this page only */ }
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

// Audio taper: the slider feels even, and low settings stay really quiet.
function masterGain(volume, muted = false) {
  return muted ? 0 : volume ** 1.5;
}

// Glide to the new level under sounding voices (no zipper noise); jump when
// silent, so a click right after unmuting is heard in full.
function applyVolume() {
  const ch = ctx && chains.get(ctx);
  if (!ch) return;
  const p = ch.master.gain, now = ctx.currentTime;
  const target = masterGain(settings.volume, settings.muted);
  p.cancelScheduledValues(now);
  if (voices.length) p.setTargetAtTime(target, now, 0.03);
  else p.setValueAtTime(target, now);
}

// ---- output chain ----------------------------------------------------------

// Soft limiter curve: linear up to 0.8, then bends smoothly towards 0.94.
const SOFT_CLIP = (() => {
  const n = 4097, knee = 0.8, ceil = 0.94;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
})();

// One chain per context: voices → bus → low cut → mellow shelf → compressor
// → master volume → soft limiter → speakers.
function chainFor(c, gain) {
  let ch = chains.get(c);
  if (ch) return ch;
  const bus = c.createGain();
  const lowCut = c.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 60;
  lowCut.Q.value = 0.7;
  const mellow = c.createBiquadFilter();
  mellow.type = 'highshelf';
  mellow.frequency.value = 6500;
  mellow.gain.value = -4;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const master = c.createGain();
  master.gain.value = gain;
  const limiter = c.createWaveShaper();
  limiter.curve = SOFT_CLIP;
  bus.connect(lowCut);
  lowCut.connect(mellow);
  mellow.connect(comp);
  comp.connect(master);
  master.connect(limiter);
  limiter.connect(c.destination);
  ch = { bus, master };
  chains.set(c, ch);
  return ch;
}

function noiseBuffer(c) {
  let buf = noiseBuffers.get(c);
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, buf);
  }
  return buf;
}

// ---- building blocks -------------------------------------------------------

// A voice is one played sound: its nodes feed `out`, which can be faded on its own.
function startVoice(c, dest, t) {
  const out = c.createGain();
  out.connect(dest);
  return { ctx: c, out, t, end: t, timer: 0, done: false };
}

// Start sources at t0 and stop them at `end`, which also extends the voice.
function run(v, sources, t0, end) {
  for (const s of sources) {
    s.start(t0);
    s.stop(end);
  }
  v.end = Math.max(v.end, end);
}

// Output for a layer, optionally panned a little for width.
function outFor(v, pan) {
  if (!pan || !v.ctx.createStereoPanner) return v.out;
  const p = v.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(v.out);
  return p;
}

// Percussive envelope: 0 → peak in `a` s, exponential fall to silence at t0+d.
function percussive(p, t0, peak, a, d) {
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + a);
  p.exponentialRampToValueAtTime(peak * 1e-3, t0 + d);
  p.linearRampToValueAtTime(0, t0 + d + 0.008);
}

// Held envelope: attack, settle to 75 %, hold until t0+len, release over r.
function held(p, t0, peak, a, len, r) {
  const settle = Math.min(t0 + a + 0.1, t0 + len);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + a);
  p.linearRampToValueAtTime(peak * 0.75, settle);
  p.setValueAtTime(peak * 0.75, t0 + len);
  p.exponentialRampToValueAtTime(peak * 0.75e-3, t0 + len + r);
  p.linearRampToValueAtTime(0, t0 + len + r + 0.008);
}

// Simple oscillator with a percussive envelope and optional pitch glide.
function tone(v, { f, f2, glide, type = 'sine', t = 0, a = 0.004, d, g, pan }) {
  const c = v.ctx, t0 = v.t + t;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + (glide ?? d));
  percussive(amp.gain, t0, g, a, d);
  osc.connect(amp);
  amp.connect(outFor(v, pan));
  run(v, [osc], t0, t0 + d + 0.01);
}

// Filtered noise burst: the paper, felt and table sounds.
function noise(v, { t = 0, d, g, a = 0.002, type = 'bandpass', f, f2, q = 1, pan }) {
  const c = v.ctx, t0 = v.t + t;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f, t0);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  percussive(amp.gain, t0, g, a, d);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(outFor(v, pan));
  src.start(t0, Math.random() * 0.8);   // a different stretch of noise each time
  src.stop(t0 + d + 0.01);
  v.end = Math.max(v.end, t0 + d + 0.01);
}

// Two-operator FM. Ratio 1 gives a round electric-piano tine; an inharmonic
// ratio gives a soft gong. The brightness fades faster than the note.
function fm(v, f, t, g, d, { ratio = 1, index = 0.8, a = 0.003, fade = 0.4 } = {}) {
  const c = v.ctx, t0 = v.t + t;
  const car = c.createOscillator(), mod = c.createOscillator();
  const depth = c.createGain(), amp = c.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  depth.gain.setValueAtTime(f * ratio * index, t0);
  depth.gain.exponentialRampToValueAtTime(f * ratio * index * 0.08, t0 + Math.min(d, fade));
  percussive(amp.gain, t0, g, a, d);
  mod.connect(depth);
  depth.connect(car.frequency);
  car.connect(amp);
  amp.connect(v.out);
  run(v, [car, mod], t0, t0 + d + 0.01);
}

// Electric-piano note.
const tine = (v, f, t, g, d, index = 0.8) => fm(v, f, t, g, d, { index });

// Marimba bar: fundamental, the bar's fourth-harmonic overtone and a mallet tap.
function mallet(v, f, t, g, d = 0.45) {
  tone(v, { f, t, g, d, a: 0.002 });
  tone(v, { f: f * 4, t, g: g * 0.1 * Math.min(1, 900 / f), d: d * 0.2, a: 0.001 });
  noise(v, { t, d: 0.012, g: g * 0.25, f: Math.min(f * 3, 4000), q: 1.5 });
}

// Soft brass: two detuned saws through a low-pass that opens on the attack.
// `wah` sweeps the filter like a trombone mute; `vib` adds vibrato (cents);
// `slide` bends the pitch to that frequency over the last `slideFor` s.
function horn(v, f, t, len, g, { wave = 'sawtooth', bright = 4, r = 0.12, vib = 0, wah = false, slide, slideFor = 0.2 } = {}) {
  const c = v.ctx, t0 = v.t + t, end = t0 + len + r;
  const lp = c.createBiquadFilter();
  const amp = c.createGain();
  lp.type = 'lowpass';
  if (wah) {
    lp.Q.value = 2.2;
    lp.frequency.setValueAtTime(320, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 5, 1500), t0 + 0.09);
    lp.frequency.exponentialRampToValueAtTime(420, end);
  } else {
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(f * 1.3, t0);
    lp.frequency.linearRampToValueAtTime(Math.min(f * bright, 3200), t0 + 0.05);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * bright * 0.6, 2200), end);
  }
  held(amp.gain, t0, g, 0.025, len, r);
  lp.connect(amp);
  amp.connect(v.out);
  const sources = [];
  let wobble = null;
  if (vib) {
    const lfo = c.createOscillator();
    wobble = c.createGain();
    lfo.frequency.value = 5.3;
    wobble.gain.setValueAtTime(0, t0);
    wobble.gain.linearRampToValueAtTime(vib, t0 + Math.min(0.25, len));
    lfo.connect(wobble);
    sources.push(lfo);
  }
  for (const cents of [-6, 5]) {
    const osc = c.createOscillator();
    osc.type = wave;
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(f, t0);
    if (slide) {
      osc.frequency.setValueAtTime(f, t0 + Math.max(0, len - slideFor));
      osc.frequency.exponentialRampToValueAtTime(slide, t0 + len);
    }
    if (wobble) wobble.connect(osc.detune);
    osc.connect(lp);
    sources.push(osc);
  }
  run(v, sources, t0, end + 0.01);
}

// A shower of tiny high pings for roem and celebrations.
const GLITTER = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7'].map(hz);
function sparkle(v, t, span, count, g) {
  for (let i = 0; i < count; i++) {
    tone(v, {
      f: GLITTER[Math.floor(Math.random() * GLITTER.length)],
      t: t + (span * i) / count + Math.random() * (span / count),
      g: g * (0.5 + Math.random() * 0.5),
      d: 0.1 + Math.random() * 0.08,
      a: 0.002,
      pan: Math.random() * 1.2 - 0.6,
    });
  }
}

// 'A4' → 440, 'C#5', 'Bb3'.
function hz(note) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  const step = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const midi = step + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

// ±amount random factor, so repeated card sounds never sound mechanical.
const vary = (amount) => 1 + (Math.random() * 2 - 1) * amount;

// ---- the sounds ------------------------------------------------------------

const SOUNDS = {
  // Crisp card snap on felt, with a tiny wooden knock.
  card(v) {
    const k = vary(0.06);
    noise(v, { d: 0.045, g: 0.45, f: 2600 * k, q: 0.8 });
    noise(v, { d: 0.07, g: 0.19, type: 'lowpass', f: 1100 * k, q: 0.5 });
    tone(v, { f: 430 * k, f2: 260 * k, d: 0.06, g: 0.19, a: 0.002 });
    tone(v, { f: 150 * k, f2: 95, d: 0.08, g: 0.09, a: 0.002 });
  },

  // Two knuckle knocks on the wooden table (a raise of the stake).
  knock(v) {
    for (const t of [0, 0.14]) {
      const k = vary(0.05);
      tone(v, { t, f: 190 * k, f2: 95, d: 0.09, g: 0.5, a: 0.002 });
      noise(v, { t, d: 0.05, g: 0.3, type: 'lowpass', f: 950 * k, q: 0.7 });
    }
  },

  // One soft flick of a dealt card.
  deal(v) {
    const k = vary(0.1);
    noise(v, { d: 0.055, g: 0.45, a: 0.006, f: 2400 * k, f2: 1100 * k, q: 1.1, pan: Math.random() * 0.6 - 0.3 });
    noise(v, { t: 0.02, d: 0.035, g: 0.12, type: 'lowpass', f: 900 * k, q: 0.5 });
  },

  // Riffle shuffle: a burst of tiny flicks, then the deck is squared.
  shuffle(v) {
    noise(v, { t: 0.02, d: 0.5, g: 0.1, a: 0.12, f: 2400, q: 0.5 });
    let t = 0;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      noise(v, {
        t, d: 0.022, g: 0.38 * Math.sin(Math.PI * (0.12 + 0.8 * x)) + 0.06, a: 0.001,
        f: 2600 + Math.random() * 1800, q: 1.4, pan: 0.5 - x,
      });
      t += 0.016 + Math.random() * 0.01 + x * 0.006;
    }
    noise(v, { t: t + 0.07, d: 0.05, g: 0.45, type: 'lowpass', f: 1300, q: 0.6 });
    tone(v, { t: t + 0.07, f: 300, f2: 190, d: 0.06, g: 0.24, a: 0.002 });
  },

  // The four cards slide together over the felt.
  trick(v) {
    noise(v, { d: 0.26, g: 0.26, a: 0.07, f: 1100, f2: 2400, q: 0.6 });
    noise(v, { d: 0.22, g: 0.15, a: 0.05, type: 'lowpass', f: 600, q: 0.5 });
    noise(v, { t: 0.2, d: 0.05, g: 0.26, type: 'lowpass', f: 1500, q: 0.6 });
    tone(v, { t: 0.2, f: 260, f2: 170, d: 0.07, g: 0.15, a: 0.002 });
  },

  // Soft rising two-note chime.
  trickWon(v) {
    tine(v, hz('C5'), 0, 0.125, 0.45, 0.7);
    tine(v, hz('G5'), 0.1, 0.145, 0.55, 0.7);
  },

  // Bright marimba arpeggio with a sparkle on top.
  roem(v) {
    ['C5', 'E5', 'G5'].forEach((n, i) => mallet(v, hz(n), i * 0.055, 0.17, 0.35));
    mallet(v, hz('C6'), 0.165, 0.11, 0.5);
    tine(v, hz('C6'), 0.165, 0.16, 0.6, 0.6);
    sparkle(v, 0.17, 0.35, 9, 0.045);
  },

  // Warm low gong with a soft major chord blooming out of it.
  trump(v) {
    noise(v, { d: 0.04, g: 0.15, type: 'lowpass', f: 500, q: 0.7 });
    fm(v, hz('D3'), 0, 0.18, 1.25, { ratio: 1.414, index: 1.6, a: 0.012, fade: 0.9 });
    tone(v, { f: hz('D2'), d: 0.6, g: 0.08, a: 0.01 });
    tine(v, hz('D4'), 0, 0.3, 1.1, 0.6);
    tine(v, hz('F#4'), 0.025, 0.25, 1.05, 0.6);
    tine(v, hz('A4'), 0.05, 0.25, 1.0, 0.6);
    tine(v, hz('D5'), 0.075, 0.14, 0.9, 0.5);
  },

  // Gentle ping: your turn.
  turn(v) {
    tine(v, hz('A5'), 0, 0.15, 0.5, 0.7);
    tone(v, { f: hz('E6'), d: 0.18, g: 0.02, a: 0.002 });
  },

  // Soft blip for a chat line.
  chat(v) {
    tone(v, { f: 560, f2: 840, glide: 0.05, d: 0.11, g: 0.16 });
    tone(v, { f: 1120, f2: 1680, glide: 0.05, d: 0.06, g: 0.025 });
  },

  // Comic "wah wah wah waaah" on a muted trombone.
  nat(v) {
    ['D4', 'C#4', 'C4'].forEach((n, i) => horn(v, hz(n), i * 0.25, 0.19, 0.34, { wah: true, r: 0.06 }));
    horn(v, hz('B3'), 0.75, 0.42, 0.36, { wah: true, vib: 35, slide: hz('A3'), slideFor: 0.2 });
  },

  // Triumphant flourish: rising brass run into a held chord, timpani and glitter.
  pit(v) {
    ['G4', 'C5', 'E5'].forEach((n, i) => horn(v, hz(n), i * 0.07, 0.09, 0.16, { r: 0.05 }));
    ['G5', 'C6', 'E6'].forEach((n, i) => mallet(v, hz(n), i * 0.07, 0.08, 0.3));
    [['C4', 0.11], ['G4', 0.11], ['C5', 0.13], ['E5', 0.13]].forEach(([n, g], i) => {
      horn(v, hz(n), 0.24 + i * 0.012, 0.7 - i * 0.012, g, { vib: 12, r: 0.15 });
    });
    tone(v, { t: 0.24, f: hz('C3'), f2: hz('C3') * 0.92, d: 0.45, g: 0.14, a: 0.004 });
    noise(v, { t: 0.24, d: 0.08, g: 0.12, type: 'lowpass', f: 300, q: 0.7 });
    sparkle(v, 0.28, 0.6, 14, 0.05);
  },

  // Pleasant IV–V–I cadence on the electric piano.
  handWon(v) {
    for (const n of ['F4', 'A4', 'C5']) tine(v, hz(n), 0, 0.12, 0.4, 0.7);
    for (const n of ['G4', 'B4', 'D5']) tine(v, hz(n), 0.22, 0.12, 0.4, 0.7);
    for (const n of ['E4', 'G4', 'C5', 'E5']) tine(v, hz(n), 0.44, 0.12, 0.65, 0.7);
  },

  // Soft falling minor arpeggio.
  handLost(v) {
    tine(v, hz('E5'), 0, 0.2, 0.4, 0.6);
    tine(v, hz('C5'), 0.2, 0.19, 0.4, 0.6);
    tine(v, hz('A4'), 0.4, 0.2, 0.6, 0.6);
    tine(v, hz('A3'), 0.4, 0.1, 0.65, 0.5);
    tone(v, { t: 0.4, f: hz('A2'), d: 0.5, g: 0.08, a: 0.01 });
  },

  // Celebratory fanfare: ta-ta-ta-taaa into a full chord.
  win(v) {
    [0, 0.13, 0.26].forEach((t) => horn(v, hz('G4'), t, 0.1, 0.17, { r: 0.04 }));
    tone(v, { f: hz('G2'), f2: hz('G2') * 0.94, d: 0.3, g: 0.1, a: 0.004 });
    [['C4', 0.12], ['E4', 0.12], ['G4', 0.14], ['C5', 0.16]].forEach(([n, g], i) => {
      horn(v, hz(n), 0.4 + i * 0.012, 0.7 - i * 0.012, g, { vib: 14, r: 0.15 });
    });
    tone(v, { t: 0.4, f: hz('C3'), f2: hz('C3') * 0.92, d: 0.5, g: 0.12, a: 0.004 });
    ['C6', 'E6', 'G6'].forEach((n, i) => mallet(v, hz(n), 0.46 + i * 0.06, 0.1, 0.35));
    sparkle(v, 0.45, 0.7, 16, 0.05);
  },

  // Gentle consolation: a soft sigh that resolves to a warm chord.
  lose(v) {
    tine(v, hz('D5'), 0, 0.2, 0.4, 0.5);
    tine(v, hz('B4'), 0.2, 0.19, 0.4, 0.5);
    for (const [n, g] of [['E4', 0.13], ['G4', 0.13], ['C5', 0.17]]) tine(v, hz(n), 0.4, g, 0.65, 0.5);
  },

  // Small wooden UI tick.
  click(v) {
    noise(v, { d: 0.018, g: 0.34, f: 2600, q: 1.2 });
    tone(v, { f: 1400, d: 0.02, g: 0.1, type: 'triangle', a: 0.001 });
  },

  // Soft low "bup-bup".
  error(v) {
    horn(v, hz('G3'), 0, 0.09, 0.16, { wave: 'square', bright: 5, r: 0.04 });
    horn(v, hz('F#3'), 0.13, 0.09, 0.16, { wave: 'square', bright: 5, r: 0.04 });
  },

  // Friendly upward glide ending in a ding.
  join(v) {
    tone(v, { type: 'triangle', f: hz('G4'), f2: hz('G5'), glide: 0.22, a: 0.03, d: 0.32, g: 0.14 });
    tine(v, hz('G5'), 0.2, 0.12, 0.35, 0.6);
  },
};

// ---- voices and playback ---------------------------------------------------

function known(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, name);
}

function clock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function release(v) {
  if (v.done) return;
  v.done = true;
  clearTimeout(v.timer);
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  try { v.out.disconnect(); } catch { /* already gone */ }
}

// Fade a voice out quickly to make room for a new one.
function steal(v, now) {
  const p = v.out.gain;
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(0, now + 0.03);
  clearTimeout(v.timer);
  v.timer = setTimeout(() => release(v), 60);
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
}

// A running context keeps the audio output busy, also in silence: on iOS the
// audio hardware and its IO thread, in Chrome a render callback some 100
// times a second (after 30 s silent into a fake sink). So it sleeps once
// nothing has sounded for a while; the next sound wakes it, a tap or a key
// typed in the chat does not. It does not fall asleep while call.js holds
// the session (setCall), which keeps the audio hardware busy anyway; one
// already asleep wakes at the next sound. After that the wait starts again.
function napLater() {
  clearTimeout(napTimer);
  napTimer = setTimeout(nap, settings.muted ? NAP_MS.muted : NAP_MS.idle);
}

function nap() {
  try {
    if (calling || !ctx || ctx.state !== 'running' || typeof ctx.suspend !== 'function') return;
    if (voices.length) { napLater(); return; } // they would freeze, and play on at the next wake
    napping = true;
    Promise.resolve(ctx.suspend()).catch(() => { napping = false; });
  } catch {
    napping = false;
  }
}

// Resumes the context; sounds played meanwhile are scheduled on its stopped
// clock and start once it runs. Once a context has run, no gesture is needed.
function wake() {
  napping = false;
  resumeUntil = clock() + RESUME_GRACE_MS;
  const done = () => { resumeUntil = 0; };
  return Promise.resolve(ctx.resume()).then(done, done);
}

function ready() {
  return ctx !== null && (ctx.state === 'running' || clock() < resumeUntil);
}

function play(name) {
  try {
    if (settings.muted || !known(name)) return;
    if (napping) wake(); // also while its suspend() is still on the way
    if (!ready()) return;
    const now = clock();
    if (now - (lastPlayed.get(name) ?? -Infinity) < (name === 'deal' ? DEAL_GAP_MS : GAP_MS)) return;
    lastPlayed.set(name, now);
    const t = ctx.currentTime;
    for (const old of voices.filter((x) => x.end < t)) release(old);
    while (voices.length >= MAX_VOICES) steal(voices[0], t);
    const v = startVoice(ctx, chainFor(ctx, masterGain(settings.volume, settings.muted)).bus, t + LEAD);
    voices.push(v);
    try {
      SOUNDS[name](v);
    } finally {
      // While a resume is pending the clock stands still: hold the voice
      // for the rest of the grace too, or a short one would end unheard.
      v.timer = setTimeout(() => release(v), (v.end - t) * 1000 + 250 + Math.max(0, resumeUntil - now));
      napLater();
    }
  } catch { /* a sound must never break the game */ }
}

// iOS only unlocks output after something has played inside the gesture.
function kick(c) {
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, c.sampleRate);
  src.connect(c.destination);
  src.start(0);
}

function unlock() {
  try {
    const fresh = !ctx || ctx.state === 'closed';
    if (fresh) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return Promise.resolve();
      session();
      const c = new AC({ latencyHint: 'interactive' });
      ctx = c;
      napping = false;
      voices.length = 0;
      chainFor(ctx, masterGain(settings.volume, settings.muted));
      // Running again, also by itself after an iOS interruption: sleep once silent.
      c.addEventListener?.('statechange', () => { if (c === ctx && c.state === 'running') napLater(); });
    } else if (ctx.state === 'running' || (napping && ctx.state === 'suspended')) {
      return Promise.resolve(); // running, or asleep by our own choice: the next sound wakes it
    }
    kick(ctx);
    napLater();
    if (ctx.state === 'running') return Promise.resolve();
    return wake();
  } catch {
    return Promise.resolve();
  }
}

// iOS (navigator.audioSession): game effects mix with the user's own music
// instead of stopping it. That session records nothing and goes quiet with
// the silent switch, so a call plays and records instead.
function session() {
  try {
    if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = calling ? 'play-and-record' : 'ambient';
  } catch { /* unsupported */ }
}

// call.js: on before it asks for the microphone, or once someone else in the
// call has it on; off on every way out.
function setCall(on) {
  if (calling === Boolean(on)) return;
  calling = Boolean(on);
  session();
  if (!calling && ctx) napLater(); // the context may sleep again (nap)
}

// Unlock on any real user gesture too, and resume after iOS interruptions
// (phone call, app switch), also of a context that was asleep. Touch
// pointerdown does not count as a gesture.
function onGesture(e) {
  if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
  if (!ctx || ctx.state !== 'running') unlock();
}
try {
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
    globalThis.addEventListener?.(type, onGesture, { capture: true, passive: true });
  }
} catch { /* no DOM */ }

function setMuted(muted) {
  settings.muted = Boolean(muted);
  saveSettings();
  try { applyVolume(); } catch { /* context gone */ }
  if (settings.muted && ctx) napLater();
}

// Accepts a number or a numeric string (a range input's value); anything else is ignored.
function setVolume(volume) {
  const x = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (typeof x !== 'number' || !Number.isFinite(x)) return;
  settings.volume = clamp01(x);
  saveSettings();
  try { applyVolume(); } catch { /* context gone */ }
}

// Test-only: render `name` into any (Offline)AudioContext at time `at`,
// through the same output chain (built once per context, at `volume`).
// Bypasses mute, unlock and throttling, and lets errors through.
// Returns the sound's length in seconds, or 0 for an unknown name.
function renderTo(c, name, { volume = DEFAULT_VOLUME, at = 0 } = {}) {
  if (!known(name)) return 0;
  const v = startVoice(c, chainFor(c, masterGain(clamp01(volume))).bus, at);
  SOUNDS[name](v);
  return v.end - at;
}

export const sound = {
  unlock,                          // call on a user gesture; returns a promise that never rejects
  play,                            // play(name): see SOUNDS above
  setMuted,
  isMuted: () => settings.muted,
  setVolume,                       // 0..1
  getVolume: () => settings.volume,
  setCall,                         // setCall(bool): call.js holds the iOS audio session
  _renderTo: renderTo,             // test-only
  _names: Object.freeze(Object.keys(SOUNDS)),   // test-only
  _voiceCount: () => voices.length,             // test-only
  _napMs: NAP_MS,                                // test-only: shorter waits
};
