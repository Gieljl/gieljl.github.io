import * as React from "react";
import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";
import TextField from "@mui/material/TextField";
import { styled } from "@mui/material/styles";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import {
  Autocomplete,
  Avatar,
  Box,
  Checkbox,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
} from "@mui/material";

import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { addScore, addRoundScore, addYasat, selectPlayers } from "../players/playersSlice";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { useSnackbar } from 'notistack';
import { type } from "os";


const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const StyledFab = styled(Fab)({
  background: "#7df3e1",
  position: "absolute",
  zIndex: 1,
  top: -30,
  left: 0,
  right: 0,
  margin: "0 auto",
});

export function ScoreEntryDialog() {
  const { enqueueSnackbar } = useSnackbar();

  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    // Reset the yasatPlayer state
    setYasatPlayer("");
    // Reset the fieldValues object
    setFieldValues({});
  };

  // const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
  // const checkedIcon = <CheckBoxIcon fontSize="small" />;
  // const specials = [{ title: "FTH" }, { title: "FTPH" }];

  const gameStatus = useSelector((state: RootState) => state.game.status);
  const players = useAppSelector(selectPlayers);
  const dispatch = useAppDispatch();

  const [fieldValues, setFieldValues] = useState<{ [key: string]: number }>({});
  const handleTextFieldChange = (id: string, score: number) => {
    // if the score is 0 or undefined remove the key from the fieldValues object
    if (score === undefined) {
      const { [id]: _, ...rest } = fieldValues;
      setFieldValues(rest);
      return;
    } 
    // if the score is greater than 44 or less than 0 give an error
    if (score > 44 || score < 0) {
      enqueueSnackbar('Score must be between 0 and 44', { variant: 'error' });  
    }

    setFieldValues((prevValues) => ({
      ...prevValues,
      [id]: score,
    }));
  };

  const handleScores = () => {

    // if count of fieldValues object is smaller that the number of players give an error
    if (Object.keys(fieldValues).length < players.length) {
      enqueueSnackbar('Enter all scores', { variant: 'error' });
      return;
    }
    
    // if the fieldValues contain a score that is Not a number give an error
    if (Object.values(fieldValues).some((score) => isNaN(score))) {
      enqueueSnackbar('Scores must be a number', { variant: 'error' });
      return;
    }
   
    // if the fieldValues contains a score greater than 44 or less than 0 give an error
    if (Object.values(fieldValues).some((score) => score > 44 || score < 1)) {
      enqueueSnackbar('Scores must be between 0 and 44', { variant: 'error' });
      return;
    }

     // Check if the yasatPlayer state is empty
     if (yasatPlayer === "") {
      enqueueSnackbar('Select the player who called Yasat 🎉', { variant: 'info' });
      return;
    }

    // if the yasatPlayer fieldvalues is > 7 give an error
    if (fieldValues[yasatPlayer] > 7) {
      enqueueSnackbar('Yasat score cannot be more that 7', { variant: 'error' });
      return;
    }

    // Dispatch addYasat with the id of the player who called Yasat
    dispatch(addYasat({ id: yasatPlayer}));    

    // Iterate through the fieldValues object and dispatch addRoundScore for each player
    Object.entries(fieldValues).forEach(([id, score]) => {
      if (yasatPlayer === id) {
        score = 0;
      }
      dispatch(addRoundScore(id, score));
    });
    
    // Close the dialog
    handleClose();
  };

  const [yasatPlayer, setYasatPlayer] = useState<string>("");
  const handleYasat = (id: string) => {
    // if the yasatPlayer fieldvalues is > 7 give an error
    if (fieldValues[id] > 7) {
      enqueueSnackbar('Yasat score cannot be less that 7', { variant: 'error' });
      return;
    }

    setYasatPlayer(id);
  };

  return (
    <div>
      {gameStatus === "started" && (
        <StyledFab color="default" aria-label="add" onClick={handleClickOpen}>
          <AddIcon />
        </StyledFab>
      )}
      <Dialog
        fullScreen
        open={open}
        onClose={handleClose}
        TransitionComponent={Transition}
      >
        <AppBar
          color="default"
          sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
        >
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
              Add Scores
            </Typography>
            
            <Button
              autoFocus
              color="inherit"
              onClick={handleScores}
            >
              Save
            </Button>
          </Toolbar>
        </AppBar>

        <List>
          {players.map((player) => (
              <Box key={player.id} >
              <ListItem  secondaryAction={yasatPlayer === player.id ? <Avatar src="../../logo192.png" /> : <></>}  >
                  <Button onClick={() => handleYasat(player.id)}>
                    <ListItemAvatar>
                      <PlayerAvatar
                        name={player.name}
                        score={player.score}
                        id={player.id} />
                    </ListItemAvatar>
                  </Button>
                
                <TextField
                  onChange={(e) => handleTextFieldChange(player.id, Number(e.target.value))}
                  required
                  error={fieldValues[player.id] > 44 || fieldValues[player.id] < 1 || (isNaN(fieldValues[player.id]) && fieldValues[player.id] !== undefined)  }
                  label="Score"
                  variant="outlined"
                  inputProps={{ inputMode: "numeric" }}
                  sx={{ ml: 2, mr: 2, width: '100px' }} 
                />
            </ListItem>
            <Divider  sx={{ margin:1 }}/>
            </Box>
          ))}
        </List>


        {/* <Autocomplete
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
                  /> */}

        {/* <FormControl sx={{ m: 1, minWidth: 120 }}>
                <InputLabel>Yasat</InputLabel>
                <Select
                  labelId="yasatSelectLabel"
                  id="yasatSelect"
                  value={yasat}
                  label="Yasat"
                  onChange={handleChange}
                >
                  {players.map((player) => (
                    <MenuItem key={player.id} value={player.id}>
                      {player.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  Select the player who called Yasat 🎉
                </FormHelperText>
              </FormControl> */}
      </Dialog>
    </div>
  );
}
