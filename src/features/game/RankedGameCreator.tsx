import {
  Stack,
  Button,
  Box,
  useTheme,
  Typography,
  Avatar,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import React, { useEffect, useRef, useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { ActionCreators } from "redux-undo";
import { setStartScores } from "./scoreSlice";
import { addPlayer, selectPlayers } from "../players/playersSlice";
import { PlayerList } from "../players/Players";
import { startGame, setGameView, goHome, setGameLength } from "./gameSlice";
import { GAME_LENGTH_OPTIONS, GAME_LENGTH_DESCRIPTION, type GameLength } from "./gameLength";
import HomeIcon from "@mui/icons-material/Home";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { RankedAddPlayerDialog } from "../players/RankedAddPlayerDialog";
import { IdentityDialog } from "../identity/IdentityDialog";
import { selectCurrentPlayer } from "../identity/identitySlice";

export const RankedGameCreator: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const currentPlayer = useAppSelector(selectCurrentPlayer);
  const [openIdentity, setOpenIdentity] = useState(false);
  const [length, setLength] = useState<GameLength>("classic");
  const autoAddedFor = useRef<string | null>(null);

  // Auto-add the logged-in player to the game roster once, when they log in.
  // If the user later removes themselves from the list, we don't re-add.
  useEffect(() => {
    if (!currentPlayer) {
      autoAddedFor.current = null;
      return;
    }
    if (autoAddedFor.current === currentPlayer.username) return;

    const alreadyInList = players.some(
      (p) => p.username === currentPlayer.username
    );
    if (!alreadyInList) {
      dispatch(
        addPlayer(
          currentPlayer.displayName,
          currentPlayer.color || "#7df3e1",
          currentPlayer.username
        )
      );
    }
    autoAddedFor.current = currentPlayer.username;
  }, [currentPlayer, players, dispatch]);

  return (
    <>
      <IconButton
        aria-label="Back to home"
        color="primary"
        onClick={() => dispatch(goHome())}
        sx={{ position: "absolute", top: 8, left: 8 }}
      >
        <ArrowBackIcon />
      </IconButton>
      <Box mt={2.5} mb={-2}>
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo-small"
          alt="logo"
        />
      </Box>

      <Stack
        direction="column"
        alignItems="center"
        spacing={4}
        mt={4}
        sx={{
          width: "90%",
          maxWidth: 360,
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <Typography variant="h6" color="primary">
          Ranked Game
        </Typography>

        {!currentPlayer ? (
          <Stack direction="column" alignItems="center" spacing={2}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Log in to save your results and climb the online rankings.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<PersonIcon />}
              onClick={() => setOpenIdentity(true)}
              sx={{ width: 220, height: 50 }}
            >
              Login / Register
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              sx={{
                bgcolor: currentPlayer.color || "#7df3e1",
                width: 44,
                height: 44,
              }}
            >
              {currentPlayer.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
            <Typography variant="body1">
              Logged in as <strong>{currentPlayer.displayName}</strong>
            </Typography>
          </Stack>
        )}

        <PlayerList editable />
        {players.length < 1 && (
          <Stack direction="column" alignItems="center">
            <Typography
              sx={{ fontSize: 15 }}
              color="text.secondary"
              gutterBottom
            >
              Add at least 2 players
            </Typography>
            <Typography
              sx={{ fontSize: 15 }}
              color="text.secondary"
              gutterBottom
            >
              to start the game...
            </Typography>
          </Stack>
        )}

        <RankedAddPlayerDialog />

        <FormControl required sx={{ mt: 1 }}>
          <InputLabel id="ranked-game-length-label">Game Length</InputLabel>
          <Select
            labelId="ranked-game-length-label"
            id="ranked-game-length-select"
            value={length}
            label="Game Length"
            onChange={(e) => setLength(e.target.value as GameLength)}
            variant="outlined"
            sx={{ height: 50, width: 180 }}
          >
            {GAME_LENGTH_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: 260, textAlign: "center", mt: -3 }}
        >
          {GAME_LENGTH_DESCRIPTION[length]}
        </Typography>

        <Button
          disabled={players.length < 2}
          variant="contained"
          onClick={() => {
            dispatch(ActionCreators.clearHistory());
            dispatch(setGameView("new"));
            dispatch(setGameLength(length));
            dispatch(setStartScores(players));
            dispatch(startGame());
          }}
          sx={{ height: 50, width: 180 }}
        >
          Start game
        </Button>

        <Button
          variant="text"
          startIcon={<HomeIcon />}
          onClick={() => dispatch(goHome())}
          sx={{ height: 50, width: 180 }}
        >
          Home
        </Button>

        <IdentityDialog
          open={openIdentity}
          onClose={() => setOpenIdentity(false)}
        />
      </Stack>
    </>
  );
};

export default RankedGameCreator;
