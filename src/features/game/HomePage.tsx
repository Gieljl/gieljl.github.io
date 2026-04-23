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
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import CastConnectedIcon from "@mui/icons-material/CastConnected";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
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

  const choose = (mode: "unranked" | "ranked") => {
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

      <Typography variant="h5" color="text.primary">
        Choose a game mode
      </Typography>

      <Stack direction="column" spacing={3} alignItems="center">
        <Button
          variant="contained"
          size="large"
          startIcon={<EmojiEventsIcon />}
          onClick={() => choose("ranked")}
          sx={{ width: 260, height: 60, fontSize: 18 }}
        >
          Ranked
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>
          Log in, track stats, compete online.
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
        <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>
          Quick local game, no login needed.
        </Typography>

        <Button
          variant="text"
          size="large"
          startIcon={<LeaderboardIcon />}
          onClick={() => setLeaderboardOpen(true)}
          sx={{ width: 260, height: 60, fontSize: 18, mt: 1 }}
        >
          Leaderboards
        </Button>

        <Button
          variant="text"
          size="large"
          startIcon={<CastConnectedIcon />}
          onClick={() => setJoinOpen(true)}
          sx={{ width: 260, height: 60, fontSize: 18 }}
        >
          Join Online Game
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
              Yasat Rules Explained
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
