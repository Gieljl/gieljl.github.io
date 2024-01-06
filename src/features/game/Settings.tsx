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
import { setGameType } from "./gameSlice";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

export const Settings = () => {
  const dispatch = useAppDispatch();

  const [gameType, setGameTypeState] = useState(
    useSelector((state: RootState) => state.game.type)
  );
  const handleChange = (event: SelectChangeEvent) => {
    setGameTypeState(event.target.value as "classic" | "ranked" );
    dispatch(setGameType(gameType as "classic" | "ranked"));
  };

  return (
    <Stack direction="column" alignItems="left" spacing={5} mt={5}>
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
        >
          <MenuItem value={"classic"}>Classic</MenuItem>
          <MenuItem value={"ranked"}>Ranked</MenuItem>
        </Select>
      </FormControl>
    </Stack>
  );
};
