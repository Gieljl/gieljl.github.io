import * as React from "react";
import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";
import TextField from "@mui/material/TextField";
import { styled } from "@mui/material/styles";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import doublekill from "../../assets/audio/doublekill.mp3";
import multikill from "../../assets/audio/multikill.mp3";
import megakill from "../../assets/audio/megakill.mp3";
import monsterkill from "../../assets/audio/monsterkill.mp3";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  Stack,
  useTheme,
} from "@mui/material";

import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { selectPlayers } from "../players/playersSlice";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { PlayerAvatar } from "../players/PlayerAvatarScore";
import { closeSnackbar, useSnackbar } from "notistack";
import {
  addScores,
  playerScore,
  selectScoreState,
  selectScores,
} from "../game/scoreSlice";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export function ScoreEntryDialog() {
  const theme = useTheme();
  const fabColor = theme.palette.mode === "light" ? "#4BCDB9" : "#7df3e1";
  const StyledFab = styled(Fab)({
    background: fabColor,
    position: "absolute",
    zIndex: 5,
    top: -30,
    left: 0,
    right: 0,
    margin: "0 auto",
  });

  const { enqueueSnackbar } = useSnackbar();
  const [open, setOpen] = React.useState(false);
  const [newScores, setNewScores] = useState<playerScore[]>([]);
  const [errorStates, setErrorStates] = useState<{ [key: string]: boolean }>(
    {}
  );

  const resetState = () => {
    setYasatPlayer(null);
    setNewScores([]);
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
  const gameType = useSelector((state: RootState) => state.game.type);

  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreState = useAppSelector(selectScoreState);

  const dispatch = useAppDispatch();
  const [yasatPlayer, setYasatPlayer] = useState<number | null>(null);
  const [autoYasat, setAutoYasat] = useState<boolean>(true);

  useEffect(() => {
    // Check if all player scores are entered
    const allScoresEntered = newScores.length === players.length;

    // Count the number of players with a score of 7 or less
    const lowScorePlayers = newScores.filter((player) => player.score <= 7);

    if (allScoresEntered && lowScorePlayers.length === 1) {
      // Set the yasatPlayer state to the ID of the player with a score of 7 or less
      setYasatPlayer(lowScorePlayers[0].id);
      setAutoYasat(true);
    } else if (allScoresEntered && lowScorePlayers.length > 1) {
      // If there are more than one player with a score of 7 or less
      // Reset yasatPlayer state
      setYasatPlayer(null);
      setAutoYasat(false);
    } else {
      // Reset yasatPlayer state if conditions are not met
      setYasatPlayer(null);
    }
  }, [newScores, players]);

  const handleYasat = (id: number) => {
    // if the player is already selected remove the selection
    if (yasatPlayer === id) {
      setYasatPlayer(null);
      return;
    }

    //check if score entered for the player is above 7
    if (newScores.some((player) => player.id === id && player.score > 7)) {
      enqueueSnackbar("Yasat score should be 7 or less", {
        variant: "error",
      });
      return;
    }

    // set the yasatPlayer state to the id of the player who called Yasat
    setYasatPlayer(id);
  };

  const validateScores = () => {
    if (newScores.length < players.length) {
      return "Enter all scores";
    }

    if (newScores.some((player) => isNaN(player.score))) {
      return "Scores must be a number";
    }

    if (newScores.some((player) => player.score > 44 || player.score < 1)) {
      return "Scores must be at least 1 and cannot be higher than 44";
    }

    if (yasatPlayer === null) {
      return "Select the player who called Yasat 🎉";
    }

    if (
      newScores.some((player) => player.id === yasatPlayer && player.score > 7)
    ) {
      return "Yasat player score should be 7 or less";
    }

    return null;
  };

  const handleScores = () => {
    const validationError = validateScores();

    if (validationError) {
      enqueueSnackbar(validationError, { variant: "error" });
      return;
    }

    // Find the player id of the player in newScores with the lowest score
    const lowestScorePlayerId = newScores.reduce((prev, current) =>
      prev.score < current.score ? prev : current
    ).id;

    // Update yasat player stats
    const yasatPlayerIndex = newScores.findIndex(
      (player) => player.id === yasatPlayer
    );
    newScores[yasatPlayerIndex].stats.push({ name: "Yasat" });
    newScores.forEach((player) => {
      player.yasatStreak =
        player.id === yasatPlayer
          ? currentScores.find((score) => score.id === yasatPlayer)
              ?.yasatStreak! + 1
          : 0;
    });

    // Handle Owns and Owned stats and scores
    newScores.forEach((player) => {
      if (player.score < newScores[yasatPlayerIndex].score) {
        player.stats.push({ name: "Own" });
        player.score = 0;
        newScores[yasatPlayerIndex].stats.push({ name: "Owned" });
      }
    });

    // Set yasat player score to 0 if no "owned" stat
    if (
      newScores[yasatPlayerIndex].stats.some((stat) => stat.name === "Owned")
    ) {
      newScores[yasatPlayerIndex].score = 35; // owned score
    } else {
      newScores[yasatPlayerIndex].score = 0; // yasat score
    }

    // set multi-own stats
    if (
      newScores[yasatPlayerIndex].stats.filter((stat) => stat.name === "Owned")
        .length > 1
    ) {
      newScores[yasatPlayerIndex].stats.push({ name: "Multi-owned" });
    }

    // Add scores to current scores
    newScores.forEach((player) => {
      const currentScore =
        currentScores.find((score) => score.id === player.id)?.score || 0;
      player.score = currentScore + player.score;
    });

    // Check for deaths (> 100)
    newScores.forEach((player) => {
      if (player.score > 100) {
        player.stats.push({ name: "Death" });
        player.score = 0;
        newScores[yasatPlayerIndex].stats.push({ name: "Kill" });
      }
    });

    // Handle multi-kills
    newScores.forEach((player) => {
      const killCount = player.stats.filter(
        (stat) => stat.name === "Kill"
      ).length;
      // if the killCount is greater than 1 add a multi stat to the player
      if (killCount === 2) {
        player.stats.push({ name: "Double Kill" });
        const dkAudio = new Audio(doublekill);
        dkAudio.play();
      }
      if (killCount === 3) {
        player.stats.push({ name: "Multi Kill" });
        const multikillAudio = new Audio(multikill);
        multikillAudio.play();
      }
      if (killCount === 4) {
        player.stats.push({ name: "Mega Kill" });
        const megakillAudio = new Audio(megakill);
        megakillAudio.play();
      }
      if (killCount === 5) {
        player.stats.push({ name: "Monster Kill" });
        const monsterkillAudio = new Audio(monsterkill);
        monsterkillAudio.play();
      }
    });

    // Check for nullifies
    newScores.forEach((player) => {
      const currentScore =
        currentScores.find((score) => score.id === player.id)?.score || 0;
      if (player.score === 50) {
        player.stats.push({ name: "Nullify 50" });
        player.score = 0;
        newScores
          .find((player) => player.id === lowestScorePlayerId)!
          .stats.push({ name: "Enable 50" });
      } else if (currentScore === 69 && player.score === 100) {
        player.stats.push({ name: "Lullify" });
        player.score = 0;
        newScores
          .find((player) => player.id === lowestScorePlayerId)!
          .stats.push({ name: "Enable 69" });
      } else if (player.score === 100) {
        player.stats.push({ name: "Nullify 100" });
        player.score = 0;
        newScores
          .find((player) => player.id === lowestScorePlayerId)!
          .stats.push({ name: "Enable 100" });
      }
    });

    // Check for Contra Owns
    newScores.forEach((player) => {
      const currentScore =
        currentScores.find((score) => score.id === player.id)?.score || 0;
      if (
        player.stats.some((stat) => stat.name === "Nullify 50") &&
        currentScore === 15
      ) {
        player.stats.push({ name: "Contra-own 50" });
      }
      if (
        player.stats.some((stat) => stat.name === "Nullify 100") &&
        currentScore === 65
      ) {
        player.stats.push({ name: "Contra-own 100" });
      }
    });

    // Sort array by player id
    newScores.sort((a, b) => a.id - b.id);

    // check if there is a score future in undo history
    if (scoreState.future.length > 0) {
      // give a message with the numer of rounds that is going to be deleted with an optopn to proceed or cancel
      enqueueSnackbar(
        `This will delete ${scoreState.future.length} rounds of redo "future". Are you sure you want to proceed?`,
        {
          variant: "warning",
          persist: true,
          action: (key) => (
            <>
              <Button
                color="inherit"
                onClick={() => {
                  dispatch(addScores(newScores));
                  handleClose();
                  enqueueSnackbar("Scores updated! ", { variant: "success" });
                  closeSnackbar(key);
                }}
              >
                Yes
              </Button>
              <Button
                color="inherit"
                onClick={() => {
                  enqueueSnackbar("Scores not updated", { variant: "info" });
                  closeSnackbar(key);
                  handleClose();
                }}
              >
                No
              </Button>
            </>
          ),
        }
      );
      return;
    }

    // Add the new score to state
    dispatch(addScores(newScores));

    // Close the dialog
    handleClose();
  };

  // add the scores entered in text fields to the roundScores state
  const handleTextFieldChange = (id: number, score: number) => {
    // if the score entered is greater than 7 and the player is the yasat player give an error

    // if the roundScores array already contains a score for the player update the score without change the position in the array
    if (newScores.some((player) => player.id === id)) {
      setNewScores((prevValues) =>
        prevValues.map((player) =>
          player.id === id ? { ...player, score: score } : player
        )
      );
      return;
    }

    setNewScores((prevValues) => [
      ...prevValues,
      { id: id, score: score, stats: [], yasatStreak: 0 },
    ]);

    if (score > 7 && id === yasatPlayer) {
      enqueueSnackbar("Yasat score should be 7 or less", {
        variant: "error",
      });
      return;
    }
  };

  function stringAvatar(name: string) {
    return {
      children: `${name.slice(0, 2)}`,
    };
  }

  const getBadgecolor = (score: number) => {
    let badgecolor:
      | "default"
      | "primary"
      | "secondary"
      | "error"
      | "success"
      | "warning"
      | "info" = "primary";

    if (score === 15 || score === 65 || score === 69 || score === 0) {
      badgecolor = "success";
    } else if (score > 60) {
      badgecolor = "secondary";
    } else {
      badgecolor = "default";
    }

    return badgecolor;
  };

  return (
    <div>
      {gameStatus === "started" && (
        <StyledFab color="primary" aria-label="add" onClick={handleClickOpen}>
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
          sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
        >
          <Toolbar>
            <IconButton
              edge="start"
              color="primary"
              onClick={handleClose}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Enter round scores
            </Typography>
          </Toolbar>
        </AppBar>

        <List>
          {players.map((player) => (
            <Box key={player.id}>
              <ListItem
                secondaryAction={
                  yasatPlayer === player.id ? (
                    <Avatar sx={{ mr: 2 }} src="../../logo192.png" />
                  ) : (
                    <></>
                  )
                }
              >
                <Stack direction={"row"} maxWidth={"80px"}>
                  <Button onClick={() => handleYasat(player.id)}>
                    <ListItemAvatar>
                      {gameType === "ranked" ? (
                        <Avatar
                          {...stringAvatar(player.name)}
                          sx={{ bgcolor: player.color }}
                          key={player.id}
                          variant="rounded"
                        />
                      ) : (
                        <PlayerAvatar
                          name={player.name}
                          score={
                            currentScores.find(
                              (score) => score.id === player.id
                            )?.score || 0
                          }
                          id={player.id}
                          color={player.color}
                        />
                      )}
                    </ListItemAvatar>
                  </Button>

                  {gameType === "ranked" && (
                    <Stack alignItems={"center"} spacing={1} direction="column">
                      <Typography
                        sx={{ fontSize: 11 }}
                        color="text.secondary"
                        gutterBottom
                      >
                        Points
                      </Typography>
                      <Chip
                        label={
                          currentScores.find((score) => score.id === player.id)
                            ?.score || 0
                        }
                        variant="filled"
                        color={getBadgecolor(
                          currentScores.find((score) => score.id === player.id)
                            ?.score || 0
                        )}
                      />
                    </Stack>
                  )}
                </Stack>

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
                  sx={{ ml: 6, mr: 2, width: "77px" }}
                />
              </ListItem>
              <Divider sx={{ margin: 1 }} />
            </Box>
          ))}
        </List>
        <Stack direction={"row"} spacing={1} alignSelf={"center"}>
          {autoYasat ? (
            <Typography
              sx={{ fontSize: 14 }}
              color="text.secondary"
              gutterBottom
            >
              Auto Yasat
            </Typography>
          ) : (
            <Typography
              sx={{ fontSize: 14 }}
              color="text.secondary"
              gutterBottom
            >
              Select Yasat player
            </Typography>
          )}
          {autoYasat ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 16 }} color="success" />
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 16 }} color="warning" />
          )}
        </Stack>
        <Button
          autoFocus
          variant="contained"
          sx={{ alignSelf: "center", height: 50, width: 100, mt: 2 }}
          color="primary"
          onClick={handleScores}
        >
          Save
        </Button>
      </Dialog>
    </div>
  );
}
