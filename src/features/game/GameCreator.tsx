import {
  Stack,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Box,
  useTheme,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { ActionCreators } from "redux-undo";
import { setStartScores } from "../game/scoreSlice";
import { selectPlayers } from "../players/playersSlice";
import { PlayerList } from "../players/Players";
import { startGame, setGameView, goHome, setGameLength } from "./gameSlice";
import { GAME_LENGTH_OPTIONS, GAME_LENGTH_DESCRIPTION, type GameLength } from "./gameLength";
import HomeIcon from "@mui/icons-material/Home";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { AddPlayerDialog } from "../players/AddPlayerDialog";

export const GameCreator = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const [gameView, setGameViewState] = useState("new");
  const [length, setLength] = useState<GameLength>("classic");

  const handleChange = (event: SelectChangeEvent) => {
    setGameViewState(event.target.value);
  };

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
        spacing={5}
        mt={4}
        sx={{
          height: "100vh",
          width: "150px",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <Typography variant="h6" color="primary">
          Unranked Game
        </Typography>
        <PlayerList editable />
        {players.length < 1 && (
          <Stack direction={"column"} alignItems={"center"}>
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

        <AddPlayerDialog />
        <FormControl required>
          <InputLabel id="demo-simple-select-required-label">
            Game View
          </InputLabel>
          <Select
            labelId="demo-simple-select-required-label"
            id="demo-simple-select-required"
            value={gameView}
            label="Game View"
            onChange={handleChange}
            variant="outlined"
            sx={{
              height: "50px",
              width: "150px",
            }}
          >
            <MenuItem value={"classic"}>Classic</MenuItem>
            <MenuItem value={"new"}>New</MenuItem>
          </Select>
        </FormControl>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: 220, textAlign: "center", mt: -4 }}
        >
          {gameView === "classic"
            ? "Track points per round and round-by-round stats."
            : "Score by weighted stats."}
        </Typography>

        <FormControl required>
          <InputLabel id="game-length-label">Game Length</InputLabel>
          <Select
            labelId="game-length-label"
            id="game-length-select"
            value={length}
            label="Game Length"
            onChange={(e) => setLength(e.target.value as GameLength)}
            variant="outlined"
            sx={{ height: "50px", width: "150px" }}
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
          sx={{ maxWidth: 220, textAlign: "center", mt: -4 }}
        >
          {GAME_LENGTH_DESCRIPTION[length]}
        </Typography>

        <Button
          disabled={players.length < 2 || gameView.length === 0}
          variant="contained"
          onClick={() =>
            dispatch(ActionCreators.clearHistory()) &&
            dispatch(startGame()) &&
            dispatch(setStartScores(players)) &&
            dispatch(setGameView(gameView as "classic" | "new")) &&
            dispatch(setGameLength(length))
          }
          sx={{
            height: "50px",
            width: "150px",
          }}
        >
          Start game
        </Button>

        <Button
          variant="text"
          startIcon={<HomeIcon />}
          onClick={() => dispatch(goHome())}
          sx={{
            height: "50px",
            width: "150px",
          }}
        >
          Home
        </Button>
      </Stack>
    </>
  );
};
