import * as React from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import IconButton from "@mui/material/IconButton";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
  Stack,
} from "@mui/material";

import { useAppSelector } from "../../app/hooks";
import { useAppDispatch } from "../../app/hooks";

import { selectStatsWeight, resetStats, updateStatWeight, updateGameType, selectStatsGameType } from "./statsSlice";

export function WeightTable() {
  const dispatch = useAppDispatch();
  const statsGameType = useAppSelector(selectStatsGameType);
  const statsWeights = useAppSelector(selectStatsWeight);
  const [gameType, setGameTypeState] = React.useState(statsGameType);

  React.useEffect(() => {
    // Update the Redux store when local state changes
    dispatch(updateGameType(gameType));
  }, [gameType, dispatch]);

  const handleChange = (event: SelectChangeEvent) => {
    const newGameType = event.target.value;

    setGameTypeState(newGameType);

    // If gameType is default, set statsWeights to default
    if (newGameType === "default") {
      dispatch(resetStats());
    }
  };

  const handleIncrement = (statName: string) => {
    const statToUpdate = statsWeights.find((stat) => stat.statName === statName);
    if (statToUpdate !== undefined) {
      const updatedWeight = statToUpdate.weight + 1;
      dispatch(updateStatWeight({ statName, weight: updatedWeight }));
    }
  };
  
  const handleDecrement = (statName: string) => {
    const statToUpdate = statsWeights.find((stat) => stat.statName === statName);
    if (statToUpdate !== undefined) {
      const updatedWeight = statToUpdate.weight - 1;
      dispatch(updateStatWeight({ statName, weight: updatedWeight }));
    }
  };

  return (
    <>
      <FormControl sx={{ margin: 3 }} required>
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
          <MenuItem value={"default"}>Default</MenuItem>
          <MenuItem value={"custom"}>Custom</MenuItem>
        </Select>
      </FormControl>
      <TableContainer>
        <Table stickyHeader sx={{ minWidth: "100%" }}>
          <TableHead>
            <TableRow
              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
            >
              <TableCell>Stat</TableCell>
              <TableCell align="center">Weighted Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {statsWeights.map((row) => (
              <TableRow
                key={row.statName}
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                <TableCell component="th" scope="row">
                  {row.statName}
                </TableCell>
                <TableCell align="center">
                  {gameType === "custom" ? (
                    <Stack direction="row"
                      alignItems="center"
                      justifyContent="center"
                      spacing={1}
                    >
                      <IconButton color="primary" onClick={() => handleDecrement(row.statName)}>
                        <RemoveIcon />
                      </IconButton>
                      <Typography>{row.weight}</Typography>
                      <IconButton color="primary" onClick={() => handleIncrement(row.statName)}>
                        <AddIcon />
                      </IconButton>
                    </Stack>
                  ) : (
                    row.weight
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
