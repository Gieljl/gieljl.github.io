import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "../players/playersSlice";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { selectScores } from "../game/scoreSlice";
import { Avatar, Badge, Chip, IconButton, Stack } from "@mui/material";
import { GiHastyGrave } from "react-icons/gi";
import { RiCrosshairLine } from "react-icons/ri";

export default function BasicTable() {
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);

  return (
    <TableContainer sx={{ mt: 1, height: "78%"  }}>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
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
          {scoreHistory.map((roundScores, roundIndex) => (
            <TableRow key={roundIndex}>
              {roundScores.playerscores.map((player) => (
                <TableCell align="center" key={player.id} >
                 {player.stats.some((stat) => stat.name === "yasat") ? (
                  <Chip
                  avatar={<Avatar src="../logo192.png" />}
                  variant="filled"
                  label={player.score}
                />
                ) : (
                  player.score
                )} 
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow>
            {currentScores.map((player) => (
                           
              <TableCell align="center" key={player.id}>
                {player.stats.some((stat) => stat.name === "yasat") ? (
                  <Chip
                  avatar={<Avatar src="../logo192.png" />}
                  variant="filled"
                  label={player.score}
                />
                ) : (
                  player.score
                )} 
               
                
                
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
