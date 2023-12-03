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

export function StatsTable() {
  const Players = useAppSelector(selectPlayers);

  return (
    <TableContainer component={Paper}>
      <Table stickyHeader sx={{ minWidth: "100%" }}>
        <TableHead>
          <TableRow sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
            <TableCell></TableCell>
            {Players.map((player) => (
              <TableCell align="center" key={player.id}>
                <PlayerAvatar
                  name={player.name}
                  score={player.score}
                  id={player.id}
                />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ margin: 2 }}>
          <TableCell>Yasat</TableCell>
            {Players.map((player) => (
              <TableCell key={player.id} align="center">
                {player.yasat}
              </TableCell>
            ))}
          </TableRow>

          <TableRow sx={{ margin: 2 }}>
          <TableCell>Yasatstreak</TableCell>
            {Players.map((player) => (
              <TableCell key={player.id} align="center">
                {player.yasatStreak}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
