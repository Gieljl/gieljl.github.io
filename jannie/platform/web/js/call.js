// Calling the table: sound and video between the people at a table,
// straight from browser to browser (WebRTC, a connection for every two of
// them). The server keeps who is in the call, with microphone and camera,
// and passes the session descriptions on (`call`, `rtc`,
// docs/protocol.md#client--server). Loaded once another person sits at the
// table, like expert.js. In the call one hears and sees the others at
// once; one's own microphone and camera are switched on apart from that.
import { sound } from './sound.js';
import { app, h, icon, store, toast } from './util.js';
import * as panels from './panels.js';

// Public STUN servers tell each browser its address as the internet sees
// it; nothing of the call passes the game's own server. The browser asks
// both: Nextcloud's in Germany (port 443, for networks that block the STUN
// port 3478) and Belledonne's, Linphone's maker, in France. No TURN: where
// two networks allow no direct connection, those two do not hear each
// other.
const ICE = [{ urls: ['stun:stun.nextcloud.com:443', 'stun:stun.linphone.org:3478'] }];
const GATHER_MS = 2500;   // waited for the addresses before a description goes out
const CONNECT_MS = 20000; // a connection not up by then has failed
const LOST_MS = 8000;     // a connection that drops may come back within this
const RETRIES = 3;        // fresh offers after a failure, 2, 4 and 6 s apart
const RESEND_MS = 4000;   // the server shows us otherwise this long after we said: say it again
const ANSWERED_MS = 800;  // a refusal later than this was someone's answer to the browser's question
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
// Small: the picture fills a seat's circle, and goes to every other player.
const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' };
// The circle shows the picture at most about 160 device pixels wide: there
// 300 kbit/s looks nearly the same as the 600 a browser allows 320x240
// (0.6 dB less PSNR at 124 px), at half the data to and from every other
// player, and less encoding and decoding.
const VIDEO_BITRATE = 300000;

let s = null;        // the latest state received (the table may still animate an older one)
let me = null;       // our session while in the call: {id, sentAt}
let busy = null;     // the session whose microphone or camera is being switched
let asking = false;  // our microphone is being asked for
let held = false;    // the call's audio session, once it was needed, until we hang up
let told = false;    // the others' sound waits for a tap, and we said so
let mic = null;      // our tracks
let cam = null;
let micOn = false;   // what the others get
let camOn = false;
let asked = '';      // the room we were in the call in, or it was proposed in: not again there
let unlocking = false;
const peers = new Map(); // session id → {id, seat, offerer, pc, audio, video, el, mic, cam, live, up, failed, tries, timer}
const seen = new Set();  // sessions told as "belt mee"
const rings = new Set(); // elements that show a seat: its video, or the call's mark
const docks = new Set(); // elements that hold the call buttons
// A tap counts once the finger lifts: Safari does not take a touch's
// pointerdown for a gesture, and refuses to play from it (as sound.js).
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const box = h('div', { class: 'call-media', hidden: true });
const self = h('video', { class: 'call-video self', autoplay: true, muted: true, playsInline: true });
document.body.append(box);

// The others' sound and pictures play in elements made here, one pair for
// each other seat, and started without anything in them at the first taps
// (prime): Safari then lets each play later without a tap, also while we
// capture nothing ourselves, as a listener (else it plays sound only while
// the page records).
const pool = Array.from({ length: 3 }, pair);
for (const type of GESTURES) addEventListener(type, prime, true);

function pair() {
  const e = {
    peer: null, primed: false,
    audio: h('audio', { autoplay: true }),
    video: h('video', { class: 'call-video', autoplay: true, muted: true, playsInline: true }),
  };
  box.append(e.audio);
  // Shown once a picture arrives (Safari unmutes the track before that).
  e.shown = () => {
    if (!e.peer || !e.video.videoWidth || e.peer.live) return;
    e.peer.live = true;
    refresh();
  };
  e.video.addEventListener('playing', e.shown);
  e.video.addEventListener('resize', e.shown);
  return e;
}

function prime(ev) {
  if (ev.type === 'pointerdown' && ev.pointerType !== 'mouse') return;
  for (const e of pool) {
    if (e.primed) continue;
    e.primed = true;
    for (const el of [e.audio, e.video]) {
      el.play()?.catch?.(err => {
        if (err?.name !== 'NotAllowedError') return;
        e.primed = false; // not a gesture after all (a swipe): the next tap
        for (const type of GESTURES) addEventListener(type, prime, true);
      });
    }
  }
  if (pool.every(e => e.primed)) for (const type of GESTURES) removeEventListener(type, prime, true);
}

