// Audio helpers for "Rate My Scheet".
//
// Audio is stored as base64 in a Firestore document (no Firebase Storage
// needed), so every clip must stay well under Firestore's 1 MiB document
// limit. Recordings and uploads are decoded in the browser to measure them
// and draw a waveform; anything too big, too long or in a format that not
// every browser can play (WebM/Ogg/Opus from Chrome and Firefox recorders)
// is re-encoded to a small mono WAV, which plays everywhere.

/** Longest clip we keep; longer uploads are trimmed. */
export const MAX_DURATION_S = 20;
/** Slack for recorders that overshoot their auto-stop by a few frames. */
const DURATION_SLACK_S = 0.5;
/** Shortest clip we accept. */
export const MIN_DURATION_S = 0.2;
/** Raw byte budget per clip (base64 adds a third, the rules allow 900 000 chars). */
export const MAX_RAW_BYTES = 600_000;
export const PEAK_COUNT = 64;

const WAV_HEADER_BYTES = 44;
const MIN_WAV_RATE = 8000;
const MAX_WAV_RATE = 22050;

/** Containers every major browser (incl. iOS Safari) plays natively. */
const PORTABLE_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);
const NON_PORTABLE_CODECS = /opus|vorbis|flac/i;

/** Recorder formats in order of preference: AAC first because it's portable. */
export const RECORDER_MIME_PREFERENCE = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function pickRecorderMimeType(
  isTypeSupported: (type: string) => boolean,
): string | undefined {
  return RECORDER_MIME_PREFERENCE.find((t) => {
    try {
      return isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

export function baseMimeType(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** Whether a clip must be re-encoded before it is stored. */
export function needsTranscode(input: {
  mimeType: string;
  sizeBytes: number;
  durationS: number;
}): boolean {
  if (input.durationS > MAX_DURATION_S + DURATION_SLACK_S) return true;
  if (input.sizeBytes > MAX_RAW_BYTES) return true;
  const base = baseMimeType(input.mimeType);
  if (!PORTABLE_TYPES.has(base)) return true;
  if (NON_PORTABLE_CODECS.test(input.mimeType)) return true;
  // Uncompressed CD-quality/stereo WAV is several times bigger than our
  // mono re-encode, so shrink it rather than make every listener download it.
  const isWav = base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave";
  return isWav && input.sizeBytes > WAV_HEADER_BYTES + 2 * MAX_WAV_RATE * input.durationS * 1.1;
}

/** Highest WAV sample rate (16-bit mono) that fits the byte budget. */
export function pickWavSampleRate(durationS: number): number {
  const fit = Math.floor((MAX_RAW_BYTES - WAV_HEADER_BYTES) / (2 * Math.max(durationS, 0.001)));
  return Math.max(MIN_WAV_RATE, Math.min(MAX_WAV_RATE, fit));
}

/** Averages all channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Resamples by averaging every source sample that falls inside an output
 * sample's window (a box filter, which also acts as a cheap low-pass when
 * downsampling). Upsampling falls back to nearest-neighbour.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(WAV_HEADER_BYTES + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/**
 * Splits the clip into `count` buckets and returns each bucket's loudest
 * sample, scaled so the loudest bucket is 1. Rounded to keep documents small.
 */
export function computePeaks(samples: Float32Array, count = PEAK_COUNT): number[] {
  if (samples.length === 0) return new Array(count).fill(0);
  const raw: number[] = [];
  for (let b = 0; b < count; b++) {
    const start = Math.floor((b * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((b + 1) * samples.length) / count));
    let max = 0;
    for (let i = start; i < end && i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    raw.push(max);
  }
  const loudest = Math.max(...raw);
  if (loudest === 0) return raw.map(() => 0);
  return raw.map((v) => Math.round((v / loudest) * 100) / 100);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Browser-only helpers
// ---------------------------------------------------------------------------

type AudioContextCtor = typeof AudioContext;

export function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

export function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function decodeAudio(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Older Safari only supports the callback form of decodeAudioData.
  return new Promise((resolve, reject) => {
    const maybePromise = ctx.decodeAudioData(data, resolve, reject);
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

export interface PreparedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  peaks: number[];
  /** True when the original was longer than MAX_DURATION_S. */
  trimmed: boolean;
}

export class AudioPrepareError extends Error {}

/** Decodes, measures and (when needed) re-encodes a recording or upload. */
export async function prepareAudio(blob: Blob): Promise<PreparedAudio> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new AudioPrepareError("Je browser ondersteunt geen audio-verwerking.");

  const data = await blob.arrayBuffer();
  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeAudio(ctx, data);
  } catch {
    throw new AudioPrepareError("Dit bestand kunnen we niet afspelen. Probeer mp3, m4a of wav.");
  } finally {
    ctx.close?.().catch(() => undefined);
  }

  if (decoded.duration < MIN_DURATION_S) {
    throw new AudioPrepareError("Te kort! Zelfs een piepje duurt langer.");
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
  const mono = downmix(channels);

  if (!needsTranscode({ mimeType: blob.type, sizeBytes: blob.size, durationS: decoded.duration })) {
    return {
      blob,
      mimeType: baseMimeType(blob.type),
      durationMs: Math.round(decoded.duration * 1000),
      peaks: computePeaks(mono),
      trimmed: false,
    };
  }

  const keep = Math.min(mono.length, Math.floor(MAX_DURATION_S * decoded.sampleRate));
  const clip = mono.subarray(0, keep);
  const durationS = keep / decoded.sampleRate;
  const rate = pickWavSampleRate(durationS);
  const wav = encodeWav(resample(clip, decoded.sampleRate, rate), rate);
  return {
    blob: new Blob([wav], { type: "audio/wav" }),
    mimeType: "audio/wav",
    durationMs: Math.round(durationS * 1000),
    peaks: computePeaks(clip),
    trimmed: keep < mono.length,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
