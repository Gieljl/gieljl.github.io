import * as React from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import SettingsIcon from "@mui/icons-material/Settings";
import {
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
  Stack,

  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import InfoIcon from "@mui/icons-material/Info";
import { useAppDispatch } from "../../app/hooks";
import { startNewGame } from "../game/gameSlice";
import { resetPlayers } from "../players/playersSlice";
import { resetScores } from "../game/scoreSlice";
import { ActionCreators } from "redux-undo";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { setGameType } from "../game/gameSlice";

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
          <ListItemText
            primary="New Game"
            onClick={() =>
              dispatch(startNewGame()) &&
              dispatch(resetPlayers()) &&
              dispatch(resetScores()) &&
              dispatch(ActionCreators.clearHistory())
            }
          />
        </ListItemButton>
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
  const [gameTypeState, setGameTypeState] = React.useState(
    useSelector((state: RootState) => state.game.type)
  );

  React.useEffect(() => {
    dispatch(setGameType(gameTypeState as "classic" | "ranked"));
  }, [gameTypeState, dispatch]);
  
  
  const handleChange = (event: SelectChangeEvent) => {
    setGameTypeState(event.target.value as "classic" | "ranked");
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


  return (
    <div>
      {(["bottom"] as const).map((anchor) => (
        <React.Fragment key={anchor}>
          <IconButton color="inherit" onClick={toggleDrawer(anchor, true)}>
            <MenuIcon />
          </IconButton>
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

          <Dialog open={openSettings} onClose={handleCloseSettings} fullWidth>
            <DialogTitle id="settings-dialog">{"Game Settings"}</DialogTitle>
            <DialogContent>
              <Stack direction="column" alignItems="left" spacing={5} mt={5}>
                <FormControl required>
                  <InputLabel id="demo-simple-select-required-label">
                    Game Type
                  </InputLabel>
                  <Select
                    labelId="demo-simple-select-required-label"
                    id="demo-simple-select-required"
                    value={gameTypeState}
                    label="Game Type"
                    onChange={handleChange}
                    variant="outlined"
                  >
                    <MenuItem value={"classic"}>Classic</MenuItem>
                    <MenuItem value={"ranked"}>Ranked</MenuItem>
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
