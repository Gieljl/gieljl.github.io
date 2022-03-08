import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

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
];


export function ScoreHistory() {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="a dense table">
        <TableBody>
          {rows.map((row) => (
              <TableRow
              key={row.Round}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell align="right">{row.Speler1}</TableCell>
              <TableCell align="right">{row.Speler2}</TableCell>
              <TableCell align="right">{row.Speler3}</TableCell>
              <TableCell align="right">{row.Speler4}</TableCell>
              <TableCell align="right">{row.Speler5}</TableCell>

            </TableRow>
          ))}
        </TableBody>
      </Table>
      </TableContainer>
  );
}