// Remembered on the device (kj.call): microphone and camera as last chosen
// (unset before the first choice), and whether a game with other people
// proposes the call (Instellingen, Bellen voorstellen) or puts us in it by
// itself (Automatisch meebellen: off, and unset until the first time we
// call, which asks).
function prefs() {
  const p = store.json('call', {});
  return { mic: p.mic, cam: p.cam, ask: p.ask !== false, auto: p.auto };
}
const remember = patch => store.setJSON('call', { ...store.json('call', {}), ...patch });

// Hearing and seeing the others takes a connection; a microphone or camera
// of our own also the devices, which some browsers do not offer a page.
export const supported = () => !!window.RTCPeerConnection;
const devices = () => !!navigator.mediaDevices?.getUserMedia;
export const inCall = () => !!me;

// The other people at the table who are there now.
function others(st = s) {
  if (!st) return [];
  return st.players.flatMap((p, seat) => (seat !== st.you && p && !p.bot && p.connected ? [{ p, seat }] : []));
}

// Calling makes sense: someone else is at the table, or we are in a call.
export const possible = () => !!me || others().length > 0;

// ---------- state from the server ----------

// Every update as it arrives: who is in the call decides the connections.
export function state(next) {
  const prev = s;
  s = next;
  if (prev?.code !== next.code) seen.clear();
  for (const [seat, p] of next.players.entries()) {
    const id = p?.call?.id;
    if (!id || seat === next.you || seen.has(id)) continue;
    seen.add(id);
    // A newcomer to the call, not a call we found on arrival.
    if (prev?.code === next.code && !prev.players[seat]?.call) toast(`${p.name} belt mee`, { ms: 2200 });
  }
  reconcile();
  arrive();
  refresh();
}

// A (re)join of the room: a call goes on with a session of its own, as the
// server ended the one of the old connection.
export function joined() {
  if (!me) return;
  for (const p of [...peers.values()]) closePeer(p);
  me.id = newId();
  sendCall();
}

function reconcile() {
  const mine = s?.players[s.you]?.call;
  const live = !!me && mine?.id === me.id;
  if (me && (!mine || mine.id !== me.id || mine.mic !== micOn || mine.cam !== camOn) && Date.now() - me.sentAt > RESEND_MS) sendCall();
  const want = new Map();
  if (live) {
    s.players.forEach((p, seat) => {
      if (seat !== s.you && p?.call && p.connected) want.set(p.call.id, { seat, ...p.call });
    });
  }
  for (const [id, p] of [...peers]) if (!want.has(id)) closePeer(p);
  for (const [id, c] of want) {
    const p = peers.get(id) || addPeer(id, c.seat);
    p.seat = c.seat;
    p.mic = c.mic;
    p.cam = c.cam;
  }
}

// At a table with other people, once per room. With Automatisch meebellen
// in the call by ourselves, already in the lobby, with the microphone and
// camera as last chosen; never chosen yet, the sheet asks for them, while
// we already hear and see the others. Without it the call is proposed at
// the start of a game (Bellen voorstellen). Neither after we were in the
// call in this room: hung up, we stay out.
function arrive() {
  if (me || !s || s.training || asked === s.code || !others().length) return;
  const p = prefs();
  if (p.auto) {
    asked = s.code;
    join(!!p.mic, !!p.cam);
    if (p.mic === undefined && p.cam === undefined && devices()) openSheet();
  } else if (s.phase !== 'lobby') {
    asked = s.code;
    if (p.ask) openSheet({ proposal: true });
  }
}

// ---------- joining, switching, hanging up ----------

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');

function sendCall() {
  if (!me) return;
  me.sentAt = Date.now();
  app.send({ t: 'call', id: me.id, mic: micOn, cam: camOn });
}

// In the call at once, hearing and seeing the others; the microphone and
// camera wanted follow once the browser gives them.
function join(wantMic, wantCam) {
  if (me) return;
  if (s) asked = s.code;
  me = { id: newId(), sentAt: 0 };
  sendCall();
  sound.play('join');
  refresh();
  if ((wantMic || wantCam) && devices()) setDevices({ mic: wantMic, cam: wantCam });
}

