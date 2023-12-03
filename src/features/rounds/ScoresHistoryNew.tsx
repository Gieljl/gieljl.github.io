import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useAppSelector } from '../../app/hooks';
import { selectPlayers } from '../players/playersSlice';
import { PlayerAvatar } from '../players/PlayerAvatar';


export default function BasicTable() {
    const Players = useAppSelector(selectPlayers); 
    

  return (
    <TableContainer >
      <Table stickyHeader sx={{ minWidth: '100%' }}>
        <TableHead>
          <TableRow>
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
            <TableRow
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >  
              {Players.map((player) => (
                <TableCell key={player.id} align="center" component="th" scope="row">
                  {player.score}  
                </TableCell>
            ))}
              
            </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}