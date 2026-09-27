import * as React from "react";
import { Box, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { getFartAudioUrl } from "./scheetService";
import { formatDuration } from "./scheetModel";
import { SCHEET } from "./scheetStyle";

// Only one fart plays at a time: starting a new one pauses the previous.
let activeAudio: HTMLAudioElement | null = null;
function claimPlayback(audio: HTMLAudioElement) {
  if (activeAudio && activeAudio !== audio) activeAudio.pause();
  activeAudio = audio;
}

type Status = "idle" | "loading" | "playing" | "error";

interface Props {
  /** Remote fart id — audio is fetched from Firestore on demand. */
  fartId?: string;
  /** Local object URL (upload preview). Takes precedence over fartId. */
  localUrl?: string;
  peaks: number[];
  durationMs: number;
  /** Icon-only button, no waveform. */
  compact?: boolean;
  /** Fetch the audio as soon as the player mounts so the first tap is instant. */
  preload?: boolean;
}

export const FartPlayer: React.FC<Props> = ({
  fartId,
  localUrl,
  peaks,
  durationMs,
  compact,
  preload,
}) => {
  const [status, setStatus] = React.useState<Status>("idle");
  const [progress, setProgress] = React.useState(0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const sourceKey = localUrl ?? fartId ?? "";
  const sourceRef = React.useRef(sourceKey);

  const stopTicking = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const tick = React.useCallback(() => {
    const a = audioRef.current;
    if (a && a.duration && Number.isFinite(a.duration)) {
      setProgress(Math.min(1, a.currentTime / a.duration));
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const makeAudio = React.useCallback(
    (url: string) => {
      const a = new Audio(url);
      a.preload = "auto";
      a.onplay = () => {
        setStatus("playing");
        stopTicking();
        rafRef.current = requestAnimationFrame(tick);
      };
      a.onpause = () => {
        stopTicking();
        setStatus("idle");
      };
      a.onended = () => {
        stopTicking();
        setProgress(1);
        setStatus("idle");
      };
      a.onerror = () => {
        stopTicking();
        setStatus("error");
      };
      audioRef.current = a;
      return a;
    },
    [tick],
  );

  const resolveUrl = React.useCallback(async () => {
    if (localUrl) return localUrl;
    if (fartId) return getFartAudioUrl(fartId);
    throw new Error("Geen audio");
  }, [localUrl, fartId]);

  // New source: drop the old element and optionally warm up the new one.
  React.useEffect(() => {
    let cancelled = false;
    sourceRef.current = sourceKey;
    setProgress(0);
    setStatus("idle");
    if (preload) {
      resolveUrl()
        .then((url) => {
          if (!cancelled && !audioRef.current) makeAudio(url);
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }
    return () => {
      cancelled = true;
      stopTicking();
      const a = audioRef.current;
      if (a) {
        a.onpause = null;
        a.pause();
        if (activeAudio === a) activeAudio = null;
      }
      audioRef.current = null;
    };
  }, [sourceKey, preload, resolveUrl, makeAudio]);

  const start = (a: HTMLAudioElement) => {
    claimPlayback(a);
    if (a.ended || progress >= 1) a.currentTime = 0;
    a.play().catch((err: unknown) => {
      // iOS may refuse when the download outlived the tap; the audio is
      // loaded now, so the next tap plays straight away.
      const name = (err as { name?: string })?.name;
      setStatus(name === "NotAllowedError" ? "idle" : "error");
    });
  };

  const toggle = async () => {
    const existing = audioRef.current;
    if (existing) {
      if (!existing.paused) existing.pause();
      else start(existing);
      return;
    }
    const requested = sourceKey;
    setStatus("loading");
    try {
      const url = await resolveUrl();
      // The player may have moved on to another fart while we downloaded.
      if (sourceRef.current !== requested) return;
      start(audioRef.current ?? makeAudio(url));
    } catch {
      if (sourceRef.current === requested) setStatus("error");
    }
  };

  const icon =
    status === "loading" ? (
      <CircularProgress size={compact ? 18 : 28} sx={{ color: "#1d1a10" }} />
    ) : status === "playing" ? (
      <PauseRoundedIcon fontSize={compact ? "medium" : "large"} />
    ) : status === "error" ? (
      <ErrorOutlineIcon fontSize={compact ? "medium" : "large"} />
    ) : (
      <PlayArrowRoundedIcon fontSize={compact ? "medium" : "large"} />
    );

  const button = (
    <IconButton
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-label={status === "playing" ? "Pauzeer" : "Speel af"}
      sx={{
        flexShrink: 0,
        width: compact ? 40 : 60,
        height: compact ? 40 : 60,
        bgcolor: status === "error" ? SCHEET.red : SCHEET.green,
        color: "#1d1a10",
        "&:hover": { bgcolor: status === "error" ? SCHEET.red : SCHEET.yellow },
        boxShadow: status === "playing" ? `0 0 0 6px ${SCHEET.green}33` : "none",
        transition: "box-shadow .2s",
      }}
    >
      {icon}
    </IconButton>
  );

  if (compact) return button;

  const bars = peaks.length > 0 ? peaks : new Array(48).fill(0.15);
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: "100%" }}>
      {button}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box
          role="img"
          aria-label="Golfvorm"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            height: 64,
          }}
        >
          {bars.map((p, i) => {
            const played = (i + 0.5) / bars.length <= progress;
            return (
              <Box
                key={i}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: `${Math.max(6, p * 100)}%`,
                  borderRadius: 2,
                  bgcolor: played ? SCHEET.green : SCHEET.border,
                  transition: "background-color .1s",
                }}
              />
            );
          })}
        </Box>
        <Typography
          variant="caption"
          sx={{ color: status === "error" ? SCHEET.red : SCHEET.muted }}
        >
          {status === "error"
            ? "Afspelen mislukt"
            : `${formatDuration(durationMs)}${status === "loading" ? " · laden…" : ""}`}
        </Typography>
      </Box>
    </Stack>
  );
};

export default FartPlayer;