export function hangup(tell = true) {
  if (me) {
    for (const p of [...peers.values()]) closePeer(p);
    stopTracks({ mic, cam });
    mic = cam = null;
    micOn = camOn = false;
    self.srcObject = null;
    me = null;
    asking = false; // a question still open is for the session that ended
    if (tell) app.send({ t: 'call', id: '' });
  }
  // iOS: the game's audio session again, once the microphone has stopped
  // (devices still being asked for are stopped as they come).
  refresh();
}

// Leaving the room: the server ends the call with the seat. Back at the
// table, we come into the call by ourselves again, or it is proposed again.
export function leave() {
  hangup(false);
  s = null;
  asked = '';
  refresh();
}

// Switches the microphone and the camera (undefined: left as it is). What
// is switched on and not there yet is asked for, both in one question to
// the browser. Remembered for the next game; a device that could not be
// had (but for one in use) as off, also when we hung up meanwhile, so the
// next table does not ask for it by itself.
async function setDevices(want) {
  const cur = me;
  if (!cur || busy === cur) return;
  busy = cur;
  const askMic = !!want.mic && mic?.readyState !== 'live';
  const askCam = !!want.cam && cam?.readyState !== 'live';
  asking = askMic;
  refresh(); // iOS: the session that records, before the microphone is asked
  const got = await acquire(askMic, askCam);
  if (busy === cur) {
    busy = null;
    asking = false;
  }
  if (got.without.mic && want.mic) remember({ mic: false });
  if (got.without.cam && want.cam) remember({ cam: false });
  if (me !== cur) { // hung up, or left the table, meanwhile
    stopTracks(got);
    return;
  }
  if (got.errs.mic || got.errs.cam) mediaError(got.errs);
  // A track that ended while the other was still asked for fired its
  // `ended` before watchEnd: it stays off.
  if (askMic) watchEnd(mic = live(got.mic));
  if (askCam) watchEnd(cam = live(got.cam));
  if (want.cam === false && cam) {
    cam.stop(); // the camera's light goes off
    cam = null;
  }
  if (want.mic !== undefined) {
    micOn = want.mic && !!mic;
    if (mic) mic.enabled = micOn;
    if (!got.without.mic) remember({ mic: want.mic });
  }
  camOn = !!cam;
  if (want.cam !== undefined && !got.without.cam) remember({ cam: want.cam });
  attachAll();
  sendCall();
  refresh();
}

const live = track => (track?.readyState === 'live' ? track : null);

// The microphone and camera wanted, in one question to the browser; when
// that is refused at once (a setting blocks one of them), each on its own,
// so one of the two may still come (the microphone allowed, the camera
// blocked). Refused at the question (Safari asks for both together), only
// one already allowed is asked for again. What cannot be had comes back
// (errs, by its error's name; without: anything but a device in use, which
// may be free next time); the call goes on without it: the others are
// still heard and seen.
async function acquire(audio, video) {
  const out = { mic: null, cam: null, errs: {}, without: {} };
  let errs = {};
  const get = async (a, v) => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: a && AUDIO, video: v && VIDEO });
      out.mic ||= st.getAudioTracks()[0] || null;
      out.cam ||= st.getVideoTracks()[0] || null;
      return true;
    } catch (e) {
      if (a) errs.mic = e?.name || 'Error';
      if (v) errs.cam = e?.name || 'Error';
      return false;
    }
  };
  if (!audio && !video) return out;
  const t0 = performance.now();
  if (!(await get(audio, video)) && audio && video) {
    const answered = errs.mic === 'NotAllowedError' && performance.now() - t0 > ANSWERED_MS;
    const again = answered ? await allowed() : { mic: true, cam: true };
    const was = errs;
    errs = {};
    if (again.mic) await get(true, false);
    else errs.mic = was.mic;
    if (again.cam) await get(false, true);
    else errs.cam = was.cam;
  }
  const gone = name => !!name && name !== 'NotReadableError' && name !== 'AbortError';
  out.errs = errs;
  out.without = { mic: gone(errs.mic), cam: gone(errs.cam) };
  return out;
}

// Which of the two the browser already allows this page, where it says so.
async function allowed() {
  const state = async name => {
    try {
      return (await navigator.permissions.query({ name })).state === 'granted';
    } catch {
      return false; // a browser that does not know the name
    }
  };
  return { mic: await state('microphone'), cam: await state('camera') };
}

