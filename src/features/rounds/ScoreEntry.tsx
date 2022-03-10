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
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { Autocomplete, Avatar, Checkbox, Fab, FormControl, FormControlLabel, FormHelperText, FormLabel, Grid, InputAdornment, InputLabel, MenuItem, Radio, RadioGroup, Select, SelectChangeEvent, Stack } from '@mui/material';
import { deepOrange, deepPurple, indigo, teal, yellow } from '@mui/material/colors';

export function ScoreEntryButton() {
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

  const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
  const checkedIcon = <CheckBoxIcon fontSize="small" />;
  const specials = [
    { title: 'FTH'},
    { title: 'FTPH'},
    { title: 'Special'},
    { title: 'Special 2'},
    { title: 'Turbospecial'}
  ];

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
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: teal[500] }}>P1</Avatar>
                  <TextField
                    required
                    id="name"
                    label="Score"
                    type="number"
                    variant="outlined"
                    sx={{ width: '100px'}}
                    InputProps={{inputMode: 'numeric'}}
                  />
                  <Autocomplete
                    multiple
                    id="checkboxes-tags-demo"
                    options={specials}
                    disableCloseOnSelect
                    getOptionLabel={(option) => option.title}
                    renderOption={(props, option, { selected }) => (
                      <li {...props}>
                        <Checkbox
                          icon={icon}
                          checkedIcon={checkedIcon}
                          style={{ marginRight: 8 }}
                          checked={selected}
                        />
                        {option.title}
                      </li>
                    )}
                    style={{ width: 180 }}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="Specials" />
                    )}
                  />
                </Stack>
              
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: deepOrange[500] }}>P2</Avatar>
                  <TextField
                  required
                  id="name"
                  label="Score"
                  type="number"
                  variant="outlined"
                  sx={{ width: '100px'}}
                  inputProps={{ inputMode: 'numeric' }}
                  />
                  <Autocomplete
                    multiple
                    id="checkboxes-tags-demo"
                    options={specials}
                    disableCloseOnSelect
                    getOptionLabel={(option) => option.title}
                    renderOption={(props, option, { selected }) => (
                      <li {...props}>
                        <Checkbox
                          icon={icon}
                          checkedIcon={checkedIcon}
                          style={{ marginRight: 8 }}
                          checked={selected}
                        />
                        {option.title}
                      </li>
                    )}
                    style={{ width: 180 }}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="Specials" />
                    )}
                  />
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: yellow[500] }}>P3</Avatar>
                  <TextField
                    required
                    id="name"
                    label="Score"
                    type="number"
                    variant="outlined"
                    sx={{ width: '100px'}}
                    inputProps={{ inputMode: 'numeric' }}
                    />
                    <Autocomplete
                      multiple
                      id="checkboxes-tags-demo"
                      options={specials}
                      disableCloseOnSelect
                      getOptionLabel={(option) => option.title}
                      renderOption={(props, option, { selected }) => (
                        <li {...props}>
                          <Checkbox
                            icon={icon}
                            checkedIcon={checkedIcon}
                            style={{ marginRight: 8 }}
                            checked={selected}
                          />
                          {option.title}
                        </li>
                      )}
                      style={{ width: 180 }}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Specials" />
                      )}
                    />
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: deepPurple[500] }}>P4</Avatar>
                  <TextField
                    required
                    id="name"
                    label="Score"
                    type="number"
                    variant="outlined"
                    sx={{ width: '100px'}}
                    inputProps={{ inputMode: 'numeric' }}
                    />
                    <Autocomplete
                      multiple
                      id="checkboxes-tags-demo"
                      options={specials}
                      disableCloseOnSelect
                      getOptionLabel={(option) => option.title}
                      renderOption={(props, option, { selected }) => (
                        <li {...props}>
                          <Checkbox
                            icon={icon}
                            checkedIcon={checkedIcon}
                            style={{ marginRight: 8 }}
                            checked={selected}
                          />
                          {option.title}
                        </li>
                      )}
                      style={{ width: 180 }}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Specials" />
                      )}
                    />
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                  < Avatar sx={{ bgcolor: indigo[500] }}>P5</Avatar>
                  <TextField
                    required
                    id="name"
                    label="Score"
                    type="number"
                    variant="outlined"
                    sx={{ width: '100px'}}
                    />
                  <Autocomplete
                      multiple
                      id="checkboxes-tags-demo"
                      options={specials}
                      disableCloseOnSelect
                      getOptionLabel={(option) => option.title}
                      renderOption={(props, option, { selected }) => (
                        <li {...props}>
                          <Checkbox
                            icon={icon}
                            checkedIcon={checkedIcon}
                            style={{ marginRight: 8 }}
                            checked={selected}
                          />
                          {option.title}
                        </li>
                      )}
                      style={{ width: 180 }}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Specials" />
                      )}
                    />
              </Stack>
              
              <FormControl sx={{ m: 1, minWidth: 120 }}>
              <InputLabel>Yasat</InputLabel>
                <Select
                  labelId="yasatSelectLabel"
                  id="yasatSelect"
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
