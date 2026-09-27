import * as React from "react";
import { Box, Button, Rating, Stack, Typography } from "@mui/material";
import {
  CATEGORIES,
  Fart,
  PartialScores,
  RatingScores,
  categoryAverage,
  formatScore,
  isCompleteRating,
  MAX_SCORE,
} from "./scheetModel";
import { SCHEET } from "./scheetStyle";

const puffSize = { xs: 21, sm: 26 };

const FilledPuff = (
  <Box component="span" sx={{ fontSize: puffSize, lineHeight: 1 }}>
    💨
  </Box>
);
const EmptyPuff = (
  <Box
    component="span"
    sx={{ fontSize: puffSize, lineHeight: 1, opacity: 0.22, filter: "grayscale(1)" }}
  >
    💨
  </Box>
);

interface Props {
  onSubmit: (scores: RatingScores) => void;
  submitting: boolean;
}

/** Nine 1–10 "puff" scales, one per category. */
export const RatingForm: React.FC<Props> = ({ onSubmit, submitting }) => {
  const [scores, setScores] = React.useState<PartialScores>({});
  const done = CATEGORIES.filter((c) => scores[c.id] !== undefined).length;
  const complete = isCompleteRating(scores);

  return (
    <Stack spacing={1.5}>
      {CATEGORIES.map((c) => {
        const value = scores[c.id] ?? null;
        return (
          <Box
            key={c.id}
            sx={{
              p: 1.25,
              borderRadius: 2,
              bgcolor: SCHEET.panelLight,
              border: `1px solid ${value ? SCHEET.greenDark : "transparent"}`,
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={{ fontWeight: 700 }}>
                {c.emoji} {c.label}
              </Typography>
              <Typography
                sx={{ fontWeight: 800, color: value ? SCHEET.green : SCHEET.muted, minWidth: 28, textAlign: "right" }}
              >
                {value ?? "–"}
              </Typography>
            </Stack>
            <Rating
              name={`scheet-${c.id}`}
              value={value}
              max={MAX_SCORE}
              icon={FilledPuff}
              emptyIcon={EmptyPuff}
              getLabelText={(v) => `${v} van ${MAX_SCORE}`}
              onChange={(_, v) =>
                setScores((prev) => {
                  const next = { ...prev };
                  if (v === null) delete next[c.id];
                  else next[c.id] = v;
                  return next;
                })
              }
              sx={{ mt: 0.5, display: "flex", justifyContent: "space-between" }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
              <Typography variant="caption" sx={{ color: SCHEET.muted }}>
                1 · {c.low}
              </Typography>
              <Typography variant="caption" sx={{ color: SCHEET.muted, textAlign: "right" }}>
                {c.high} · 10
              </Typography>
            </Stack>
          </Box>
        );
      })}
      <Button
        variant="contained"
        size="large"
        disabled={!complete || submitting}
        onClick={() => complete && onSubmit(scores)}
        sx={{ py: 1.5, fontSize: 18 }}
      >
        {submitting
          ? "Bezig met stemmen…"
          : complete
            ? "Beoordeel! 💨"
            : `Nog ${CATEGORIES.length - done} categorieën te gaan`}
      </Button>
    </Stack>
  );
};

/** Per-category averages, optionally next to the viewer's own scores. */
export const ScoreBars: React.FC<{ fart: Fart; mine?: RatingScores }> = ({ fart, mine }) => (
  <Stack spacing={1}>
    {mine && (
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Legend color={SCHEET.yellow} label="Jij" />
        <Legend color={SCHEET.green} label="Gemiddeld" />
      </Stack>
    )}
    {CATEGORIES.map((c) => {
      const avg = categoryAverage(fart, c.id);
      return (
        <Box key={c.id}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2">
              {c.emoji} {c.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {mine && (
                <Box component="span" sx={{ color: SCHEET.yellow, mr: 1 }}>
                  {mine[c.id]}
                </Box>
              )}
              <Box component="span" sx={{ color: SCHEET.green }}>
                {formatScore(avg)}
              </Box>
            </Typography>
          </Stack>
          {mine && <Bar value={mine[c.id]} color={SCHEET.yellow} />}
          <Bar value={avg ?? 0} color={SCHEET.green} />
        </Box>
      );
    })}
  </Stack>
);

const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <Box sx={{ height: 6, borderRadius: 3, bgcolor: SCHEET.border, mt: 0.5, overflow: "hidden" }}>
    <Box
      sx={{
        height: "100%",
        width: `${(value / MAX_SCORE) * 100}%`,
        bgcolor: color,
        borderRadius: 3,
        transition: "width .5s ease-out",
      }}
    />
  </Box>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <Stack direction="row" spacing={0.5} alignItems="center">
    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
    <Typography variant="caption" sx={{ color: SCHEET.muted }}>
      {label}
    </Typography>
  </Stack>
);

export default RatingForm;
