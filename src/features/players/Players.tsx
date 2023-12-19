import React, { useState } from "react";
import {
  Stack,
  Button,
  TextField,
} from "@mui/material";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { selectPlayers, addPlayer, removePlayer } from "./playersSlice";
import { startGame } from "../game/gameSlice";
import { selectScores, setStartScores } from "../game/scoreSlice";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { PlayerAvatar } from "./PlayerAvatar";

export function PlayerList() {
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const dispatch = useAppDispatch();
  const [playerName, setPlayerName] = useState("");

  return (
    <>
      <Stack direction="row" spacing={2} mt={6} mb={3}>
        {players.map((player) => (
          <PlayerAvatar
            name={player.name}
            score={currentScores.find((score) => score.id === player.id)?.score || 0}
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
              mr: 1
            }}
          >
            Add player
          </Button>
          <Button
            disabled={players.length < 2 || playerName.length > 0}
            variant="outlined"
            onClick={() => dispatch(startGame()) && dispatch(setStartScores(players))}
            sx={{
              height: "50px"
            }}
          >
            Start game
          </Button>
        </Stack>
      )}
    </>
  );
}
