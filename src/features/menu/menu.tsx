import * as React from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  AppBar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slide,
  Stack,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import InfoIcon from "@mui/icons-material/Info";
import { useAppDispatch } from "../../app/hooks";
import { goHome } from "../game/gameSlice";
import { resetPlayers } from "../players/playersSlice";
import { resetScores } from "../game/scoreSlice";
import { ActionCreators } from "redux-undo";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { setGameView } from "../game/gameSlice";
import { TransitionProps, closeSnackbar, enqueueSnackbar } from "notistack";
import { resetStats } from "../stats/statsSlice";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import CloseIcon from "@mui/icons-material/Close";
import RulesPopUp from "../game/RulesText";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import {
  GAMES,
  useGameSelection,
} from "../gameSelection/gameSelectionContext";
import { GameSwitcherDialog } from "../gameSelection/GameSwitcherDialog";

type Anchor = "top" | "left" | "bottom" | "right";

export default function Menu({
  toggleColorMode,
}: {
  toggleColorMode: () => void;
}) {
  const [state, setState] = React.useState({
    top: false,
    left: false,
    bottom: false,
    right: false,
  });
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const gameStatus = useSelector((state: RootState) => state.game.status);

  const toggleDrawer =
    (anchor: Anchor, open: boolean) =>
    (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === "keydown" &&
        ((event as React.KeyboardEvent).key === "Tab" ||
          (event as React.KeyboardEvent).key === "Shift")
      ) {
        return;
      }

      setState({ ...state, [anchor]: open });
    };

  const refreshApp = async () => {
    window.location.reload();
  };

  /** Clear all local game state and return to the home screen. */
  const clearAllLocalState = () => {
    dispatch(goHome());
    dispatch(resetPlayers());
    dispatch(resetScores());
    dispatch(resetStats());
    dispatch(ActionCreators.clearHistory());
  };

  const onClickNewGame = () => {
    enqueueSnackbar(
      `This will delete all data of the game in progress. Are you sure you want to proceed?`,
      {
        variant: "warning",
        persist: true,
        action: (key) => (
          <>
            <Button
              color="inherit"
              onClick={() => {
                clearAllLocalState();
                closeSnackbar(key);
              }}
            >
              Yes
            </Button>
            <Button
              color="inherit"
              onClick={() => {
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
  };

  const onClickLeaveGame = () => {
    enqueueSnackbar(`Leave the current game and return to the start screen?`, {
      variant: "warning",
      persist: true,
      action: (key) => (
        <>
          <Button
            color="inherit"
            onClick={() => {
              clearAllLocalState();
              closeSnackbar(key);
            }}
          >
            Yes
          </Button>
          <Button
            color="inherit"
            onClick={() => {
              closeSnackbar(key);
            }}
          >
            No
          </Button>
        </>
      ),
    });
  };

  const list = (anchor: Anchor) => (
    <Box
      sx={{ width: anchor === "top" || anchor === "bottom" ? "auto" : 220 }}
      onClick={toggleDrawer(anchor, false)}
      onKeyDown={toggleDrawer(anchor, false)}
    >
      <List>
        <ListItemButton key="NewGame">
          <ListItemIcon>
            <AddCircleIcon />
          </ListItemIcon>
          <ListItemText primary="New Game" onClick={onClickNewGame} />
        </ListItemButton>
        {gameStatus === "started" && (
          <ListItemButton key="leaveGame" onClick={onClickLeaveGame}>
            <ListItemIcon>
              <ExitToAppIcon />
            </ListItemIcon>
            <ListItemText primary="Leave Game" />
          </ListItemButton>
        )}
        <ListItemButton key="settings" onClick={handleClickOpenSettings}>
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText primary="Settings" onClick={handleClickOpenSettings} />
        </ListItemButton>
        <ListItemButton key="Theme">
          <ListItemIcon onClick={toggleColorMode}>
            {theme.palette.mode === "dark" ? (
              <Brightness7Icon />
            ) : (
              <Brightness4Icon />
            )}
          </ListItemIcon>
          <ListItemText
            primary={theme.palette.mode === "dark" ? "Light Mode" : "Dark Mode"}
            onClick={toggleColorMode}
          />
        </ListItemButton>
        <ListItemButton key="refresh">
          <ListItemIcon>
            <RefreshIcon />
          </ListItemIcon>
          <ListItemText primary="Refresh" onClick={refreshApp} />
        </ListItemButton>
        <ListItemButton key="switchGame" onClick={() => setOpenSwitcher(true)}>
          <ListItemIcon>
            <SwapHorizIcon />
          </ListItemIcon>
          <ListItemText primary={`Switch Game (${activeGameDef.label})`} />
        </ListItemButton>
        <ListItemButton key="rules">
          <ListItemIcon>
            <HelpOutlineIcon />
          </ListItemIcon>
          <ListItemText primary="Rules" onClick={handleClickOpenRules} />
        </ListItemButton>
        <ListItemButton key="about">
          <ListItemIcon>
            <InfoIcon />
          </ListItemIcon>
          <ListItemText primary={`About ${activeGameDef.label}`} onClick={handleClickOpen} />
        </ListItemButton>
      </List>
    </Box>
  );

  const [open, setOpen] = React.useState(false);
  const [openSettings, setOpenSettings] = React.useState(false);
  const [openRules, setOpenRules] = React.useState(false);
  const [openSwitcher, setOpenSwitcher] = React.useState(false);
  const { activeGame } = useGameSelection();
  const activeGameDef = GAMES[activeGame];

  const [gameViewState, setGameViewState] = React.useState(
    useSelector((state: RootState) => state.game.view)
  );

  React.useEffect(() => {
    dispatch(setGameView(gameViewState as "classic" | "new"));
  }, [gameViewState, dispatch]);

  const handleChange = (event: SelectChangeEvent) => {
    setGameViewState(event.target.value as "classic" | "new");
  };

  const handleClickOpenRules = () => {
    setOpenRules(true);
  };

  const handleCloseRules = () => {
    setOpenRules(false);
  };

  const handleClickOpenSettings = () => {
    setOpenSettings(true);
  };

  const handleCloseSettings = () => {
    setOpenSettings(false);
  };

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
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
        sx={{ background: "#424242", color: "primary.main", position: "relative" }}
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
            {`${activeGameDef.label} rules explained`}
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
          <RulesPopUp/>
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

  const SettingsDialogContent: React.FC = () => (
    <Dialog open={openSettings} onClose={handleCloseSettings} fullWidth>
      <DialogTitle id="settings-dialog" sx={{ color: 'primary.main' }}>{"Game settings"}</DialogTitle>
      <DialogContent>
        <Stack direction="column" alignItems="left" spacing={5} mt={5}>
          <FormControl required>
            <InputLabel id="demo-simple-select-required-label">
              Game View
            </InputLabel>
            <Select
              labelId="demo-simple-select-required-label"
              id="demo-simple-select-required"
              value={gameViewState}
              label="Game View"
              onChange={handleChange}
              variant="outlined"
            >
              <MenuItem value={"classic"}>Classic (Points and stats)</MenuItem>
              <MenuItem value={"new"}>New (Weighted stats score)</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseSettings} autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  const AboutDialogContent: React.FC = () => (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{`About ${activeGameDef.label}`}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          One of the most significant outfits in the card gaming scene!
        </DialogContentText>
        <DialogContentText sx={{ mt: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
          {process.env.REACT_APP_BUILD_DATE
            ? `Built: ${process.env.REACT_APP_BUILD_DATE}`
            : `Build: ${process.env.REACT_APP_BUILD_VERSION || 'dev'}`}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} autoFocus>
          Agree
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <div>
      {(["bottom"] as const).map((anchor) => (
        <React.Fragment key={anchor}>
          <IconButton color="primary" onClick={toggleDrawer(anchor, true)}>
            <MenuIcon />
          </IconButton>
          <AboutDialogContent />
          <SettingsDialogContent />
          <RulesDialogContent />
          <GameSwitcherDialog
            open={openSwitcher}
            onClose={() => setOpenSwitcher(false)}
          />
          <Drawer
            ModalProps={{
              keepMounted: false,
            }}
            anchor={anchor}
            open={state[anchor]}
            onClose={toggleDrawer(anchor, false)}
          >
            {list(anchor)}
          </Drawer>
        </React.Fragment>
      ))}
    </div>
  );
}
