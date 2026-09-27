import * as React from "react";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import MicIcon from "@mui/icons-material/Mic";
import { enqueueSnackbar } from "notistack";
import {
  Fart,
  RatingScores,
  applyRating,
  formatScore,
  overallAverage,
  pickNextFart,
  ratingMean,
  verdict,
} from "./scheetModel";
import { rateFart } from "./scheetService";
import { LocalScheet } from "./localScheet";
import { FartPlayer } from "./FartPlayer";
import { FartHeader } from "./FartHeader";
import { RatingForm, ScoreBars } from "./RatingForm";
import { SCHEET } from "./scheetStyle";

interface Props {
  farts: Fart[];
  loading: boolean;
  local: LocalScheet;
  onGoUpload: () => void;
  /** Scroll the view back up — the rating form is long, the result isn't. */
  onScrollTop: () => void;
}

interface RatedResult {
  fart: Fart;
  mine: RatingScores;
}

/** Classic "rate my" loop: one random fart, rate it, see the verdict, next. */
export const RateView: React.FC<Props> = ({ farts, loading, local, onGoUpload, onScrollTop }) => {
  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(new Set());
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RatedResult | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const exclude = React.useMemo(
    () => new Set([...Array.from(local.rated), ...Array.from(local.own), ...Array.from(skipped)]),
    [local.rated, local.own, skipped],
  );

  // Keep the current fart while it exists; otherwise draw a new one. New
  // uploads arriving through the live listener refill an empty queue.
  React.useEffect(() => {
    if (result) return;
    if (currentId && farts.some((f) => f.id === currentId)) return;
    setCurrentId(pickNextFart(farts, exclude)?.id ?? null);
  }, [farts, exclude, currentId, result]);

  const current = farts.find((f) => f.id === currentId) ?? null;

  // A new fart or a fresh verdict always starts at the top of the page.
  React.useEffect(() => {
    onScrollTop();
  }, [currentId, result, onScrollTop]);

  const next = (extraExclude?: string) => {
    const ex = new Set(exclude);
    if (extraExclude) ex.add(extraExclude);
    setResult(null);
    setCurrentId(pickNextFart(farts, ex)?.id ?? null);
  };

  const skip = () => {
    if (!current) return;
    setSkipped((prev) => new Set(prev).add(current.id));
    next(current.id);
  };

  const submit = async (scores: RatingScores) => {
    if (!current) return;
    const before = current;
    setSubmitting(true);
    try {
      await rateFart(before.id, scores);
      local.markRated(before.id);
      setResult({ fart: applyRating(before, scores), mine: scores });
    } catch (err) {
      console.error("Rating failed", err);
      enqueueSnackbar("Stemmen mislukt. Probeer het opnieuw.", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }} spacing={2}>
        <CircularProgress />
        <Typography sx={{ color: SCHEET.muted }}>Scheten ophalen…</Typography>
      </Stack>
    );
  }

  if (result) {
    const myMean = ratingMean(result.mine);
    const avg = overallAverage(result.fart);
    return (
      <Stack spacing={2}>
        <Paper sx={{ p: 2.5, textAlign: "center", bgcolor: SCHEET.panel }}>
          <Typography variant="overline" sx={{ color: SCHEET.muted }}>
            Jouw oordeel over “{result.fart.title}”
          </Typography>
          <Typography variant="h4" sx={{ color: SCHEET.yellow, fontSize: 44 }}>
            {formatScore(myMean)}
          </Typography>
          <Typography variant="h6">{verdict(myMean)}</Typography>
          <Typography sx={{ color: SCHEET.muted, mt: 1 }}>
            Gemiddeld <b style={{ color: SCHEET.green }}>{formatScore(avg)}</b> uit{" "}
            {result.fart.ratingCount} {result.fart.ratingCount === 1 ? "stem" : "stemmen"}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, bgcolor: SCHEET.panel }}>
          <ScoreBars fart={result.fart} mine={result.mine} />
        </Paper>
        <Button variant="contained" size="large" onClick={() => next()} sx={{ py: 1.5, fontSize: 18 }}>
          Volgende scheet ➜
        </Button>
      </Stack>
    );
  }

  if (!current) {
    const nothingYet = farts.length === 0;
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 6, textAlign: "center" }}>
        <Typography sx={{ fontSize: 64, lineHeight: 1 }}>{nothingYet ? "🌬️" : "🏁"}</Typography>
        <Typography variant="h5">
          {nothingYet ? "Nog geen scheten" : "Je hebt alles beoordeeld!"}
        </Typography>
        <Typography sx={{ color: SCHEET.muted, maxWidth: 360 }}>
          {nothingYet
            ? "Wees de eerste en laat van je horen."
            : "Er zijn geen nieuwe scheten meer. Tijd om er zelf eentje op te nemen?"}
        </Typography>
        <Button variant="contained" size="large" startIcon={<MicIcon />} onClick={onGoUpload}>
          Scheet opnemen
        </Button>
        {skipped.size > 0 && (
          <Button onClick={() => setSkipped(new Set())} sx={{ color: SCHEET.muted }}>
            Overgeslagen scheten opnieuw tonen ({skipped.size})
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, bgcolor: SCHEET.panel }}>
        <Stack spacing={2}>
          <FartHeader fart={current} />
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: SCHEET.bg }}>
            <FartPlayer
              fartId={current.id}
              peaks={current.peaks}
              durationMs={current.durationMs}
              preload
            />
          </Box>
        </Stack>
      </Paper>
      <Typography sx={{ color: SCHEET.muted, px: 0.5 }}>
        Luister goed en geef elke categorie 1 tot 10 wolkjes.
      </Typography>
      <RatingForm key={current.id} onSubmit={submit} submitting={submitting} />
      <Button startIcon={<SkipNextIcon />} onClick={skip} disabled={submitting} sx={{ color: SCHEET.muted }}>
        Overslaan
      </Button>
    </Stack>
  );
};

export default RateView;
