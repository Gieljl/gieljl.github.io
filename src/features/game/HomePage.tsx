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
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import StyleIcon from "@mui/icons-material/Style";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import CastConnectedIcon from "@mui/icons-material/CastConnected";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ScoreboardIcon from "@mui/icons-material/Scoreboard";
import { TransitionProps } from "@mui/material/transitions";
import { useAppDispatch } from "../../app/hooks";
import { setGameType, startNewGame } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { Leaderboard } from "./Leaderboard";
import { JoinGameDialog } from "../session/JoinGameDialog";
import RulesPopUp from "./RulesText";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export const HomePage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [leaderboardOpen, setLeaderboardOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [homeView, setHomeView] = React.useState<"main" | "score-tracker">(
    "main",
  );

  const choose = (mode: "unranked" | "ranked" | "play") => {
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

      <Typography variant="h5" sx={{ color: "#7df3e1" }}>
        {homeView === "main" ? "Choose a game mode" : "Score tracker"}
      </Typography>

      {homeView === "score-tracker" && (
        <IconButton
          aria-label="Back to home"
          color="primary"
          onClick={() => setHomeView("main")}
          sx={{ position: "absolute", top: 8, left: 8 }}
        >
          <ArrowBackIcon />
        </IconButton>
      )}

      {homeView === "main" ? (
        <Stack direction="column" spacing={3} alignItems="center">
          <Button
            variant="contained"
            size="large"
            startIcon={<ScoreboardIcon />}
            onClick={() => setHomeView("score-tracker")}
            sx={{ width: 260, height: 60, fontSize: 18 }}
          >
            Score Tracker
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2 }}>
            For in-person games. Tap scores as you play.
          </Typography>

          <Button
            variant="outlined"
            size="large"
            startIcon={<StyleIcon />}
            onClick={() => choose("play")}
            sx={{ width: 260, height: 60, fontSize: 18 }}
          >
            Play vs. AI
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2 }}>
            Live card game vs. AI. Log in to enter leaderboards.
          </Typography>

          <Button
            variant="text"
            size="large"
            startIcon={<CastConnectedIcon />}
            onClick={() => setJoinOpen(true)}
            sx={{ width: 260, height: 60, fontSize: 18, mt: 1 }}
          >
            Join game
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2, maxWidth: 280, textAlign: "center" }}>
            Join a game in progress with extra screen.
          </Typography>

          <Button
            variant="text"
            size="large"
            startIcon={<LeaderboardIcon />}
            onClick={() => setLeaderboardOpen(true)}
            sx={{ width: 260, height: 60, fontSize: 18 }}
          >
            Leaderboards
          </Button>

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
      ) : (
        <Stack direction="column" spacing={3} alignItems="center">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ maxWidth: 280, textAlign: "center" }}
          >
            Manual scorekeeper for in-person games.
          </Typography>

          <Button
            variant="contained"
            size="large"
            startIcon={<EmojiEventsIcon />}
            onClick={() => choose("ranked")}
            sx={{ width: 260, height: 60, fontSize: 18 }}
          >
            Ranked
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2, maxWidth: 280, textAlign: "center" }}>
            Log in. Stats saved to leaderboards.
          </Typography>

          <Button
            variant="outlined"
            size="large"
            startIcon={<SportsEsportsIcon />}
            onClick={() => choose("unranked")}
            sx={{ width: 260, height: 60, fontSize: 18 }}
          >
            Unranked
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: -2, maxWidth: 280, textAlign: "center" }}>
            Quick local game. No login, nothing saved.
          </Typography>
        </Stack>
      )}

      <JoinGameDialog open={joinOpen} onClose={() => setJoinOpen(false)} />

      <Dialog
        fullScreen
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        TransitionComponent={Transition}
      >
        <AppBar
          sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
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
              Yasat rules explained
            </Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: 3 }}>
          <RulesPopUp />
        </Box>
      </Dialog>

      <Dialog
        fullScreen
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        TransitionComponent={Transition}
      >
        <AppBar
          sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
        >
          <Toolbar>
            <IconButton
              edge="start"
              color="primary"
              onClick={() => setLeaderboardOpen(false)}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Leaderboards
            </Typography>
          </Toolbar>
        </AppBar>
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            py: 3,
          }}
        >
          <Leaderboard />
        </Box>
      </Dialog>
    </Stack>
  );
};

export default HomePage;