// One toast for what failed: no permission, no device, or a device in use.
function mediaError({ mic: m, cam: c }) {
  const kind = m && c ? 'both' : m ? 'mic' : 'cam';
  const name = m || c;
  const what = { mic: 'de microfoon', cam: 'de camera', both: 'microfoon en camera' }[kind];
  let text = `Geen toegang tot ${what}`;
  let sub = 'Sta het toe in de instellingen van je browser.' + (m ? ' Je hoort de anderen wel.' : '');
  if (name === 'NotFoundError') {
    text = { mic: 'Geen microfoon gevonden', cam: 'Geen camera gevonden', both: 'Geen microfoon en camera gevonden' }[kind];
    sub = '';
  } else if (name === 'NotReadableError' || name === 'AbortError') {
    text = { mic: 'De microfoon is in gebruik', cam: 'De camera is in gebruik', both: 'Microfoon en camera zijn in gebruik' }[kind];
    sub = 'Misschien gebruikt een ander programma ze.';
  } else if (name !== 'NotAllowedError') {
    sub = `Fout: ${name}.`; // something else: the name tells what
  }
  sound.play('error');
  toast(text, { sub, kind: 'error', ms: 5000 });
}

// A track that ends by itself (the device unplugged or taken by another
// app, the permission withdrawn) is switched off as with its button: the
// others see the face again, and a tap asks for the device anew.
function watchEnd(track) {
  track?.addEventListener('ended', () => {
    if (!me || (track !== mic && track !== cam)) return;
    if (track === mic) {
      mic = null;
      micOn = false;
    } else {
      cam = null;
      camOn = false;
    }
    attachAll();
    sendCall();
    refresh();
  });
}

function stopTracks({ mic: m, cam: c }) {
  m?.stop();
  c?.stop();
}

// ---------- connections ----------

function addPeer(id, seat) {
  let e = pool.find(x => !x.peer);
  if (!e) { // not at a table of four
    pool.push(e = pair());
    for (const type of GESTURES) addEventListener(type, prime, true);
  }
  const p = {
    id, seat, offerer: me.id < id, pc: null, mic: false, cam: false, live: false, up: false, failed: false, tries: 0, timer: 0,
    audio: e.audio, video: e.video, el: e,
  };
  e.peer = p;
  peers.set(id, p);
  if (p.offerer) offer(p);
  else wait(p, null);
  return p;
}

function closePeer(p) {
  clearTimeout(p.timer);
  p.pc?.close();
  p.pc = null;
  p.audio.srcObject = null;
  p.video.srcObject = null;
  p.video.remove(); // out of its ring; the pair stays for the next one
  p.el.peer = null;
  peers.delete(p.id);
}

function newPC(p) {
  p.pc?.close();
  const pc = new RTCPeerConnection({ iceServers: ICE });
  p.pc = pc;
  p.up = false;
  pc.ontrack = e => onTrack(p, e.track);
  pc.onconnectionstatechange = () => onState(p, pc);
  wait(p, pc);
  return pc;
}

// A connection that is not up within CONNECT_MS has failed. The one who
// answers waits for offers: its timer only marks the seat.
function wait(p, pc) {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    if (p.pc === pc && !p.up) failed(p, pc);
  }, CONNECT_MS);
}

// The lower session id offers, so the two never offer at once. The
// transceivers are there from the start: switching the microphone or
// camera later only swaps tracks, without a new offer.
async function offer(p) {
  const pc = newPC(p);
  try {
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv', sendEncodings: [{ maxBitrate: VIDEO_BITRATE }] });
    attach(p);
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    if (p.pc === pc) signal(p, pc.localDescription);
  } catch {
    failed(p, pc);
  }
}

export async function onRTC(m) {
  const p = peers.get(m.from);
  if (!me || !p || !m.desc) return;
  if (m.desc.type === 'offer' && !p.offerer) {
    const pc = newPC(p); // every offer starts afresh
    p.failed = false;
    try {
      await pc.setRemoteDescription(m.desc);
      for (const t of pc.getTransceivers()) t.direction = 'sendrecv';
      attach(p);
      await pc.setLocalDescription(await pc.createAnswer());
      capVideo(pc);
      await gathered(pc);
      if (p.pc === pc) signal(p, pc.localDescription);
    } catch {
      failed(p, pc);
    }
  } else if (m.desc.type === 'answer' && p.offerer && p.pc?.signalingState === 'have-local-offer') {
    const pc = p.pc;
    try {
      await pc.setRemoteDescription(m.desc);
    } catch {
      failed(p, pc);
    }
  }
}

