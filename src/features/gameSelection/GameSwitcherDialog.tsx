import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import StyleIcon from "@mui/icons-material/Style";
import CasinoIcon from "@mui/icons-material/Casino";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  ActiveGame,
  GAMES,
  useGameSelection,
} from "./gameSelectionContext";
import { useShiplake } from "../shiplake/ShiplakeContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ICONS: Record<ActiveGame, React.ReactNode> = {
  yasat: <StyleIcon sx={{ fontSize: 40 }} />,
  shiplake: <CasinoIcon sx={{ fontSize: 40 }} />,
};

export const GameSwitcherDialog: React.FC<Props> = ({ open, onClose }) => {
  const { activeGame, setActiveGame } = useGameSelection();
  const shiplake = useShiplake();

  const pick = (game: ActiveGame) => {
    setActiveGame(game);
    if (game === "shiplake") {
      shiplake.setOpen(true);
    } else {
      shiplake.setOpen(false);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pr: 6 }}>
        Switch game
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {(Object.values(GAMES) as Array<typeof GAMES[ActiveGame]>).map(
            (def) => {
              const selected = def.id === activeGame;
              return (
                <Button
                  key={def.id}
                  variant={selected ? "contained" : "outlined"}
                  onClick={() => pick(def.id)}
                  sx={{
                    justifyContent: "flex-start",
                    textTransform: "none",
                    p: 2,
                    borderColor: def.darkColor,
                    color: selected ? undefined : def.darkColor,
                    bgcolor: selected ? def.darkColor : undefined,
                    "&:hover": {
                      bgcolor: selected ? def.darkColor : undefined,
                      borderColor: def.darkColor,
                      opacity: 0.9,
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ width: "100%" }}
                  >
                    <Box
                      sx={{
                        color: selected ? "#222" : def.darkColor,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {ICONS[def.id]}
                    </Box>
                    <Stack sx={{ flexGrow: 1, textAlign: "left" }}>
                      <Typography
                        variant="h6"
                        sx={{ color: selected ? "#222" : def.darkColor }}
                      >
                        {def.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: selected ? "#222" : "text.secondary",
                        }}
                      >
                        {def.tagline}
                      </Typography>
                    </Stack>
                    {selected && (
                      <CheckCircleIcon sx={{ color: "#222" }} />
                    )}
                  </Stack>
                </Button>
              );
            },
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default GameSwitcherDialog;
