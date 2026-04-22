import {
  TextField,
  Stack,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Box,
} from "@mui/material";
import React, { useState } from "react";
import { useAppDispatch } from "../../app/hooks";
import { setGameView } from "./gameSlice";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

export const Settings = () => {
  const dispatch = useAppDispatch();

  const [gameView, setGameViewState] = useState(
    useSelector((state: RootState) => state.game.view)
  );
  const handleChange = (event: SelectChangeEvent) => {
    setGameViewState(event.target.value as "classic" | "new" );
    dispatch(setGameView(gameView as "classic" | "new"));
  };

  return (
    <Stack direction="column" alignItems="left" spacing={5} mt={5}>
      <FormControl required>
        <InputLabel id="demo-simple-select-required-label">
          Game View
        </InputLabel>
        <Select
          labelId="demo-simple-select-required-label"
          id="demo-simple-select-required"
          value={gameView}
          label="Game View"
          onChange={handleChange}
          variant="outlined"
        >
          <MenuItem value={"classic"}>Classic</MenuItem>
          <MenuItem value={"new"}>New (Weighted)</MenuItem>
        </Select>
      </FormControl>
    </Stack>
  );
};
