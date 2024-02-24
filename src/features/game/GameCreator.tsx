import {
  Stack,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Box,
  useTheme,
  AppBar,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  IconButton,
  Slide,
  Toolbar,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { ActionCreators } from "redux-undo";
import { setStartScores } from "../game/scoreSlice";
import { selectPlayers } from "../players/playersSlice";
import { PlayerList } from "../players/Players";
import { startGame, setGameType } from "./gameSlice";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import "../../App.css";
import { AddPlayerDialog } from "../players/AddPlayerDialog";
import { TransitionProps } from "notistack";
import RulesPopUp from "./RulesText";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

export const GameCreator = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const [gameType, setGameTypeState] = useState("ranked");
  const handleChange = (event: SelectChangeEvent) => {
    setGameTypeState(event.target.value);
  };
  const [openRules, setOpenRules] = React.useState(false);
  const handleClickOpenRules = () => {
    setOpenRules(true);
  };
  const handleCloseRules = () => {
    setOpenRules(false);
  };

  const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
      children: React.ReactElement;
    },
    ref: React.Ref<unknown>
  ) {
    return <Slide direction="up" ref={ref} {...props} />;
  });

  const RulesDialogContent: React.FC = () => (
    <Dialog
      fullScreen
      open={openRules}
      onClose={handleCloseRules}
      TransitionComponent={Transition}
    >
      <AppBar
        sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="primary"
            onClick={handleCloseRules}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Yasat Rules Explained
          </Typography>
        </Toolbar>
      </AppBar>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          <Stack direction={"row"} alignContent={"center"}>
            <img
              src={theme.palette.mode === "light" ? logolight : logo}
              className="App-logo-big"
              alt="logo"
            />
          </Stack>
          <RulesPopUp />
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          sx={{ margin: 1 }}
          onClick={handleCloseRules}
          variant="contained"
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <>
      <Box mt={5}>
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo-big"
          alt="logo"
        />
      </Box>

      <Stack
        direction="column"
        alignItems="center"
        spacing={5}
        mt={5}
        sx={{
          height: "100vh",
          width: "150px",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <PlayerList />
        {players.length < 2 && (
          <Stack direction={"column"} alignItems={"center"}>
            <Typography
              sx={{ fontSize: 15 }}
              color="text.secondary"
              gutterBottom
            >
              Add at least 2 players
            </Typography>
            <Typography
              sx={{ fontSize: 15 }}
              color="text.secondary"
              gutterBottom
            >
              to start the game...
            </Typography>
          </Stack>
        )}

        <AddPlayerDialog />
        <FormControl required>
          <InputLabel id="demo-simple-select-required-label">
            Game Type
          </InputLabel>
          <Select
            labelId="demo-simple-select-required-label"
            id="demo-simple-select-required"
            value={gameType}
            label="Game Type"
            onChange={handleChange}
            variant="outlined"
            sx={{
              height: "50px",
              width: "150px",
            }}
          >
            <MenuItem value={"classic"}>Classic</MenuItem>
            <MenuItem value={"ranked"}>Ranked</MenuItem>
          </Select>
        </FormControl>

        <Button
          disabled={players.length < 2 || gameType.length === 0}
          variant="contained"
          onClick={() =>
            dispatch(ActionCreators.clearHistory()) &&
            dispatch(startGame()) &&
            dispatch(setStartScores(players)) &&
            dispatch(setGameType(gameType as "classic" | "ranked"))
          }
          sx={{
            height: "50px",
            width: "150px",
          }}
        >
          Start game
        </Button>

        <Button
          onClick={handleClickOpenRules}
          variant="text"
          size="large"
          color="primary"
          startIcon={<HelpOutlineIcon fontSize="inherit" />}
          sx={{
            
            position: "absolute",
            zIndex: 5,
            bottom: 100,
            left: 0,
            right: 0,
          }}
        >
          Rules
        </Button>
        <RulesDialogContent />
      </Stack>
    </>
  );
};
