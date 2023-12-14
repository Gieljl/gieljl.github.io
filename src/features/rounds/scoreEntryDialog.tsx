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

import {
  Avatar,
  Box,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
} from "@mui/material";

import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { addYasat, selectPlayers } from "../players/playersSlice";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { useSnackbar } from "notistack";
import { addScores, playerScore, selectScores } from "../game/scoreSlice";

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
    setRoundScores([]);
    setErrorStates({});
  };

  // const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
  // const checkedIcon = <CheckBoxIcon fontSize="small" />;
  // const specials = [{ title: "FTH" }, { title: "FTPH" }];

  const gameStatus = useSelector((state: RootState) => state.game.status);
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);

  const dispatch = useAppDispatch();

  const [yasatPlayer, setYasatPlayer] = useState<string>("");
  const handleYasat = (id: string) => {
    // if the player is already selected remove the selection
    if (yasatPlayer === id) {
      setYasatPlayer("");
      return;
    }

    //check if score entered for the player is above 7
    if (EnteredScores.some((player) => player.id === id && player.score > 7)) {
      enqueueSnackbar("Yasat score should be 7 or less", {
        variant: "error",
      });
      return;
    }

    // set the yasatPlayer state to the id of the player who called Yasat
    setYasatPlayer(id);
  };

  const handleScores = () => {
    // if count of roundScores array is smaller that the number of players give an error
    if (EnteredScores.length < players.length) {
      enqueueSnackbar("Enter all scores", { variant: "error" });
      return;
    }

    // if the roundscores contain a score that is Not a number give an error
    if (EnteredScores.some((player) => isNaN(player.score))) {
      enqueueSnackbar("Scores must be a number", { variant: "error" });
      return;
    }

    // if the fieldValues contains a score greater than 44 or less than 1 give an error
    if (EnteredScores.some((player) => player.score > 44 || player.score < 1)) {
      enqueueSnackbar(
        "Scores must be at least 1 and cannot be higher that 44",
        { variant: "error" }
      );
      return;
    }

    // Check if the yasatPlayer state is empty
    if (yasatPlayer === "") {
      enqueueSnackbar("Select the player who called Yasat 🎉", {
        variant: "info",
      });
      return;
    }

    // Check if the yasatPlayer score is less than 7
    if (
      EnteredScores.some(
        (player) => player.id === yasatPlayer && player.score > 7
      )
    ) {
      enqueueSnackbar("Yasat player score should be 7 or less", {
        variant: "error",
      });
      return;
    }

    // set the yassat player score to 0
    
      EnteredScores.find(
        (player) => player.id === yasatPlayer
      )!.score = 0;
    

    // calulate the new current state of the scores
    const newScores = currentScores.map((score) => {
      const roundScore = EnteredScores.find(
        (player) => player.id === score.id
      )?.score;
      return {
        id: score.id,
        score: score.score + (roundScore || 0),
        stats: []
      };
    }) as playerScore[];

    // add an entry to the stats array if this of this rounds yasat player
    newScores.find((player) => player.id === yasatPlayer)!.stats.push({name:"yasat"});
    // Dispatch addYasat with the id of the player who called Yasat
    dispatch(addYasat({ id: yasatPlayer }));

    // add the new score to state
    dispatch(addScores(newScores));

    // Close the dialog
    handleClose();
  };

  const [EnteredScores, setRoundScores] = useState<playerScore[]>([]);
  const [errorStates, setErrorStates] = useState<{ [key: string]: boolean }>(
    {}
  );

  // add the scores entered in text fields to the roundScores state
  const handleTextFieldChange = (id: string, score: number) => {
    // if the score entered is greater than 7 and the player is the yasat player give an error
    if (score > 7 && id === yasatPlayer) {
      enqueueSnackbar("Yasat score should be 7 or less", {
        variant: "error",
      });
      return;
    }

    // if the roundScores array already contains a score for the player update the score
    if (EnteredScores.some((player) => player.id === id)) {
      setRoundScores((prevValues) =>
        prevValues.map((player) =>
          player.id === id ? { ...player, score: score } : player
        )
      );
      return;
    }

    setRoundScores((prevValues) => [...prevValues, { id: id, score: score, stats: [] }]);
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

            <Button autoFocus color="inherit" onClick={handleScores}>
              Save
            </Button>
          </Toolbar>
        </AppBar>

        <List>
          {players.map((player) => (
            <Box key={player.id}>
              <ListItem
                secondaryAction={
                  yasatPlayer === player.id ? (
                    <Avatar src="../../logo192.png" />
                  ) : (
                    <></>
                  )
                }
              >
                <Button onClick={() => handleYasat(player.id)}>
                  <ListItemAvatar>
                    <PlayerAvatar
                      name={player.name}
                      score={
                        currentScores.find((score) => score.id === player.id)
                          ?.score || 0
                      }
                      id={player.id}
                    />
                  </ListItemAvatar>
                </Button>

                <TextField
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    handleTextFieldChange(player.id, value);
                    setErrorStates((prevStates) => ({
                      ...prevStates,
                      [player.id]:
                        value > 44 ||
                        value < 1 ||
                        isNaN(value) ||
                        (player.id === yasatPlayer && value > 7),
                    }));
                  }}
                  required
                  error={errorStates[player.id] || false}
                  label="Score"
                  variant="outlined"
                  inputProps={{ inputMode: "numeric" }}
                  sx={{ ml: 2, mr: 2, width: "100px" }}
                />
              </ListItem>
              <Divider sx={{ margin: 1 }} />
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
