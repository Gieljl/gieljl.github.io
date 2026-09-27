import {
  MAX_DURATION_S,
  MAX_RAW_BYTES,
  PEAK_COUNT,
  base64ToBytes,
  bytesToBase64,
  computePeaks,
  downmix,
  encodeWav,
  needsTranscode,
  pickRecorderMimeType,
  pickWavSampleRate,
  resample,
} from "./audioUtils";

describe("pickRecorderMimeType", () => {
  it("prefers portable AAC and falls back to Opus", () => {
    expect(pickRecorderMimeType(() => true)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickRecorderMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
    expect(
      pickRecorderMimeType(() => {
        throw new Error("boom");
      }),
    ).toBeUndefined();
  });
});

describe("needsTranscode", () => {
  const ok = { sizeBytes: 50_000, durationS: 3 };

  it("keeps small, short clips in portable formats", () => {
    expect(needsTranscode({ ...ok, mimeType: "audio/mpeg" })).toBe(false);
    expect(needsTranscode({ ...ok, mimeType: "audio/mp4" })).toBe(false);
    expect(needsTranscode({ ...ok, mimeType: "audio/wav" })).toBe(false);
  });

  it("re-encodes WebM/Ogg/Opus and unknown types", () => {
    expect(needsTranscode({ ...ok, mimeType: "audio/webm;codecs=opus" })).toBe(true);
    expect(needsTranscode({ ...ok, mimeType: "audio/ogg" })).toBe(true);
    expect(needsTranscode({ ...ok, mimeType: "audio/mp4;codecs=opus" })).toBe(true);
    expect(needsTranscode({ ...ok, mimeType: "" })).toBe(true);
  });

  it("shrinks oversized WAV files but keeps compact ones", () => {
    const stereo44k = 44 + 44100 * 2 * 2 * 2.5;
    expect(needsTranscode({ mimeType: "audio/wav", sizeBytes: stereo44k, durationS: 2.5 })).toBe(true);
    const mono22k = 44 + 22050 * 2 * 2.5;
    expect(needsTranscode({ mimeType: "audio/wav", sizeBytes: mono22k, durationS: 2.5 })).toBe(false);
  });

  it("re-encodes clips that are too big or too long", () => {
    expect(needsTranscode({ mimeType: "audio/mpeg", sizeBytes: MAX_RAW_BYTES + 1, durationS: 3 })).toBe(true);
    expect(needsTranscode({ mimeType: "audio/mpeg", sizeBytes: 1000, durationS: MAX_DURATION_S + 5 })).toBe(true);
  });
});

describe("pickWavSampleRate", () => {
  it("fits the byte budget for the longest clip", () => {
    const rate = pickWavSampleRate(MAX_DURATION_S);
    expect(44 + rate * 2 * MAX_DURATION_S).toBeLessThanOrEqual(MAX_RAW_BYTES);
    expect(rate).toBeGreaterThanOrEqual(8000);
  });

  it("caps short clips at 22.05 kHz", () => {
    expect(pickWavSampleRate(1)).toBe(22050);
  });
});

describe("downmix", () => {
  it("averages channels", () => {
    const out = downmix([Float32Array.from([1, 0, -1]), Float32Array.from([0, 0, 1])]);
    expect(Array.from(out)).toEqual([0.5, 0, 0]);
  });

  it("passes mono through and handles no channels", () => {
    const mono = Float32Array.from([0.1, 0.2]);
    expect(downmix([mono])).toBe(mono);
    expect(downmix([]).length).toBe(0);
  });
});

describe("resample", () => {
  it("averages windows when downsampling", () => {
    const out = resample(Float32Array.from([1, 3, 5, 7]), 4, 2);
    expect(Array.from(out)).toEqual([2, 6]);
  });

  it("keeps length proportional to the rate change", () => {
    const input = new Float32Array(48000);
    expect(resample(input, 48000, 15000).length).toBe(15000);
  });

  it("returns the input when rates match", () => {
    const input = Float32Array.from([1, 2]);
    expect(resample(input, 8000, 8000)).toBe(input);
  });
});

describe("encodeWav", () => {
  it("writes a valid 16-bit mono PCM header and clamps samples", () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 2]), 8000);
    const view = new DataView(wav.buffer);
    const ascii = (o: number) => String.fromCharCode(...Array.from(wav.slice(o, o + 4)));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(ascii(36)).toBe("data");
    expect(wav.length).toBe(44 + 8);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe("computePeaks", () => {
  it("normalises bucket maxima to the loudest bucket", () => {
    const samples = Float32Array.from([0.1, -0.2, 0.4, -0.8]);
    expect(computePeaks(samples, 2)).toEqual([0.25, 1]);
  });

  it("returns the requested number of buckets, even for silence or short input", () => {
    expect(computePeaks(new Float32Array(1000))).toEqual(new Array(PEAK_COUNT).fill(0));
    expect(computePeaks(Float32Array.from([0.5]), 4)).toHaveLength(4);
    expect(computePeaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});

describe("base64", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
