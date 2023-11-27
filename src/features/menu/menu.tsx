import * as React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import SettingsIcon from '@mui/icons-material/Settings';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListItemButton } from '@mui/material';
import MenuIcon from "@mui/icons-material/Menu";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InfoIcon from '@mui/icons-material/Info';
import { useAppDispatch } from '../../app/hooks';
import { startNewGame } from '../game/gameSlice';
import { resetPlayers } from '../players/playersSlice';




type Anchor = 'top' | 'left' | 'bottom' | 'right';

export default function Menu() {
  const [state, setState] = React.useState({
    top: false,
    left: false,
    bottom: false,
    right: false,
  });

  const toggleDrawer =
    (anchor: Anchor, open: boolean) =>
    (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === 'keydown' &&
        ((event as React.KeyboardEvent).key === 'Tab' ||
          (event as React.KeyboardEvent).key === 'Shift')
      ) {
        return;
      }

      setState({ ...state, [anchor]: open });
    };

  const list = (anchor: Anchor) => (
    <Box
      sx={{ width: anchor === 'top' || anchor === 'bottom' ? 'auto' : 250 }}
      role="presentation"
      onClick={toggleDrawer(anchor, false)}
      onKeyDown={toggleDrawer(anchor, false)}
    >
      <List>
          <ListItemButton key="NewGame">
            <ListItemIcon>
              <AddCircleIcon />
            </ListItemIcon>
            <ListItemText primary="New Game" onClick={() => dispatch(startNewGame()) && dispatch(resetPlayers()) }/>
          </ListItemButton>
          <ListItemButton disabled key="settings">
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" />
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

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const dispatch = useAppDispatch();

  return (
    <div>
      {(['left'] as const).map((anchor) => (
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
              <DialogTitle id="alert-dialog-title">
                {"About"}
              </DialogTitle>
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