// The one who answers gets its transceivers from the offer, so its video
// ceiling is set once they are negotiated. It holds when the track changes.
function capVideo(pc) {
  for (const t of pc.getTransceivers()) {
    if (t.receiver.track?.kind !== 'video') continue;
    const prm = t.sender.getParameters();
    if (!prm.encodings?.length) continue;
    prm.encodings[0].maxBitrate = VIDEO_BITRATE;
    t.sender.setParameters(prm).catch(() => {});
  }
}

// One description with every address found (no trickling): the server
// allows few messages a second.
function signal(p, desc) {
  app.send({ t: 'rtc', to: p.id, desc: { type: desc.type, sdp: desc.sdp } });
}

function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(done => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      done();
    };
    const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(finish, GATHER_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

function onState(p, pc) {
  if (p.pc !== pc) return;
  const st = pc.connectionState;
  if (st === 'connected') {
    clearTimeout(p.timer);
    p.up = true;
    p.failed = false;
    p.tries = 0;
  } else if (st === 'failed') {
    failed(p, pc);
  } else if (st === 'disconnected') {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (p.pc === pc && pc.connectionState !== 'connected') failed(p, pc);
    }, LOST_MS);
  }
  refresh();
}

// The offerer tries again a few times; after that, and for the one who
// answers until a new offer comes, the seat says there is no connection.
function failed(p, pc) {
  if (p.pc !== pc || !peers.has(p.id)) return;
  clearTimeout(p.timer);
  pc?.close();
  p.pc = null;
  p.up = false;
  p.live = false;
  if (p.offerer && p.tries < RETRIES) {
    p.tries++;
    p.timer = setTimeout(() => { if (peers.get(p.id) === p && !p.pc) offer(p); }, 2000 * p.tries);
  } else {
    p.failed = true;
  }
  refresh();
}

function onTrack(p, track) {
  if (track.kind === 'audio') {
    p.audio.srcObject = new MediaStream([track]);
    play(p.audio);
    return;
  }
  p.video.srcObject = new MediaStream([track]);
  track.addEventListener('mute', () => { p.live = false; refresh(); });
  // Pictures again: shown with the next one.
  track.addEventListener('unmute', () => {
    if (p.video.requestVideoFrameCallback) p.video.requestVideoFrameCallback(p.el.shown);
    else p.el.shown();
  });
  play(p.video);
  refresh(); // into its ring, to wait there for pictures
}

// Our tracks on a connection: the microphone and the camera while they are
// on. Muted, the microphone is taken off too: no packets of silence.
function attach(p) {
  for (const t of p.pc?.getTransceivers() || []) {
    const kind = t.receiver.track?.kind;
    const track = kind === 'audio' ? (micOn ? mic : null) : kind === 'video' ? cam : null;
    if (t.sender.track !== track) t.sender.replaceTrack(track).catch(() => {});
  }
}

function attachAll() {
  for (const p of peers.values()) attach(p);
  if (cam) {
    if (self.srcObject?.getVideoTracks()[0] !== cam) self.srcObject = new MediaStream([cam]);
    play(self);
  } else {
    self.srcObject = null;
  }
}

// ---------- playing ----------

// A browser may refuse to play sound before a tap on the page: the next
// tap plays everything of the call.
function play(el) {
  el.play?.()?.catch?.(e => {
    if (e?.name === 'NotAllowedError') blocked();
  });
}

function blocked() {
  if (unlocking) return;
  unlocking = true;
  tellBlocked();
  const go = e => {
    if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
    for (const type of GESTURES) removeEventListener(type, go, true);
    unlocking = false;
    told = false;
    unlockMedia();
  };
  for (const type of GESTURES) addEventListener(type, go, true);
}

// Said once someone in the call has the microphone on: in a call where
// nobody talks there is nothing to hear yet.
function tellBlocked() {
  if (!unlocking || told || ![...peers.values()].some(p => p.mic)) return;
  told = true;
  toast('Tik ergens om de anderen te horen', { ms: 4000 });
}

function unlockMedia() {
  for (const p of peers.values()) {
    if (p.audio.srcObject) play(p.audio);
    if (p.video.srcObject) play(p.video);
  }
}

// ---------- on screen ----------

