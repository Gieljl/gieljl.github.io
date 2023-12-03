import React, { useState } from "react";
import {
  Stack,
  Button,
  TextField,
} from "@mui/material";
import { selectPlayers, addPlayer, removePlayer } from "./playersSlice";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { startGame } from "../game/gameSlice";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { PlayerAvatar } from "./PlayerAvatar";

export function PlayerList() {
  const Players = useAppSelector(selectPlayers);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const dispatch = useAppDispatch();
  const [playerName, setPlayerName] = useState("");

  return (
    <>
      <Stack direction="row" spacing={1} mt={2} mb={3}>
        {Players.map((player) => (
          <PlayerAvatar
            name={player.name}
            score={player.score}
            id={player.id}
            key={player.id}
          />
        ))}
      </Stack>
      {gameStatus === "new" && (
        <TextField
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          required
          placeholder="Enter player name"
          label="Player name"
          type="text"
          variant="outlined"
          sx={{ mr: 1, mb: 1, mt: 2, height: "50px", width: "250px" }}
          inputProps={{ inputMode: "text" }}
        />
      )}
      {gameStatus === "new" && (
        <Stack direction="row" spacing={1} mt={2} mb={3}>
          <Button
            disabled={playerName.length === 0}
            onClick={() => dispatch(addPlayer(playerName)) && setPlayerName("")}
            variant="outlined"
            sx={{
              height: "50px",
              mr: 1,
              mb: 1,
              color: "#7df3e1",
              outlineColor: "#7df3e1",
            }}
          >
            Add player
          </Button>
          <Button
            disabled={Players.length < 2}
            variant="outlined"
            onClick={() => dispatch(startGame())}
            sx={{
              height: "50px",
              mt: 1,
              mr: 1,
              mb: 1,
              color: "#7df3e1",
              outlineColor: "#7df3e1",
            }}
          >
            Start game
          </Button>
        </Stack>
      )}
    </>
  );
}
