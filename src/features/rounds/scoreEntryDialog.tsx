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
  Checkbox,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
} from "@mui/material";

import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { addScore, selectPlayers } from "../players/playersSlice";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { PlayerAvatar } from "../players/PlayerAvatar";

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
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const [yasat, setYasat] = React.useState("");

  const handleChange = (event: SelectChangeEvent) => {
    setYasat(event.target.value);
  };

  // const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
  // const checkedIcon = <CheckBoxIcon fontSize="small" />;
  // const specials = [{ title: "FTH" }, { title: "FTPH" }];

  const gameStatus = useSelector((state: RootState) => state.game.status);
  const players = useAppSelector(selectPlayers);
  const dispatch = useAppDispatch();

  const [fieldValues, setFieldValues] = useState<{ [key: string]: number }>({});
  const handleTextFieldChange = (id: string, score: number) => {
    setFieldValues((prevValues) => ({
      ...prevValues,
      [id]: score,
    }));
  };

  const handleScores = () => {
    // Iterate through the fieldValues object and dispatch addScore for each player
    Object.entries(fieldValues).forEach(([id, score]) => {
      dispatch(addScore({ id, score }));
    });
    // Reset the fieldValues object
    setFieldValues({});
    // Close the dialog
    handleClose();
  };

  return (
    <div>
      {gameStatus === "started" && (
        <StyledFab color="default" aria-label="add">
          <AddIcon onClick={handleClickOpen} />
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
            <Button autoFocus color="inherit" onClick={handleScores}>
              Save
            </Button>
          </Toolbar>
        </AppBar>
        <Grid
          container
          direction="row"
          spacing={4}
          alignItems="center"
          justifyContent="center"
        >
          <Grid item>
            <Stack direction="column" spacing={2} mt={3} mb={2}>
              {players.map((player) => (
                <Stack
                  key={player.id}
                  direction="row"
                  spacing={4}
                  alignItems="center"
                >
                  <PlayerAvatar
                    name={player.name}
                    score={player.score}
                    id={player.id}
                  />
                  <TextField
                    onChange={(e) =>
                      handleTextFieldChange(player.id, Number(e.target.value))
                    }
                    required
                    label="Score"
                    variant="outlined"
                    sx={{ width: "100px" }}
                    inputProps={{ inputMode: "numeric" }}
                  />
                </Stack>
              ))}

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

              <FormControl sx={{ m: 1, minWidth: 120 }}>
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
              </FormControl>
            </Stack>
          </Grid>
        </Grid>
      </Dialog>
    </div>
  );
}
