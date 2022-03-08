import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

function createData(
  Name: string,
  Speler1: number,
  Speler2: number,
  Speler3: number,
  Speler4: number,
  Speler5: number,

) {
  return { Name, Speler1, Speler2, Speler3, Speler4, Speler5};
}


const rows = [
  createData('Yasat', 0, 0, 0, 0, 0),
  createData('YasatStreak', 0, 0, 0, 0, 0),
  createData('Kill', 0, 0, 0, 0, 0),
  createData('Ge0wned', 0, 0, 0, 0, 0),
  createData('Nullify50', 0, 0, 0, 0, 0),
  createData('Nullify100', 0, 0, 0, 0, 0),
  createData('Enable50', 0, 0, 0, 0, 0),
  createData('Enable100', 0, 0, 0, 0, 0),
  createData('Contra Own 50', 0, 0, 0, 0, 0),
  createData('Contra Own 100', 0, 0, 0, 0, 0),
  createData('FTH', 0, 0, 0, 0, 0),
  createData('FTPH', 0, 0, 0, 0, 0),
  createData('Double kill', 0, 0, 0, 0, 0),
  createData('Multi kill', 0, 0, 0, 0, 0),
  createData('Mega kill', 0, 0, 0, 0, 0),
  createData('Monster kill', 0, 0, 0, 0, 0),
];


export function StatsTable() {
  return (
    <TableContainer component={Paper}>
      <Table size="small" aria-label="a dense table">
        <TableHead>
          <TableRow>
            <TableCell>Stat</TableCell>
            <TableCell align="right">Speler&nbsp;1</TableCell>
            <TableCell align="right">Speler&nbsp;2</TableCell>
            <TableCell align="right">Speler&nbsp;3</TableCell>
            <TableCell align="right">Speler&nbsp;4</TableCell>
            <TableCell align="right">Speler&nbsp;5</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.Name}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell component="th" scope="row">
                {row.Name}
              </TableCell>
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