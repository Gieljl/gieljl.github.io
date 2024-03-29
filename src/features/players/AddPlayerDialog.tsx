import * as React from "react";
import Dialog from "@mui/material/Dialog";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";

import {
  Avatar,
  Button,
  DialogActions,
  DialogContent,
  Stack,
  TextField,
} from "@mui/material";
import { addPlayer } from "./playersSlice";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { useState } from "react";
import Circle from "@uiw/react-color-circle";
import Wheel from "@uiw/react-color-wheel";
import { hsvaToHex } from "@uiw/color-convert";
import { PlayerList } from "./Players";
import { selectPlayers } from "./playersSlice";
import { enqueueSnackbar } from "notistack";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="down" ref={ref} {...props} />;
});

export function AddPlayerDialog() {
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const [playerName, setPlayerName] = useState("");
  const [open, setOpen] = React.useState(false);
  const [hex, setHex] = useState("");
  const [hsva, setHsva] = useState({ h: 214, s: 43, v: 90, a: 1 });

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setHex("");
    setPlayerName("");
    setOpen(false);
  };

  function stringAvatar(name: string) {
    return {
      children: `${name.slice(0, 2)}`,
    };
  }
  function changeColor(color: any) {
    setHsva(color.hsva);
    setHex(hsvaToHex(color.hsva));
  }

  const handleAdd = () => () => {
    // check if player name or color already exists
    if (players.some((player) => player.name === playerName)) {
      enqueueSnackbar("Name has to be unique. Please enter a different name.", { variant: "error" });
      return;
    }
    if (players.some((player) => player.color === hex)) {
      enqueueSnackbar("Color has to be unique! Use another color.", { variant: "error" });
      return;
    }
    
    dispatch(addPlayer(playerName, hex)) 
    handleClose()
  };

  return (
    <div>
      <Button
        onClick={handleClickOpen}
        variant="contained"
        sx={{
          height: "50px",
          width: "150px",
        }}
      >
        Add player
      </Button>

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
              Player Editor
            </Typography>
          </Toolbar>
        </AppBar>
        <DialogContent >
          <Stack direction={"column"} spacing={2} alignItems={"center"}   >
            <Stack direction={"row"} spacing={2}   >
              <Stack direction={"column"} alignItems={"center"} >
                <Typography
                  sx={{ fontSize: 13 }}
                  color="text.secondary"
                  gutterBottom
                >
                  Preview
                </Typography>
                <Avatar
                  {...stringAvatar(playerName)}
                  variant="circular"
                  sx={{
                    width: 55,
                    height: 55,
                    fontSize: "26px",
                    bgcolor: hex,
                  }}
                />
              </Stack>

              <Stack direction={"column"} maxWidth={250}>
                {players.length !== 0 && (
                  <>
                    <Typography
                      sx={{ fontSize: 13 }}
                      color="text.secondary"
                      gutterBottom
                    >
                      Others
                    </Typography>
                    <PlayerList />
                  </>
                )}
              </Stack>
            </Stack>

            <TextField
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              placeholder="Enter player name"
              label="Name"
              type="text"
              variant="outlined"
              inputProps={{ inputMode: "text" }}
              sx={{ width: "250px"}}
              
            />
            <Stack width={"250px"}>
              <Typography
                sx={{ mb: 2, fontSize: 13 }}
                color="text.secondary"
                gutterBottom
              >
                Select a Color
              </Typography>
              <Stack direction={"row"}>
                <Stack width={150}>
                  <Circle
                    colors={[
                      "#F44E3B",
                      "#FE9200",
                      "#FCDC00",
                      "#6495ED",
                      "#673AB7",
                      "#F60AF2",
                      "#37D67A",
                      "#F47373",
                      "#B3E1D8",
                    ]}
                    color={hex}
                    onChange={(color) => {
                      setHex(color.hex);
                    }}
                  />
                </Stack>

                <Wheel
                  color={hsva}
                  onChange={(color) => changeColor(color)}
                  width={110}
                  height={110}
                />
              </Stack>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            sx={{ margin: 1 }}
            disabled={hex === "" || playerName.length === 0}
            onClick={handleAdd()}
            variant="contained"
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
