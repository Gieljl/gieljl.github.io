import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "../players/playersSlice";
import { PlayerAvatar } from "../players/PlayerAvatarScore";
import { RootState } from "../../app/store";
import { selectScores } from "../game/scoreSlice";
import { Avatar, Chip, Paper } from "@mui/material";


export default function BasicTable() {
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);

  return (
    <TableContainer  >
      <Paper>
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
              {roundScores.playerscores.map((player) => {
                let cellContent;
                
                if (player.stats.some((stat) => stat.name === "Yasat")) {
                  cellContent = (
                    <>
                      <Chip
                        avatar={<Avatar src="../logo192.png" />}
                        variant="filled"
                        label={player.score}
                        />
                      {player.stats
                        .filter((stat) => stat.name !== "Yasat")
                        .map((stat) => (
                          <Chip
                            variant="filled"
                            size="small"
                            label={stat.name}
                            key={stat.name}
                            sx={{ margin: 1 }}
                            />
                            ))}
                    </>
                  );
                } else {
                  cellContent = (
                    <>
                      {player.score}
                      {player.stats
                        .filter((stat) => stat.name !== "Yasat")
                        .map((stat) => (
                          <Chip
                          variant="filled"
                          size="small"
                          label={stat.name}
                          key={stat.name}
                          sx={{ margin: 1 }}
                          />
                          ))}
                    </>
                  );
                }

                return (
                  <TableCell align="center" key={player.id}>
                    {cellContent}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          <TableRow>
            {currentScores.map((player) => {
              let cellContent;
              
              if (player.stats.some((stat) => stat.name === "Yasat")) {
                cellContent = (
                  <>
                    <Chip
                      avatar={<Avatar src="../logo192.png" />}
                      variant="filled"
                      label={player.score}
                      />
                    {player.stats
                      .filter((stat) => stat.name !== "Yasat")
                      .map((stat) => (
                        <Chip
                        variant="filled"
                        size="small"
                        label={stat.name}
                        key={stat.name}
                        sx={{ margin: 1 }}
                        />
                        ))}
                  </>
                );
              } else {
                cellContent = (
                  <>
                    {player.score}
                    {player.stats
                      .filter((stat) => stat.name !== "Yasat")
                      .map((stat) => (
                        <Chip
                        variant="filled"
                        size="small"
                        label={stat.name}
                        key={stat.name}
                        sx={{ margin: 1 }}
                        />
                        ))}
                  </>
                );
              }

              return (
                <TableCell sx={{ margin: 2 }} align="center" key={player.id}>
                  {cellContent}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
    </TableContainer>
  );
}
