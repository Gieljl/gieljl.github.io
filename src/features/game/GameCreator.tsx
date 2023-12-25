import {
  TextField,
  Stack,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { setStartScores } from "../game/scoreSlice";
import { addPlayer, selectPlayers } from "../players/playersSlice";
import { PlayerList } from "../players/Players";
import { startGame } from "./gameSlice";
import logo from "../../yasa7.png";
import "../../App.css";

export const GameCreator = () => {
  const dispatch = useAppDispatch();
  const [playerName, setPlayerName] = useState("");
  const players = useAppSelector(selectPlayers);
  const [gameType, setGameType] = React.useState("");
  const handleChange = (event: SelectChangeEvent) => {
    setGameType(event.target.value);
  };

  return (
    <Stack
      direction="column"
      alignItems="left"
      spacing={5}
      mt={5}
    >
      
        <img src={logo} className="App-logo-big" alt="logo" />
      
      <TextField
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        required
        placeholder="Enter player name"
        label="Player name"
        type="text"
        variant="outlined"
        sx={{ mr: 1, width: "250px" }}
        inputProps={{ inputMode: "text" }}
      />
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
          sx={{ width: "250px" }}
          variant="outlined"
        >
          <MenuItem value={10}>Classic</MenuItem>
          <MenuItem value={20}>Ranked</MenuItem>
        </Select>
      </FormControl>

      <Button
        disabled={
          players.length < 2 || playerName.length > 0 || gameType.length === 0
        }
        variant="contained"
        onClick={() =>
          dispatch(startGame()) && dispatch(setStartScores(players))
        }
        sx={{
          height: "50px",
        }}
      >
        Start game
      </Button>
      {/* </Stack> */}
    </Stack>
  );
};
