import * as React from 'react';
import { DataGrid } from '@mui/x-data-grid';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  
  {
    field: 'Type',
    headerName: 'Type',
    width: 150,
    editable: true,
  },
  {
    field: 'Speler1',
    headerName: 'Speler1',
    type: 'number',
    width: 150,
    editable: true,
  },
  {
    field: 'Speler2',
    headerName: 'Speler2',
    type: 'number',
    width: 110,
    editable: true,
  },
  
];

const rows = [
  { id: 1, Type: 'Yasat', Speler1: 0, Speler2: 35 },
  { id: 2, Type: 'YasatStreak', Speler1: 0, Speler2: 42 },
  { id: 3, Type: 'Death', Speler1: 0, Speler2: 45 },
  { id: 4, Type: 'Kill', Speler1: 0, Speler2: 16 },
  { id: 5, Type: 'Ge0wned', Speler1: 0, Speler2: 0 },
  { id: 6, Type: 'Own', Speler1: 0, Speler2: 150 },
  { id: 7, Type: 'Nullify 50', Speler1: 0, Speler2: 44 },
  { id: 8, Type: 'Nullify 100', Speler1: 0, Speler2: 36 },
  { id: 9, Type: 'Enable 50', Speler1: 0, Speler2: 65 },
];

export function DataGridDemo() {
  return (
    <div style={{ height: 400, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        pageSize={5}
        rowsPerPageOptions={[5]}
        checkboxSelection
        disableSelectionOnClick
      />
    </div>
  );
}