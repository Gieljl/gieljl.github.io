import * as React from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import styled from '@emotion/styled';
import AddIcon from "@mui/icons-material/Add";
import { Fab, FormControl, FormControlLabel, FormHelperText, FormLabel, Grid, InputLabel, MenuItem, Radio, RadioGroup, Select, SelectChangeEvent, Stack } from '@mui/material';

export function ScoreEntryDialog() {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const StyledFab = styled(Fab)({
    background: '#7df3e1',
    position: "absolute",
    zIndex: 1,
    top: -30,
    left: 0,
    right: 0,
    margin: "0 auto"
  });

  const [yasat, setYasat] = React.useState('');

  const handleChange = (event: SelectChangeEvent) => {
    setYasat(event.target.value);
  };

  return (
    <div>
      <StyledFab color="default" aria-label="add">
              <AddIcon onClick={handleClickOpen}/>
      </StyledFab>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Ronde Scores</DialogTitle>
        <DialogContent>
          <DialogContentText>
           Voer hier voor alle spelers de ronde scores in. 
          </DialogContentText>
          <Grid container direction="row" spacing={4} alignItems="center" justifyContent="center" >
            <Grid item> 
              <Stack direction="column" spacing={2} mt={3} mb={2}>
              <InputLabel>Scores</InputLabel>
              <TextField
                required
                id="name"
                label="P1"
                type="number"
                variant="outlined"
                sx={{ width: '100px'}}
                inputProps={{ inputMode: 'numeric' }}

              />
              <TextField
                required
                id="name"
                label="P2"
                type="number"
                variant="outlined"
                sx={{ width: '100px'}}
                inputProps={{ inputMode: 'numeric' }}
              />
              <TextField
                required
                id="name"
                label="P3"
                type="number"
                variant="outlined"
                sx={{ width: '100px'}}
                inputProps={{ inputMode: 'numeric' }}
              />
              <TextField
                required
                id="name"
                label="P4"
                type="number"
                variant="outlined"
                sx={{ width: '100px'}}
                inputProps={{ inputMode: 'numeric' }}
              />
              <TextField
                required
                id="name"
                label="P5"
                type="number"
                variant="outlined"
                sx={{ width: '100px'}}
              />
              <FormControl sx={{ m: 1, minWidth: 120 }}>
              <InputLabel>Yasat</InputLabel>
                <Select
                  labelId="demo-simple-select-helper-label"
                  id="demo-simple-select-helper"
                  value={yasat}
                  label="Yasat"
                  onChange={handleChange}
                >
                  <MenuItem value={1}>P1</MenuItem>
                  <MenuItem value={2}>P2</MenuItem>
                  <MenuItem value={3}>P3</MenuItem>
                  <MenuItem value={3}>P4</MenuItem>
                  <MenuItem value={3}>P5</MenuItem>
                </Select>
                <FormHelperText>Selecteer de speler die Yasat riep 🎉</FormHelperText>
                </FormControl>
              </Stack>
            </Grid>
            
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annuleren</Button>
          <Button onClick={handleClose}>Opslaan</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
