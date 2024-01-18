import {
  TextField,
  Stack,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Box,
  useTheme,
} from "@mui/material";
import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { setStartScores } from "../game/scoreSlice";
import { addPlayer, selectPlayers } from "../players/playersSlice";
import { PlayerList } from "../players/Players";
import { startGame, setGameType } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";

export const GameCreator = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [playerName, setPlayerName] = useState("");
  const players = useAppSelector(selectPlayers);
  const [gameType, setGameTypeState] = useState("ranked");
  const handleChange = (event: SelectChangeEvent) => {
    setGameTypeState(event.target.value);
  };

  return (
    <><Box mt={5}>
      <img src={theme.palette.mode === "light" ? logolight : logo } className="App-logo-big" alt="logo" />
    </Box>
    <Stack
      direction="column"
      alignItems="left"
      spacing={5}
      mt={5}
      sx={{
        height: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
        <TextField
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          required
          placeholder="Enter player name"
          label="Player name"
          type="text"
          variant="outlined"
          inputProps={{ inputMode: "text" }} />
        <Button
          disabled={playerName.length === 0}
          onClick={() => dispatch(addPlayer(playerName)) && setPlayerName("")}
          variant="contained"
          sx={{
            height: "50px"
          }}
        >
          Add player
        </Button>
        <PlayerList />

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
          >
            <MenuItem value={"classic"}>Classic</MenuItem>
            <MenuItem value={"ranked"}>Ranked</MenuItem>
          </Select>
        </FormControl>

        <Button
          disabled={players.length < 2 || playerName.length > 0 || gameType.length === 0}
          variant="contained"
          onClick={() => dispatch(startGame()) && dispatch(setStartScores(players)) && dispatch(setGameType(gameType as "classic" | "ranked"))}
          sx={{
            height: "50px",
          }}
        >
          Start game
        </Button>
      </Stack>
    </>
  );
};
