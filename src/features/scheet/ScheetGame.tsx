import * as React from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slide,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { TransitionProps } from "@mui/material/transitions";
import { CATEGORIES, Fart } from "./scheetModel";
import { subscribeFarts } from "./scheetService";
import { MAX_DURATION_S } from "./audioUtils";
import { useLocalScheet } from "./localScheet";
import { RateView } from "./RateView";
import { RankingView } from "./RankingView";
import { UploadView } from "./UploadView";
import { FartDetailDialog } from "./FartDetailDialog";
import { ScheetLogo } from "./ScheetLogo";
import { HEADING_FONT, SCHEET, scheetTheme } from "./scheetStyle";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

type TabId = "rate" | "rank" | "upload";

interface Props {
  onExit: () => void;
  /** Fart to open straight away (share link). */
  focusId?: string | null;
}

export function ScheetGame({ onExit, focusId }: Props) {
  const [tab, setTab] = React.useState<TabId>("rate");
  const [farts, setFarts] = React.useState<Fart[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(focusId ?? null);
  const [showHelp, setShowHelp] = React.useState(false);
  const local = useLocalScheet();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const scrollToTop = React.useCallback(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, []);

  React.useEffect(() => {
    if (focusId) setDetailId(focusId);
  }, [focusId]);

  React.useEffect(() => {
    try {
      return subscribeFarts(
        (list) => {
          setFarts(list);
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error("Loading farts failed", err);
          setLoading(false);
          setError("De scheten konden niet worden geladen. Controleer je verbinding.");
        },
      );
    } catch (err) {
      console.error("Loading farts failed", err);
      setLoading(false);
      setError("De scheten konden niet worden geladen.");
      return undefined;
    }
  }, []);

  return (
    <ThemeProvider theme={scheetTheme}>
      <Dialog
        fullScreen
        open
        onClose={onExit}
        TransitionComponent={Transition as any}
        PaperProps={{ sx: { bgcolor: SCHEET.bg, backgroundImage: "none" } }}
      >
        <AppBar sx={{ background: SCHEET.panel, position: "relative" }} elevation={0}>
          <Toolbar>
            <ScheetLogo size={36} sx={{ marginRight: 10 }} />
            <Typography
              variant="h6"
              sx={{
                flex: 1,
                color: SCHEET.green,
                fontFamily: HEADING_FONT,
                fontWeight: 800,
                letterSpacing: 1,
                lineHeight: 1.1,
              }}
            >
              REET MY SCHEET
            </Typography>
            <IconButton color="inherit" onClick={() => setShowHelp(true)} aria-label="Uitleg">
              <HelpOutlineIcon />
            </IconButton>
            <IconButton edge="end" color="inherit" onClick={onExit} aria-label="Sluiten">
              <CloseIcon />
            </IconButton>
          </Toolbar>
          <Tabs
            value={tab}
            onChange={(_, v: TabId) => {
              setTab(v);
              scrollToTop();
            }}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab value="rate" label="👂 Beoordelen" sx={{ fontWeight: 700, textTransform: "none" }} />
            <Tab value="rank" label="🏆 Ranglijst" sx={{ fontWeight: 700, textTransform: "none" }} />
            <Tab value="upload" label="🎙️ Uploaden" sx={{ fontWeight: 700, textTransform: "none" }} />
          </Tabs>
        </AppBar>

        <DialogContent ref={contentRef} sx={{ p: 2 }}>
          <Box sx={{ maxWidth: 640, mx: "auto", pb: 4 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {tab === "rate" && (
              <RateView
                farts={farts}
                loading={loading}
                local={local}
                onGoUpload={() => setTab("upload")}
                onScrollTop={scrollToTop}
              />
            )}
            {tab === "rank" && (
              <RankingView farts={farts} loading={loading} onOpen={setDetailId} />
            )}
            {tab === "upload" && (
              <UploadView farts={farts} local={local} onOpen={setDetailId} />
            )}
          </Box>
        </DialogContent>

        <FartDetailDialog
          fartId={detailId}
          farts={farts}
          local={local}
          onClose={() => setDetailId(null)}
        />
        <HelpDialog open={showHelp} onClose={() => setShowHelp(false)} />
      </Dialog>
    </ThemeProvider>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { bgcolor: SCHEET.panel, backgroundImage: "none" } }}
    >
      <DialogTitle>Hoe werkt Reet My Scheet?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            <b>Uploaden</b> — neem een scheet live op met je microfoon of kies een geluidsbestand.
            Geen account nodig; een artiestennaam is optioneel. Maximaal {MAX_DURATION_S} seconden.
          </Typography>
          <Typography>
            <b>Beoordelen</b> — je krijgt steeds een willekeurige scheet te horen. Geef elke
            categorie 1 tot 10 wolkjes en zie meteen hoe jouw oordeel zich verhoudt tot het
            gemiddelde. Per apparaat stem je één keer per scheet, en je eigen scheten sla je over.
          </Typography>
          <Typography>
            <b>Ranglijst</b> — per categorie én voor het totaal. De volgorde gebruikt een gewogen
            gemiddelde, zodat een scheet met veel goede stemmen boven een toevallige enkele 10 komt.
          </Typography>
          <Box>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>De categorieën</Typography>
            <Stack spacing={0.75}>
              {CATEGORIES.map((c) => (
                <Typography key={c.id} variant="body2">
                  {c.emoji} <b>{c.label}</b>{" "}
                  <span style={{ color: SCHEET.muted }}>
                    — 1: {c.low.toLowerCase()} · 10: {c.high.toLowerCase()}
                  </span>
                </Typography>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Begrepen
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ScheetGame;
