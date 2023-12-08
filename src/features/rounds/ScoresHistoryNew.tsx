import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useAppSelector } from '../../app/hooks';
import { selectPlayers} from '../players/playersSlice';
import { PlayerAvatar } from '../players/PlayerAvatar';
import { useSelector } from 'react-redux';
import { RootState } from '../../app/store';


export default function BasicTable() {
    const players = useAppSelector(selectPlayers);

    return (
    <TableContainer  sx={{ mt:1 }}>
      <Table stickyHeader sx={{ minWidth: '100%' }}>
        <TableHead>
          <TableRow>
            {players.map((player) => (
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
          {Array.from({ length: Math.max(...players.map((player) => player.roundScores.length)) }).map((_, roundIndex) => (
            <TableRow key={roundIndex}>
              {players.map((player) => (
                <TableCell align="center" key={player.id}>
                  {player.roundScores
                    .slice(0, roundIndex + 1)
                    .reduce((acc, score) => acc + score.score, 0) || 0}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}