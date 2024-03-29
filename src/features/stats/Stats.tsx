import * as React from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "../players/playersSlice";
import { PlayerAvatar } from "../players/PlayerAvatarScore";
import { ScoreState, selectScores } from "../game/scoreSlice";
import { RootState } from "../../app/store";
import InfoIcon from "@mui/icons-material/Info";
import { Button, IconButton, Stack, Typography } from "@mui/material";
import { SnackbarKey, closeSnackbar, enqueueSnackbar } from "notistack";

export function StatsTable() {
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);
  //add the current score to the score history
  const newScoreState: ScoreState = {
    playerscores: [...currentScores],
  };
  const totalScores = [...scoreHistory, newScoreState];

  const getCount = (playerId: number, statName: string) => {
    return totalScores.reduce((total, round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );
      if (playerRound) {
        return (
          total +
          playerRound.stats.filter((stat) => stat.name === statName).length
        );
      }
      return total;
    }, 0);
  };
  // check whats the highest value of the yasatStreak number for a player within the totalScores array
  const getHighestYasatStreak = (playerId: number): number => {
    let highestStreak = 0;

    totalScores.forEach((round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );

      if (playerRound) {
        highestStreak = Math.max(highestStreak, playerRound.yasatStreak);
      }
    });

    return highestStreak;
  };

  const handleMOInfo = () => {
    const action = (snackbarId: SnackbarKey | undefined) => (
      <Button
        color="inherit"
        onClick={() => {
          closeSnackbar(snackbarId);
        }}
      >
        close
      </Button>
    );
    enqueueSnackbar(
      "Multiple owns in one round",
      {
        variant: "info",
        action,
      }
    );
  };

  const handleLullifyInfo = () => {
    const action = (snackbarId: SnackbarKey | undefined) => (
      <Button
        color="inherit"
        onClick={() => {
          closeSnackbar(snackbarId);
        }}
      >
        close
      </Button>
    );
    enqueueSnackbar("Nullify 100 when your score is 69", {
      variant: "info",
      action,
    });
  };

  return (
    <TableContainer>
      <Table stickyHeader sx={{ minWidth: "100%" }}>
        <TableHead>
          <TableRow sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
            <TableCell></TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                <PlayerAvatar
                  name={player.name}
                  score={
                    currentScores.find((score) => score.id === player.id)
                      ?.score || 0
                  }
                  id={player.id}
                  color={player.color}
                />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Yasat</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Yasat")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Current Streak</TableCell>
            {currentScores.map((player) => (
              <TableCell align="center" key={player.id}>
                {player.yasatStreak}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Longest Streak</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getHighestYasatStreak(player.id)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Deaths</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Death")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Kill")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Owns</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Own")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Owned</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Owned")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell sx={{ margin: 1 }}>
              <Stack direction="row" alignItems="center">
                <Typography>Multi-owned </Typography>
                <IconButton size="small" onClick={handleMOInfo} sx={{ ml: 1 }}>
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Stack>
            </TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Multi-owned")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>
              <Stack direction="row" alignItems="center">
                <Typography>Lullify</Typography>

                <IconButton
                  size="small"
                  onClick={handleLullifyInfo}
                  sx={{ ml: 1 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Stack>
            </TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Lullify")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Enable 69</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 69")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Contra-own 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Contra-own 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Contra-own 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Contra-own 100")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Nullify 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Nullify 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Nullify 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Nullify 100")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Enable 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Enable 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 100")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Double Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Double Kill")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Multi Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Multi Kill")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Mega Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Mega Kill")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Monster Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Monster Kill")}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
