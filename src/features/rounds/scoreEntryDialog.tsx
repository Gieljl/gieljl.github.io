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
import { selectPlayers } from "../players/playersSlice";
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

  const resetState = () => {
    setYasatPlayer("");
    setRoundScores([]);
    setErrorStates({});
  };

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    resetState();
  };

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

    // find the player id of the player in EnteredScores with the lowest score
    const lowestScorePlayer = EnteredScores.reduce((prev, current) =>
      prev.score < current.score ? prev : current
    ).id;

    // set yassat stat for the yasat player
    EnteredScores.find((player) => player.id === yasatPlayer)!.stats.push({ name: "Yasat" });
    
    // set the yasatStreak for the yasat player
    EnteredScores.find((player) => player.id === yasatPlayer)!.yasatStreak =
      currentScores.find((score) => score.id === yasatPlayer)?.yasatStreak || 0;
    


    // Handle Owns and Owned stats and scores
    EnteredScores.forEach((player) => {
      if (
        player.score <
        EnteredScores.find((player) => player.id === yasatPlayer)!.score
      ) {
        player.stats.push({ name: "Own" });
        player.score = 0;
        EnteredScores.find((player) => player.id === yasatPlayer)!.stats.push({ name: "Owned" });
        EnteredScores.find((player) => player.id === yasatPlayer)!.score = 35;
      }
    });

    // if the yasat player is has no "owned" stat, set his entered score to 0
    if (!EnteredScores.find((player) => player.id === yasatPlayer)!.stats.some((stat) => stat.name === "Owned")) {
      EnteredScores.find((player) => player.id === yasatPlayer)!.score = 0;
    }
    
    //  Add scores to current scores
    EnteredScores.forEach((player) => {
      const currentScore = currentScores.find((score) => score.id === player.id)
        ?.score;
      if (currentScore) {
        player.score = currentScore + player.score;
      }
    });

    // Check for deaths (> 100)
    EnteredScores.forEach((player) => {
      if (player.score > 100) {
        player.stats.push({ name: "Death" });
        player.score = 0;
        // add a Kill entry for each death player to the yasatPlayer of this round
        EnteredScores
          .find((player) => player.id === yasatPlayer)!
          .stats.push({ name: "Kill" });
      }
    });
    
    // check for nullifies
    EnteredScores.forEach((player) => {
      const currentScore = currentScores.find((score) => score.id === player.id)?.score;

      if (player.score === 50) {
        player.stats.push({ name: "Nullify 50" });
        player.score = 0;
        EnteredScores.find((player) => player.id === lowestScorePlayer)!.stats.push({ name: "Enable 50" });
      } else if (currentScore === 69 && player.score === 100)  {
        player.stats.push({ name: "Lullify" });
        player.score = 0;
        EnteredScores.find((player) => player.id === lowestScorePlayer)!.stats.push({ name: "Enable 69" });
      } else if (player.score === 100) {
        player.stats.push({ name: "Nullify 100" });
        player.score = 0;
        EnteredScores.find((player) => player.id === lowestScorePlayer)!.stats.push({ name: "Enable 100" });
      }
    });

    // Check for Contra Owns
    EnteredScores.forEach((player) => {
      const currentScore = currentScores.find((score) => score.id === player.id)?.score;
      // if player.stats contains "nullify 50" and the currentScore is 15
      if (player.stats.some((stat) => stat.name === "Nullify 50") && currentScore === 15) {
        player.stats.push({ name: "Contra-own 50" });
      }
      if (player.stats.some((stat) => stat.name === "Nullify 100") && currentScore === 65) {
        player.stats.push({ name: "Contra-own 100" });
      }
    });

        
    // add the new score to state
    dispatch(addScores(EnteredScores));

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

    setRoundScores((prevValues) => [
      ...prevValues,
      { id: id, score: score, stats: [], yasatStreak: 0 },
    ]);
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
      </Dialog>
    </div>
  );
}
