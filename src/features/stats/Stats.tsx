import * as React from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "../players/playersSlice";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { ScoreState, selectScores } from "../game/scoreSlice";
import { RootState } from "../../app/store";

export function StatsTable() {
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);
  //add the current score to the score history
  const newScoreState: ScoreState = {
    playerscores: [...currentScores],
  };
  const totalScores = [...scoreHistory, newScoreState];

  const getCount = (playerId: string, statName: string) => {
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
  const getHighestYasatStreak = (playerId: string) => {
    const yasatStreaks = totalScores.map((round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );
      if (playerRound) {
        return playerRound.yasatStreak;
      }
      return [];
    });
    const yasatStreaksFlat = yasatStreaks.flat();
    if (yasatStreaksFlat.length > 0) {
      return yasatStreaksFlat.reduce((max, yasatStreak) => {
        return Math.max(max, yasatStreak);
      }, 0);
    }
    return 0;
  }
    




  return (
    <TableContainer component={Paper}>
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
                />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Yasat</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Yasat")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Yasat Streak </TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getHighestYasatStreak(player.id)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Deaths</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Death")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Kills</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Kill")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Owns</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Own")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Owned</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Owned")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Contra-own 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Contra-own 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Contra-own 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Contra-own 100")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Nullify 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Nullify 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Nullify 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Nullify 100")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Lullify</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Lullify")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Enable 69</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 69")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Enable 50</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 50")}
              </TableCell>
            ))}
          </TableRow>
          <TableRow sx={{ margin: 2 }}>
            <TableCell>Enable 100</TableCell>
            {players.map((player) => (
              <TableCell align="center" key={player.id}>
                {getCount(player.id, "Enable 100")}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
