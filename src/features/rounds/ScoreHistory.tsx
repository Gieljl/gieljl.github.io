import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { Stack } from '@mui/material';

function createData(
  Round: number,
  Speler1: number,
  Speler2: number,
  Speler3: number,
  Speler4: number,
  Speler5: number,

) {
  return {Round, Speler1, Speler2, Speler3, Speler4, Speler5};
}


const rows = [
  createData(1, 0, 0, 0, 0, 0),
  createData(2, 0, 0, 0, 0, 0),
  createData(3 ,0, 0, 0, 0, 0),
  createData(4, 0, 0, 0, 0, 0),
  createData(5, 0, 0, 0, 0, 0),
  createData(6, 0, 0, 0, 0, 0),
  createData(7, 0, 0, 0, 0, 0),
  createData(8, 0, 0, 0, 0, 0),
  createData(9, 0, 0, 0, 0, 0),
  createData(10, 0, 0, 0, 0, 0),
  createData(11, 0, 0, 0, 0, 0),
  createData(12, 0, 0, 0, 0, 0),
  createData(13, 0, 0, 0, 0, 0),
  createData(14, 0, 0, 0, 0, 0),
  createData(15, 0, 0, 0, 0, 0),
  createData(16, 0, 0, 0, 0, 0),
  createData(17, 0, 0, 0, 0, 0),
  createData(18, 0, 0, 0, 0, 0),
  createData(19, 0, 0, 0, 0, 0),
  createData(20, 0, 0, 0, 0, 0),
  createData(21, 0, 0, 0, 0, 0),
  createData(22, 0, 0, 0, 0, 0),
  createData(23, 0, 0, 0, 0, 0),
  createData(24, 0, 0, 0, 0, 0),
  createData(25, 0, 0, 0, 0, 0),
 
];


export function ScoreHistory() {
  return (
    <Stack
    direction="column"
    alignItems="center"
    sx={{
      display: 'flex',
      bgcolor: 'background.default',
      color: 'text.primary'
    }}
  >
      <Table size="small" aria-label="a dense table" sx={{
        alignContent: 'center',
        display: 'flex',
        bgcolor: 'background.default',
        color: 'text.primary',
      }}>
        <TableBody>
          {rows.map((row) => (
              <TableRow
              key={row.Round}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell align="center">{row.Speler1}</TableCell>
              <TableCell align="center">{row.Speler2}</TableCell>
              <TableCell align="center">{row.Speler3}</TableCell>
              <TableCell align="center">{row.Speler4}</TableCell>
              <TableCell align="center">{row.Speler5}</TableCell>

            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}