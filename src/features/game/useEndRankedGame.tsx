import { ActionCreators } from "redux-undo";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React from "react";
import { Button } from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectPlayers, resetPlayers } from "../players/playersSlice";
import { resetScores, selectScores } from "./scoreSlice";
import { selectStatsWeight, resetStats } from "../stats/statsSlice";
import { goHome } from "./gameSlice";
import { RootState } from "../../app/store";
import {
  computeRankedGameResults,
  resultsToStatsEntries,
} from "./rankedStats";
import { saveRankedGameResult } from "../identity/playerService";

/**
 * Hook that returns a handler which prompts the user to end the ranked game,
 * then saves stats to Firestore and returns to the home screen.
 */
export function useEndRankedGame() {
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector(
    (state: RootState) => state.scores.past
  );
  const weights = useAppSelector(selectStatsWeight);

  const clearLocal = () => {
    dispatch(goHome());
    dispatch(resetPlayers());
    dispatch(resetScores());
    dispatch(resetStats());
    dispatch(ActionCreators.clearHistory());
  };

  const finish = async () => {
    const rounds = [
      ...scoreHistory,
      { playerscores: [...currentScores] },
    ];
    const results = computeRankedGameResults(players, rounds, weights);
    const winner = results[0];
    const entries = resultsToStatsEntries(results);

    try {
      await saveRankedGameResult(entries);
      enqueueSnackbar(
        winner
          ? `Game saved! Winner: ${winner.player.name}`
          : "Game saved.",
        { variant: "success" }
      );
    } catch {
      enqueueSnackbar("Could not save game stats. Please try again.", {
        variant: "error",
      });
      return;
    }
    clearLocal();
  };

  return () => {
    enqueueSnackbar(
      "End this ranked game now? Winner and stats will be saved online.",
      {
        variant: "warning",
        persist: true,
        action: (key) => (
          <>
            <Button
              color="inherit"
              onClick={() => {
                finish();
                closeSnackbar(key);
              }}
            >
              End
            </Button>
            <Button color="inherit" onClick={() => closeSnackbar(key)}>
              Cancel
            </Button>
          </>
        ),
      }
    );
  };
}
