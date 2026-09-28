import * as React from "react";
import { Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ShareIcon from "@mui/icons-material/Share";
import { enqueueSnackbar } from "notistack";
import { Fart, formatDuration, timeAgo } from "./scheetModel";
import { fartShareUrl } from "./scheetService";
import { SCHEET } from "./scheetStyle";

export async function shareFart(fart: Fart) {
  const url = fartShareUrl(fart.id);
  const text = `Beoordeel "${fart.title}" van ${fart.artist} op Reet My Scheet 💨`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Reet My Scheet", text, url });
      return;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    enqueueSnackbar("Link gekopieerd!", { variant: "success" });
  } catch {
    enqueueSnackbar(url, { variant: "info", autoHideDuration: 10000 });
  }
}

/** Title, artist and metadata chips for one fart. */
export const FartHeader: React.FC<{ fart: Fart; share?: boolean }> = ({ fart, share = true }) => (
  <Stack spacing={1}>
    <Stack direction="row" alignItems="flex-start" spacing={1}>
      <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h5" sx={{ wordBreak: "break-word", lineHeight: 1.15 }}>
          {fart.title}
        </Typography>
        <Typography sx={{ color: SCHEET.muted }}>
          door <b style={{ color: SCHEET.cream }}>{fart.artist}</b> · {timeAgo(fart.createdAt)}
        </Typography>
      </Stack>
      {share && (
        <Tooltip title="Delen">
          <IconButton onClick={() => shareFart(fart)} aria-label="Delen" sx={{ color: SCHEET.muted }}>
            <ShareIcon />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip size="small" label={`⏱️ ${formatDuration(fart.durationMs)}`} />
      <Chip size="small" label={fart.source === "recording" ? "🎙️ Live opgenomen" : "📁 Geüpload"} />
      <Chip
        size="small"
        label={`🗳️ ${fart.ratingCount} ${fart.ratingCount === 1 ? "stem" : "stemmen"}`}
      />
    </Stack>
  </Stack>
);

export default FartHeader;
