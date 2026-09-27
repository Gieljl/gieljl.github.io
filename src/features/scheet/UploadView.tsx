import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ReplayIcon from "@mui/icons-material/Replay";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { enqueueSnackbar } from "notistack";
import {
  ARTIST_MAX,
  Fart,
  FartSource,
  TITLE_MAX,
  cleanArtist,
  cleanTitle,
  formatScore,
  overallAverage,
} from "./scheetModel";
import {
  AudioPrepareError,
  MAX_DURATION_S,
  PreparedAudio,
  blobToBase64,
  canRecord,
  prepareAudio,
} from "./audioUtils";
import { uploadFart } from "./scheetService";
import { LocalScheet, readArtistName, saveArtistName } from "./localScheet";
import { useFartRecorder } from "./useFartRecorder";
import { FartPlayer } from "./FartPlayer";
import { shareFart } from "./FartHeader";
import { SCHEET } from "./scheetStyle";

/** The rules reject audio documents above this many base64 characters. */
const MAX_BASE64_CHARS = 900_000;

type Stage = "choose" | "processing" | "review" | "uploading" | "done";

interface Props {
  farts: Fart[];
  local: LocalScheet;
  onOpen: (id: string) => void;
}

/** Record or pick a fart, preview it, name it and upload — no account needed. */
export const UploadView: React.FC<Props> = ({ farts, local, onOpen }) => {
  const [stage, setStage] = React.useState<Stage>("choose");
  const [prepared, setPrepared] = React.useState<PreparedAudio | null>(null);
  const [source, setSource] = React.useState<FartSource>("recording");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [artist, setArtist] = React.useState(readArtistName);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadedId, setUploadedId] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const handleClip = React.useCallback(async (blob: Blob, from: FartSource) => {
    setError(null);
    setStage("processing");
    try {
      const result = await prepareAudio(blob);
      setPrepared(result);
      setSource(from);
      setStage("review");
    } catch (err) {
      setError(
        err instanceof AudioPrepareError ? err.message : "Er ging iets mis bij het verwerken.",
      );
      setStage("choose");
    }
  }, []);

  const recorder = useFartRecorder({
    onRecorded: (blob) => handleClip(blob, "recording"),
    onError: setError,
  });

  // One object URL per prepared clip, revoked when it's replaced.
  React.useEffect(() => {
    if (!prepared) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const reset = () => {
    setPrepared(null);
    setTitle("");
    setError(null);
    setUploadedId(null);
    setStage("choose");
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleClip(file, "upload");
  };

  const cleanedTitle = cleanTitle(title);

  const upload = async () => {
    if (!prepared || !cleanedTitle) return;
    setError(null);
    setStage("uploading");
    try {
      const audioBase64 = await blobToBase64(prepared.blob);
      if (audioBase64.length > MAX_BASE64_CHARS) {
        throw new AudioPrepareError("Dit geluid is te groot om te uploaden.");
      }
      const finalArtist = cleanArtist(artist);
      saveArtistName(artist.trim());
      const id = await uploadFart({
        title: cleanedTitle,
        artist: finalArtist,
        durationMs: prepared.durationMs,
        mimeType: prepared.mimeType,
        source,
        peaks: prepared.peaks,
        audioBase64,
      });
      local.markOwn(id);
      setUploadedId(id);
      setStage("done");
      enqueueSnackbar("Scheet geüpload! 💨", { variant: "success" });
    } catch (err) {
      console.error("Upload failed", err);
      setError(
        err instanceof AudioPrepareError ? err.message : "Uploaden mislukt. Probeer het opnieuw.",
      );
      setStage("review");
    }
  };

  const myFarts = farts.filter((f) => local.own.has(f.id));
  const uploaded = uploadedId ? farts.find((f) => f.id === uploadedId) ?? null : null;
  const recording = recorder.status === "recording";
  const secondsLeft = Math.max(0, MAX_DURATION_S - recorder.elapsedMs / 1000);

  return (
    <Stack spacing={2}>
      {stage === "choose" && (
        <>
          <Box>
            <Typography variant="h5">Laat van je horen</Typography>
            <Typography sx={{ color: SCHEET.muted }}>
              Geen account nodig. Neem je scheet live op of upload een geluidsbestand (max.{" "}
              {MAX_DURATION_S} seconden).
            </Typography>
          </Box>

          <Paper sx={{ p: 3, bgcolor: SCHEET.panel, textAlign: "center" }}>
            {recording ? (
              <Stack alignItems="center" spacing={2}>
                <Typography variant="overline" sx={{ color: SCHEET.red, fontWeight: 800, letterSpacing: 3 }}>
                  ● Opname loopt — PERSEN!
                </Typography>
                <Box
                  sx={{
                    fontSize: 64,
                    lineHeight: 1,
                    transform: `scale(${1 + recorder.level * 0.9})`,
                    transition: "transform 60ms linear",
                  }}
                  aria-hidden
                >
                  💨
                </Box>
                <Box sx={{ width: "100%", height: 10, borderRadius: 5, bgcolor: SCHEET.border, overflow: "hidden" }}>
                  <Box
                    sx={{
                      height: "100%",
                      width: `${recorder.level * 100}%`,
                      bgcolor: recorder.level > 0.8 ? SCHEET.red : SCHEET.green,
                    }}
                  />
                </Box>
                <Typography variant="h4" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {(recorder.elapsedMs / 1000).toFixed(1).replace(".", ",")} s
                </Typography>
                <Typography variant="caption" sx={{ color: SCHEET.muted }}>
                  Stopt automatisch over {Math.ceil(secondsLeft)} s
                </Typography>
                <Button
                  variant="contained"
                  color="error"
                  size="large"
                  startIcon={<StopIcon />}
                  onClick={recorder.stop}
                  sx={{ px: 5, py: 1.5, fontSize: 18 }}
                >
                  Stop
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  onClick={recorder.start}
                  disabled={!canRecord() || recorder.status === "requesting"}
                  aria-label="Start opname"
                  sx={{
                    width: 128,
                    height: 128,
                    borderRadius: "50%",
                    bgcolor: SCHEET.red,
                    color: SCHEET.cream,
                    flexDirection: "column",
                    "&:hover": { bgcolor: "#c94430" },
                  }}
                >
                  {recorder.status === "requesting" ? (
                    <CircularProgress sx={{ color: SCHEET.cream }} />
                  ) : (
                    <>
                      <MicIcon sx={{ fontSize: 48 }} />
                      Opnemen
                    </>
                  )}
                </Button>
                {!canRecord() && (
                  <Typography variant="caption" sx={{ color: SCHEET.muted }}>
                    Opnemen wordt niet ondersteund in deze browser — upload een bestand.
                  </Typography>
                )}
                <Typography sx={{ color: SCHEET.muted }}>of</Typography>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInput.current?.click()}
                >
                  Geluidsbestand kiezen
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={onFile}
                />
              </Stack>
            )}
          </Paper>
          {!recording && (
            <Typography variant="caption" sx={{ color: SCHEET.muted, textAlign: "center" }}>
              Tip: houd de microfoon dichtbij de bron en zet ruisonderdrukking uit. 😉
            </Typography>
          )}
        </>
      )}

      {stage === "processing" && (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography sx={{ color: SCHEET.muted }}>Scheet wordt geanalyseerd…</Typography>
        </Stack>
      )}

      {(stage === "review" || stage === "uploading") && prepared && (
        <Paper sx={{ p: 2, bgcolor: SCHEET.panel }}>
          <Stack spacing={2}>
            <Typography variant="h5">Voorbeeld</Typography>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: SCHEET.bg }}>
              {previewUrl && (
                <FartPlayer localUrl={previewUrl} peaks={prepared.peaks} durationMs={prepared.durationMs} />
              )}
            </Box>
            {prepared.trimmed && (
              <Alert severity="info">
                Je bestand was langer dan {MAX_DURATION_S} seconden; we houden het begin.
              </Alert>
            )}
            <TextField
              label="Titel"
              placeholder="Bijv. De Donderdag-Donderslag"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              inputProps={{ maxLength: TITLE_MAX }}
              required
              fullWidth
              autoFocus
              disabled={stage === "uploading"}
            />
            <TextField
              label="Artiestennaam (optioneel)"
              placeholder="Anoniem"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              inputProps={{ maxLength: ARTIST_MAX }}
              fullWidth
              disabled={stage === "uploading"}
            />
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<ReplayIcon />}
                onClick={reset}
                disabled={stage === "uploading"}
                sx={{ color: SCHEET.muted }}
              >
                Opnieuw
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                size="large"
                startIcon={stage === "uploading" ? <CircularProgress size={18} /> : <CloudUploadIcon />}
                onClick={upload}
                disabled={!cleanedTitle || stage === "uploading"}
              >
                {stage === "uploading" ? "Uploaden…" : "Uploaden"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {stage === "done" && (
        <Paper sx={{ p: 3, bgcolor: SCHEET.panel, textAlign: "center" }}>
          <Stack spacing={2} alignItems="center">
            <Typography sx={{ fontSize: 64, lineHeight: 1 }}>🎉</Typography>
            <Typography variant="h5">Geüpload!</Typography>
            <Typography sx={{ color: SCHEET.muted }}>
              Je scheet staat online en kan nu door iedereen beoordeeld worden. Deel hem met je
              vrienden voor extra stemmen.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
              {uploaded && (
                <Button variant="contained" onClick={() => shareFart(uploaded)}>
                  Delen
                </Button>
              )}
              <Button variant="outlined" startIcon={<MicIcon />} onClick={reset}>
                Nog eentje
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {myFarts.length > 0 && stage !== "processing" && !recording && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Mijn scheten
          </Typography>
          <Stack spacing={1}>
            {myFarts.map((f) => (
              <Paper
                key={f.id}
                onClick={() => onOpen(f.id)}
                sx={{ p: 1.25, bgcolor: SCHEET.panel, cursor: "pointer", "&:hover": { bgcolor: SCHEET.panelLight } }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <FartPlayer fartId={f.id} peaks={f.peaks} durationMs={f.durationMs} compact />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 700 }}>
                      {f.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: SCHEET.muted }}>
                      {f.ratingCount} {f.ratingCount === 1 ? "stem" : "stemmen"}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 20, color: SCHEET.green }}>
                    {formatScore(overallAverage(f))}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};

export default UploadView;
