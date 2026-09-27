import * as React from "react";
import { MAX_DURATION_S, getAudioContextCtor, pickRecorderMimeType } from "./audioUtils";

export type RecorderStatus = "idle" | "requesting" | "recording";

interface Options {
  onRecorded: (blob: Blob) => void;
  onError: (message: string) => void;
}

/**
 * Microphone recorder with a live input level and an auto-stop at
 * MAX_DURATION_S. Browser voice processing (noise suppression, echo
 * cancellation, auto gain) is switched off — it would filter out exactly the
 * sounds we're trying to capture.
 */
export function useFartRecorder({ onRecorded, onError }: Options) {
  const [status, setStatus] = React.useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [level, setLevel] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const cancelledRef = React.useRef(false);
  const callbacks = React.useRef({ onRecorded, onError });
  callbacks.current = { onRecorded, onError };

  const teardown = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const stop = React.useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = React.useCallback(async () => {
    if (recorderRef.current) return;
    cancelledRef.current = false;
    setStatus("requesting");
    setElapsedMs(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      setStatus("idle");
      callbacks.current.onError(
        "Geen toegang tot de microfoon. Sta microfoongebruik toe in je browser.",
      );
      return;
    }
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    const mimeType =
      typeof MediaRecorder.isTypeSupported === "function"
        ? pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t))
        : undefined;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined,
      );
    } catch {
      teardown();
      setStatus("idle");
      callbacks.current.onError("Opnemen wordt niet ondersteund in deze browser.");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      teardown();
      setStatus("idle");
      if (cancelledRef.current) return;
      const type = recorder.mimeType || mimeType || chunks[0]?.type || "audio/webm";
      callbacks.current.onRecorded(new Blob(chunks, { type }));
    };
    recorderRef.current = recorder;

    // Live level meter + auto-stop.
    const Ctor = getAudioContextCtor();
    let analyser: AnalyserNode | null = null;
    if (Ctor) {
      try {
        const ctx = new Ctor();
        ctxRef.current = ctx;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
      } catch {
        analyser = null;
      }
    }
    const buf = new Float32Array(1024);
    const startedAt = performance.now();
    const loop = () => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      if (analyser) {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        // RMS mapped onto a rough 0..1 scale that reacts to quiet sounds too.
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      }
      if (elapsed >= MAX_DURATION_S * 1000) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    recorder.start(250);
    setStatus("recording");
    rafRef.current = requestAnimationFrame(loop);
  }, [stop, teardown]);

  // Abandon an in-flight recording when the component unmounts.
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      recorderRef.current = null;
      teardown();
    },
    [teardown],
  );

  return { status, elapsedMs, level, start, stop };
}
