import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import ListItemText from '@mui/material/ListItemText';
import ListItem from '@mui/material/ListItem';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import TextField from '@mui/material/TextField';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { styled } from '@mui/material/styles';
import Fab from '@mui/material/Fab';


import AddIcon from "@mui/icons-material/Add";
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { Autocomplete, Avatar, Checkbox, FormControl, FormControlLabel, FormHelperText, FormLabel, Grid, InputAdornment, InputLabel, MenuItem, Radio, RadioGroup, Select, SelectChangeEvent, Stack } from '@mui/material';
import { deepOrange, deepPurple, indigo, teal, yellow } from '@mui/material/colors';



const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const StyledFab = styled(Fab)({
    background: '#7df3e1',
    position: 'absolute',
    zIndex: 1,
    top: -30,
    left: 0,
    right: 0,
    margin: '0 auto',
  });

export function ScoreEntryDialog() {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  
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
              
      <Dialog
        fullScreen
        open={open}
        onClose={handleClose}
        TransitionComponent={Transition}
      >
        <AppBar color="default" sx={{background:"#424242", color:"#7df3e1", position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleClose}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                Ronde Scores
            </Typography>
            <Button autoFocus color="inherit" onClick={handleClose}>
              Opslaan
            </Button>
          </Toolbar>
        </AppBar>
        <Grid container direction="row" spacing={4} alignItems="center" justifyContent="center" >
            <Grid item> 
              <Stack direction="column" spacing={2} mt={3} mb={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: teal[500] }}>P1</Avatar>
                  <TextField
                    required
                    id="name"
                    label="Score"
                    variant="outlined"
                    sx={{ width: '100px'}}
                    inputProps={{inputMode: 'numeric'}}
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
      </Dialog>
    </div>
  );
}