// The video a seat holds, and whether it shows: ours while the camera is
// on; another's while theirs is on, shown once pictures arrive. Until then
// it waits in the ring, out of sight: Safari plays a video in the page,
// not one outside it.
function videoFor(seat) {
  if (!s) return {};
  if (seat === s.you) return me && camOn ? { v: self, on: true } : {};
  for (const p of peers.values()) {
    if (p.seat === seat && p.cam && p.up && p.video.srcObject) return { v: p.video, on: p.live };
  }
  return {};
}

// Makes el (a seat's ring, a lobby avatar) show seat in the call: its
// video in place of the face, and a mark in it while the microphone is
// off, or when no connection could be made.
export function decorate(el, seat) {
  rings.add(el);
  el.dataset.callSeat = seat;
  paint(el);
}

function paint(el) {
  // Only the screen in view shows videos: one element cannot be in two places.
  const screen = el.closest('.screen');
  if (screen && screen.id !== document.body.dataset.screen) return;
  const seat = Number(el.dataset.callSeat);
  const { v, on = false } = videoFor(seat);
  const cur = el.querySelector(':scope > .call-video');
  if (cur && cur !== v) cur.remove();
  if (v && cur !== v) {
    el.prepend(v); // under the marks on the ring (dealer, trump, call)
    play(v);
  }
  el.classList.toggle('cam', on);
  const c = s?.players[seat]?.call;
  const peer = seat === s?.you ? null : [...peers.values()].find(p => p.seat === seat);
  const lost = !!peer?.failed;
  let tag = el.querySelector(':scope > .call-tag');
  if (!c || (c.mic && !lost)) {
    tag?.remove();
    return;
  }
  if (!tag) el.append(tag = h('span', { class: 'call-tag' }));
  const key = lost ? 'lost' : 'off';
  if (tag.dataset.key === key) return;
  tag.dataset.key = key;
  tag.className = 'call-tag ' + key;
  tag.title = lost ? 'Belt mee, maar er is geen verbinding' : 'Belt mee, microfoon uit';
  tag.replaceChildren(icon(lost ? 'noLink' : 'micOff'));
}

// Registers el as a place for the call buttons.
export function dock(el) {
  if (docks.has(el)) return;
  docks.add(el);
  paintDock(el);
}

// A call button: a pictogram, with its label beside it where there is
// room (the lobby: `text`).
function toolBtn(name, ic, label, title, fn, { pressed = null, disabled = false, text = false } = {}) {
  const b = h('button', {
    class: 'tb tb-' + name + (text ? ' labeled' : ''), type: 'button', title, 'aria-label': label, disabled,
    onclick: () => { sound.play('click'); fn(); },
  }, icon(ic), text ? h('span', { text: label }) : null);
  if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
  return b;
}

function paintDock(el) {
  const show = supported() && possible();
  el.hidden = !show;
  // Its row makes room for the buttons (the game's stylesheet).
  if (show) el.parentElement.dataset.call = me ? 'in' : 'out';
  else delete el.parentElement.dataset.call;
  if (!show) {
    el.replaceChildren();
    delete el.dataset.key;
    return;
  }
  const switching = !!me && busy === me;
  const key = JSON.stringify([!!me, switching, micOn, camOn]);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.classList.toggle('in-call', !!me);
  const text = el.classList.contains('lb-call');
  if (!me) {
    el.replaceChildren(toolBtn('call', 'phone', 'Bellen', 'Bellen met de anderen aan tafel', () => openSheet(), { text }));
    return;
  }
  // Without the devices (a browser that offers a page none) only hanging up.
  el.replaceChildren(...(devices() ? [
    toolBtn('mic', micOn ? 'mic' : 'micOff', 'Microfoon', micOn ? 'Microfoon aan' : 'Microfoon uit', () => setDevices({ mic: !micOn }), { pressed: micOn, disabled: switching }),
    toolBtn('cam', camOn ? 'cam' : 'camOff', 'Camera', camOn ? 'Camera aan' : 'Camera uit', () => setDevices({ cam: !camOn }), { pressed: camOn, disabled: switching }),
  ] : []), toolBtn('hangup', 'hangup', 'Ophangen', 'Ophangen: het gesprek verlaten', () => hangup(), { text }));
}

