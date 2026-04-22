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
import { useAppDispatch, useAppSelector } from "../../app/hooks";
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
import PersonIcon from "@mui/icons-material/Person";
import LogoutIcon from "@mui/icons-material/Logout";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import CloseIcon from "@mui/icons-material/Close";
import RulesPopUp from "../game/RulesText";
import { IdentityDialog } from "../identity/IdentityDialog";
import { selectCurrentPlayer, logout, setPlayerColor } from "../identity/identitySlice";
import { updatePlayerColor } from "../identity/playerService";
import Circle from "@uiw/react-color-circle";
import Wheel from "@uiw/react-color-wheel";
import { hsvaToHex, hexToHsva } from "@uiw/color-convert";
import PaletteIcon from "@mui/icons-material/Palette";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import CastConnectedIcon from "@mui/icons-material/CastConnected";
import { useEndRankedGame } from "../game/useEndRankedGame";
import { selectSessionRole, clearSession } from "../session/sessionSlice";
import { JoinGameDialog } from "../session/JoinGameDialog";
import { deleteSession as deleteSessionDoc } from "../session/sessionService";
import { selectSessionCode, selectIsSharing, setSharing } from "../session/sessionSlice";

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
  const currentPlayer = useAppSelector(selectCurrentPlayer);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const gameType = useSelector((state: RootState) => state.game.type);
  const endRankedGame = useEndRankedGame();
  const sessionRole = useAppSelector(selectSessionRole);
  const sessionCode = useAppSelector(selectSessionCode);
  const isSharing = useAppSelector(selectIsSharing);
  const isViewer = sessionRole === "viewer";
  const [openIdentity, setOpenIdentity] = React.useState(false);
  const [openJoinGame, setOpenJoinGame] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [colorHsva, setColorHsva] = React.useState(() =>
    hexToHsva(currentPlayer?.color || '#7df3e1')
  );

  React.useEffect(() => {
    setColorHsva(hexToHsva(currentPlayer?.color || '#7df3e1'));
  }, [currentPlayer?.color]);

  const PLAYER_COLORS = [
    '#7df3e1', '#f47373', '#697689', '#37d67a', '#2ccce4',
    '#555555', '#dce775', '#ff8a65', '#ba68c8', '#4dd0e1',
  ];

  const handleColorChange = (hex: string) => {
    dispatch(setPlayerColor(hex));
    if (currentPlayer) {
      updatePlayerColor(currentPlayer.username, hex).catch(() => {});
    }
  };

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
    // If host was sharing, delete the Firestore session
    if (isSharing && sessionCode) {
      deleteSessionDoc(sessionCode).catch(() => {});
      dispatch(setSharing(false));
    }
    dispatch(clearSession());
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
        {!currentPlayer ? (
          <ListItemButton key="login" onClick={() => setOpenIdentity(true)}>
            <ListItemIcon>
              <PersonIcon />
            </ListItemIcon>
            <ListItemText primary="Login / Register (BETA)" />
          </ListItemButton>
        ) : (
          <>
            <ListItemButton key="logout" onClick={() => dispatch(logout())}>
              <ListItemIcon>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary={`Logout (${currentPlayer.displayName})`} />
            </ListItemButton>
            <ListItemButton key="color" onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}>
              <ListItemIcon>
                <PaletteIcon sx={{ color: currentPlayer.color || '#7df3e1' }} />
              </ListItemIcon>
              <ListItemText primary="Change Color" />
            </ListItemButton>
            {showColorPicker && (
              <Box sx={{ px: 2, py: 1 }} onClick={(e) => e.stopPropagation()}>
                <Circle
                  colors={PLAYER_COLORS}
                  color={currentPlayer.color || '#7df3e1'}
                  onChange={(c) => {
                    setColorHsva(hexToHsva(c.hex));
                    handleColorChange(c.hex);
                  }}
                />
                <Stack direction="row" justifyContent="center" mt={1}>
                  <Wheel
                    color={colorHsva}
                    onChange={(c) => {
                      setColorHsva(c.hsva);
                      handleColorChange(hsvaToHex(c.hsva));
                    }}
                    width={140}
                    height={140}
                  />
                </Stack>
              </Box>
            )}
          </>
        )}
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
        {gameStatus === "started" && gameType === "ranked" && !isViewer && (
          <ListItemButton key="endRanked" onClick={endRankedGame}>
            <ListItemIcon>
              <SportsScoreIcon />
            </ListItemIcon>
            <ListItemText primary="End Ranked Game" />
          </ListItemButton>
        )}
        {!isViewer && (
          <ListItemButton key="settings" onClick={handleClickOpenSettings}>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" onClick={handleClickOpenSettings} />
          </ListItemButton>
        )}
        <ListItemButton key="joinOnline" onClick={() => setOpenJoinGame(true)}>
          <ListItemIcon>
            <CastConnectedIcon />
          </ListItemIcon>
          <ListItemText primary="Join Online Game" />
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
          <ListItemText primary="About Yasat" onClick={handleClickOpen} />
        </ListItemButton>
      </List>
    </Box>
  );

  const [open, setOpen] = React.useState(false);
  const [openSettings, setOpenSettings] = React.useState(false);
  const [openRules, setOpenRules] = React.useState(false);

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
      <DialogTitle id="settings-dialog">{"Game Settings"}</DialogTitle>
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
      <DialogTitle id="alert-dialog-title">{"About"}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          One of the most significant outfits in the card gaming scene!
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
          <IdentityDialog open={openIdentity} onClose={() => setOpenIdentity(false)} />
          <JoinGameDialog open={openJoinGame} onClose={() => setOpenJoinGame(false)} />
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
