import {
  Stack,
  Button,
  FormControl,
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
import { startGame, setGameType } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { AddPlayerDialog } from "../players/AddPlayerDialog";


export const GameCreator = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const [gameType, setGameTypeState] = useState("ranked");
  const handleChange = (event: SelectChangeEvent) => {
    setGameTypeState(event.target.value);
  };

  return (
    <>
      <Box mt={5}>
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo-big"
          alt="logo"
        />
      </Box>

      <Stack
        direction="column"
        alignItems="center"
        spacing={5}
        mt={5}
        sx={{
          height: "100vh",
          width: "150px",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <PlayerList />
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
            Game Type
          </InputLabel>
          <Select
            labelId="demo-simple-select-required-label"
            id="demo-simple-select-required"
            value={gameType}
            label="Game Type"
            onChange={handleChange}
            variant="outlined"
            sx={{
              height: "50px",
              width: "150px",
            }}
          >
            <MenuItem value={"classic"}>Classic</MenuItem>
            <MenuItem value={"ranked"}>Ranked</MenuItem>
          </Select>
        </FormControl>

        <Button
          disabled={players.length < 2 || gameType.length === 0}
          variant="contained"
          onClick={() =>
            dispatch(ActionCreators.clearHistory()) &&
            dispatch(startGame()) &&
            dispatch(setStartScores(players)) &&
            dispatch(setGameType(gameType as "classic" | "ranked"))
          }
          sx={{
            height: "50px",
            width: "150px",
          }}
        >
          Start game
        </Button>
      </Stack>
    </>
  );
};