// Repaints everything of the call on screen, and sets the iOS audio
// session (sound.js): one that plays and records from the first time we
// record or ask for the microphone, or someone else in the call has it on,
// until we hang up (switching it back and forth as someone mutes would
// break into the sound, and move a headset between its two modes); before
// that the game's, mixed with the user's own music and quiet with the
// silent switch, also while we only listen to a call where nobody talks.
function refresh() {
  for (const el of [...rings]) {
    if (el.isConnected) paint(el);
    else rings.delete(el);
  }
  for (const el of [...docks]) {
    if (el.isConnected) paintDock(el);
    else docks.delete(el);
  }
  const talking = !!s && s.players.some((p, seat) => seat !== s.you && p?.call?.mic && p.connected);
  held = !!me && (held || !!mic || asking || talking);
  sound.setCall(held);
  if (talking) tellBlocked();
}

// ---------- the sheet ----------

const listNames = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`);

// Not in the call (proposed at the start of a game, or the Bellen button):
// join it, with the microphone and camera wanted (a browser without them:
// to listen); the first time also whether to come into the call by
// ourselves from now on (Automatisch meebellen, off). In the call by
// ourselves, before any choice of them: switch them on? The choices are
// remembered. In the call the buttons switch and hang up.
export function openSheet({ proposal = false } = {}) {
  if (!s) return;
  const p = prefs();
  const pick = { mic: p.mic ?? true, cam: p.cam ?? true, auto: false };
  const names = others().map(o => o.p.name);
  const calling = s.players.flatMap((q, seat) => (seat !== s.you && q?.call ? [q.name] : []));
  const inside = !!me;
  const own = devices();
  const first = !inside && p.auto === undefined;
  // In the call the answer switches on what is chosen, or leaves both off.
  const answer = () => (!inside ? 'Meebellen' : pick.mic || pick.cam ? 'Aanzetten' : 'Uit laten');
  const glyph = () => (!inside ? 'phone' : pick.mic ? 'mic' : pick.cam ? 'cam' : 'micOff');
  let pic = icon(glyph());
  const word = h('span', { text: answer() });
  const set = (k, on) => {
    pick[k] = on;
    word.textContent = answer();
    const next = icon(glyph());
    pic.replaceWith(next);
    pic = next;
  };
  const text = inside ? 'Je zit in het gesprek: je hoort en ziet wie de microfoon of camera aan heeft. Met die van jou aan horen en zien de anderen jou ook.'
    : (calling.length ? `${listNames(calling)} ${calling.length === 1 ? 'belt' : 'bellen'} al.`
      : `${listNames(names)} ${names.length === 1 ? 'zit' : 'zitten'} ook aan tafel.`)
      + (own ? ' Bel mee met geluid, en met beeld als je wilt.' : ' Deze browser deelt geen microfoon of camera: je kunt wel meeluisteren en meekijken.');
  const m = panels.openModal({
    id: 'call', title: inside ? 'Microfoon en camera' : 'Meebellen?', cls: 'm-call', body: [
      // In short landscape this part scrolls, and the answers stay in view
      // under it, the first time with the question whether to call by
      // ourselves (app.css).
      h('div', { class: 'call-scroll' },
        h('p', { text }),
        own ? panels.toggleRow('Microfoon', 'De anderen horen je', pick.mic, on => set('mic', on)) : null,
        own ? panels.toggleRow('Camera', 'Je beeld staat op je plaats aan tafel', pick.cam, on => set('cam', on)) : null,
        h('p', { class: 'call-note', text: 'Beeld en geluid gaan rechtstreeks van toestel naar toestel, niet via de server.'
          + (own && document.body.dataset.screen === 'game' ? ' Tijdens het spel zet je ze aan en uit met de knoppen rechtsonder.' : '')
          + (inside ? ' Automatisch meebellen zet je uit bij Instellingen.' : '') })),
      h('div', { class: 'call-answer' },
        first ? panels.toggleRow('Automatisch meebellen', 'Voortaan zit je bij een spel met andere spelers meteen in het gesprek', pick.auto, on => set('auto', on)) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, inside || proposal ? 'Niet nu' : 'Annuleren'),
          h('button', {
            class: 'btn btn-go', type: 'button',
            onclick: () => {
              m.close(true);
              if (own) remember({ mic: pick.mic, cam: pick.cam });
              if (first) remember({ auto: pick.auto });
              if (me) setDevices({ mic: pick.mic, cam: pick.cam });
              else join(pick.mic, pick.cam);
            },
          }, pic, word))),
    ],
  });
}
