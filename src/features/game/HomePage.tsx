import React from "react";
import {
  AppBar,
  Box,
  Button,
  Dialog,
  IconButton,
  Slide,
  Stack,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
import ScoreboardIcon from "@mui/icons-material/Scoreboard";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { TransitionProps } from "@mui/material/transitions";
import { useAppDispatch } from "../../app/hooks";
import { setGameType, startNewGame } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import RulesPopUp from "./RulesText";
import { GameSwitcherDialog } from "../gameSelection/GameSwitcherDialog";
import { GAMES, useGameSelection } from "../gameSelection/gameSelectionContext";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export const HomePage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const { activeGame } = useGameSelection();
  const activeGameDef = GAMES[activeGame];
  const accent =
    theme.palette.mode === "light"
      ? activeGameDef.lightColor
      : activeGameDef.darkColor;

  const choose = (mode: "unranked" | "play") => {
    dispatch(setGameType(mode));
    dispatch(startNewGame());
  };

  return (
    <Stack
      direction="column"
      alignItems="center"
      spacing={4}
      sx={{ width: "100%", pt: 5, pb: 10 }}
    >
      <Box mt={2}>
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo-big"
          alt="logo"
        />
      </Box>

      <Typography variant="h5" sx={{ color: "primary.main" }}>
        Choose a game mode
      </Typography>

      <Stack direction="column" spacing={3} alignItems="center">
        <Button
          variant="contained"
          size="large"
          startIcon={<ScoreboardIcon />}
          onClick={() => choose("unranked")}
          sx={{ width: 260, height: 60, fontSize: 18 }}
        >
          Score Tracker
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2, maxWidth: 280, textAlign: "center" }}>
          For in-person games. Tap scores as you play.
        </Typography>

        <Button
          variant="outlined"
          size="large"
          startIcon={<SmartToyIcon />}
          onClick={() => choose("play")}
          sx={{ width: 260, height: 60, fontSize: 18 }}
        >
          Play vs. AI
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2, maxWidth: 280, textAlign: "center" }}>
          Live card game against bots.
        </Typography>

        <Button
          variant="text"
          size="large"
          startIcon={<HelpOutlineIcon />}
          onClick={() => setRulesOpen(true)}
          sx={{ width: 260, height: 60, fontSize: 18 }}
        >
          Rules
        </Button>
      </Stack>

      <Box sx={{ display: "flex", justifyContent: "center", width: "100%", pt: 2 }}>
        <Button
          aria-label="Switch game"
          variant="outlined"
          size="medium"
          startIcon={<SwapHorizIcon />}
          onClick={() => setSwitcherOpen(true)}
          sx={{
            borderColor: accent,
            color: accent,
            "&:hover": { borderColor: accent, opacity: 0.85 },
          }}
        >
          Switch game ({activeGameDef.label})
        </Button>
      </Box>

      <GameSwitcherDialog
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />

      <Dialog
        fullScreen
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        TransitionComponent={Transition}
      >
        <AppBar
          sx={{ background: "#424242", color: "primary.main", position: "relative" }}
        >
          <Toolbar>
            <IconButton
              edge="start"
              color="primary"
              onClick={() => setRulesOpen(false)}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {`${activeGameDef.label} rules explained`}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: 3 }}>
          <RulesPopUp />
        </Box>
      </Dialog>
    </Stack>
  );
};

export default HomePage;
