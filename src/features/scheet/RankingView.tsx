import * as React from "react";
import { Box, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  Fart,
  RankingKey,
  formatScore,
  rankFarts,
} from "./scheetModel";
import { FartPlayer } from "./FartPlayer";
import { SCHEET, medal } from "./scheetStyle";

interface Props {
  farts: Fart[];
  loading: boolean;
  onOpen: (id: string) => void;
}

const KEYS: Array<{ key: RankingKey; label: string }> = [
  { key: "totaal", label: "🏆 Totaal" },
  ...CATEGORIES.map((c) => ({ key: c.id as RankingKey, label: `${c.emoji} ${c.label}` })),
];

/** One leaderboard per category, plus the overall one. */
export const RankingView: React.FC<Props> = ({ farts, loading, onOpen }) => {
  const [key, setKey] = React.useState<RankingKey>("totaal");
  const ranked = React.useMemo(() => rankFarts(farts, key), [farts, key]);
  const category = key === "totaal" ? null : CATEGORY_BY_ID[key];

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: "flex",
          gap: 1,
          overflowX: "auto",
          pb: 1,
          mx: -2,
          px: 2,
          scrollbarWidth: "thin",
        }}
      >
        {KEYS.map((k) => (
          <Chip
            key={k.key}
            label={k.label}
            onClick={() => setKey(k.key)}
            color={k.key === key ? "primary" : "default"}
            variant={k.key === key ? "filled" : "outlined"}
            sx={{ flexShrink: 0, fontWeight: 700 }}
          />
        ))}
      </Box>

      <Box>
        <Typography variant="h5">
          {category ? `${category.emoji} ${category.label}` : "🏆 Beste scheten overall"}
        </Typography>
        <Typography variant="body2" sx={{ color: SCHEET.muted }}>
          {category
            ? `Hoogste score bovenaan · 1 = ${category.low}, 10 = ${category.high}`
            : "Gemiddelde van alle negen categorieën"}
        </Typography>
      </Box>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress />
        </Stack>
      )}

      {!loading && ranked.length === 0 && (
        <Paper sx={{ p: 3, textAlign: "center", bgcolor: SCHEET.panel }}>
          <Typography sx={{ fontSize: 48 }}>🌫️</Typography>
          <Typography sx={{ color: SCHEET.muted }}>
            Nog geen beoordeelde scheten. Ga naar “Beoordelen” en breng de eerste stem uit!
          </Typography>
        </Paper>
      )}

      <Stack spacing={1}>
        {ranked.map((row) => (
          <Paper
            key={row.fart.id}
            onClick={() => onOpen(row.fart.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(row.fart.id);
              }
            }}
            sx={{
              p: 1.25,
              bgcolor: row.rank <= 3 ? SCHEET.panelLight : SCHEET.panel,
              border: `1px solid ${row.rank === 1 ? SCHEET.yellow : "transparent"}`,
              cursor: "pointer",
              "&:hover": { borderColor: SCHEET.greenDark },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography
                sx={{
                  width: 36,
                  flexShrink: 0,
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: row.rank <= 3 ? 26 : 16,
                  color: SCHEET.muted,
                }}
              >
                {medal(row.rank)}
              </Typography>
              <FartPlayer
                fartId={row.fart.id}
                peaks={row.fart.peaks}
                durationMs={row.fart.durationMs}
                compact
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700 }}>
                  {row.fart.title}
                </Typography>
                <Typography noWrap variant="body2" sx={{ color: SCHEET.muted }}>
                  {row.fart.artist}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 22, color: SCHEET.green, lineHeight: 1.1 }}>
                  {formatScore(row.average)}
                </Typography>
                <Typography variant="caption" sx={{ color: SCHEET.muted }}>
                  {row.fart.ratingCount} {row.fart.ratingCount === 1 ? "stem" : "stemmen"}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {ranked.length > 0 && (
        <Typography variant="caption" sx={{ color: SCHEET.muted, textAlign: "center" }}>
          De volgorde gebruikt een gewogen gemiddelde: met weinig stemmen tel je minder
          zwaar mee, zodat één toevallige 10 niet meteen bovenaan staat.
        </Typography>
      )}
    </Stack>
  );
};

export default RankingView;
