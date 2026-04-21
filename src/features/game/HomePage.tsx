import React from "react";
import { Box, Button, Divider, Stack, Typography, useTheme } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { useAppDispatch } from "../../app/hooks";
import { setGameMode, startNewGame } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { Leaderboard } from "./Leaderboard";

export const HomePage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const choose = (mode: "unranked" | "ranked") => {
    dispatch(setGameMode(mode));
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
      </Stack>

      <Divider sx={{ width: "90%", maxWidth: 360, alignSelf: "center" }} />

      <Leaderboard />
    </Stack>
  );
};

export default HomePage;
