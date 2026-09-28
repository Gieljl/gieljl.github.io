import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { enqueueSnackbar } from "notistack";
import {
  CATEGORIES,
  Fart,
  RankingKey,
  RatingScores,
  formatScore,
  overallAverage,
  rankFarts,
} from "./scheetModel";
import { rateFart, subscribeFart } from "./scheetService";
import { LocalScheet } from "./localScheet";
import { FartHeader } from "./FartHeader";
import { FartPlayer } from "./FartPlayer";
import { RatingForm, ScoreBars } from "./RatingForm";
import { SCHEET, medal, scheetTheme } from "./scheetStyle";

interface Props {
  fartId: string | null;
  farts: Fart[];
  local: LocalScheet;
  onClose: () => void;
}

/** Top-10 placements of one fart across all leaderboards. */
function placements(fart: Fart, farts: Fart[]): Array<{ key: RankingKey; label: string; rank: number }> {
  const keys: Array<{ key: RankingKey; label: string }> = [
    { key: "totaal", label: "Totaal" },
    ...CATEGORIES.map((c) => ({ key: c.id as RankingKey, label: `${c.emoji} ${c.label}` })),
  ];
  const pool = farts.some((f) => f.id === fart.id) ? farts : [...farts, fart];
  return keys
    .map((k) => ({ ...k, rank: rankFarts(pool, k.key, 10).find((r) => r.fart.id === fart.id)?.rank ?? 0 }))
    .filter((p) => p.rank > 0);
}

/** Everything about one fart: playback, scores, placements, and a vote form. */
export const FartDetailDialog: React.FC<Props> = ({ fartId, farts, local, onClose }) => {
  const fullScreen = useMediaQuery(scheetTheme.breakpoints.down("sm"));
  const listed = fartId ? farts.find((f) => f.id === fartId) ?? null : null;
  const isListed = listed !== null;
  const [fetched, setFetched] = React.useState<Fart | null | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);
  const [mine, setMine] = React.useState<RatingScores | null>(null);

  // Farts outside the loaded list window (old share links) are watched directly.
  React.useEffect(() => {
    setFetched(undefined);
    if (!fartId || isListed) return;
    return subscribeFart(fartId, setFetched, () => setFetched(null));
  }, [fartId, isListed]);

  React.useEffect(() => setMine(null), [fartId]);

  const fart = listed ?? fetched ?? null;
  const own = fart ? local.own.has(fart.id) : false;
  const rated = fart ? local.rated.has(fart.id) : false;

  const submit = async (scores: RatingScores) => {
    if (!fart) return;
    setSubmitting(true);
    try {
      await rateFart(fart.id, scores);
      local.markRated(fart.id);
      setMine(scores);
    } catch (err) {
      console.error("Rating failed", err);
      enqueueSnackbar("Stemmen mislukt. Probeer het opnieuw.", { variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={fartId !== null}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { bgcolor: SCHEET.bg, backgroundImage: "none" } }}
    >
      <DialogTitle sx={{ pr: 6, bgcolor: SCHEET.panel }}>
        💨 Scheet
        <IconButton aria-label="Sluiten" onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 2 }}>
        {!fart && fetched === undefined && (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        )}
        {!fart && fetched === null && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Deze scheet is vervlogen — we kunnen hem niet vinden.
          </Alert>
        )}
        {fart && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <FartHeader fart={fart} />
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: SCHEET.panel }}>
              <FartPlayer fartId={fart.id} peaks={fart.peaks} durationMs={fart.durationMs} preload />
            </Box>

            <Paper sx={{ p: 2, bgcolor: SCHEET.panel }}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Totaalscore</Typography>
                <Typography variant="h4" sx={{ color: SCHEET.green }}>
                  {formatScore(overallAverage(fart))}
                </Typography>
              </Stack>
              {fart.ratingCount > 0 ? (
                <ScoreBars fart={fart} mine={mine ?? undefined} />
              ) : (
                <Typography sx={{ color: SCHEET.muted }}>Nog niet beoordeeld.</Typography>
              )}
            </Paper>

            {fart.ratingCount > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {placements(fart, farts).map((p) => (
                  <Chip
                    key={p.key}
                    label={`${medal(p.rank)} ${p.label}`}
                    variant="outlined"
                    sx={{ borderColor: p.rank === 1 ? SCHEET.yellow : SCHEET.border }}
                  />
                ))}
              </Stack>
            )}

            {own ? (
              <Alert severity="info">Dit is jouw eigen scheet — die kun je niet zelf beoordelen.</Alert>
            ) : rated || mine ? (
              <Alert severity="success">Je hebt deze scheet beoordeeld. Bedankt voor je oren!</Alert>
            ) : (
              <Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Jouw oordeel
                </Typography>
                <RatingForm key={fart.id} onSubmit={submit} submitting={submitting} />
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FartDetailDialog;
