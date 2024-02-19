import React, { useState } from "react";
import { Button, Chip, Stack, styled, useTheme } from "@mui/material";
import { PlayerScoreCard } from "./PlayerScoreCard";
import { useAppSelector } from "../../app/hooks";
import { RootState } from "../../app/store";
import { ScoreState, selectScores } from "../game/scoreSlice";
import { selectPlayers } from "./playersSlice";
import { WeightedValuesDialog } from "../stats/WeightedValues";
import { StatsFullScreenDialog } from "../stats/StatsDialog";
import CheckIcon from "@mui/icons-material/Check";
import { RoundHistoryDialog } from "../rounds/RoundHistoryDialog";
import { selectStatsWeight } from "../stats/statsSlice";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import logo from "../../yasa7.png";
import logolight from "../../yasa7_light.png";
import { SnackbarKey, closeSnackbar, enqueueSnackbar } from "notistack";
import { start } from "repl";

export type PlayerStats = {
  stats: Stat[];
};

export type WeightedScore = number;

export type Stat = {
  name: string;
  count: number;
};

export function PlayerRanking() {
  const theme = useTheme();
  const Offset = styled("div")(({ theme }) => theme.mixins.toolbar);
  const statsWeigts = useAppSelector(selectStatsWeight);
  const players = useAppSelector(selectPlayers);
  const currentScores = useAppSelector(selectScores);
  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);
  const [showStats, setShowStats] = useState(false);
  const [showLastRoundInfo, setShowLastRoundInfo] = useState(false);

  const newScoreState: ScoreState = {
    playerscores: [...currentScores],
  };
  const totalScores = [...scoreHistory, newScoreState];

  const getGameStatCount = (
    playerId: number,
    statName: string,
    scores: ScoreState[]
  ) => {
    return scores.reduce((total, round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );
      return (
        total +
        (playerRound
          ? playerRound.stats.filter((stat) => stat.name === statName).length
          : 0)
      );
    }, 0);
  };

  const getRoundStatCount = (
    playerId: number,
    statName: string,
    scores: ScoreState
  ) => {
    const playerRound = scores.playerscores.find(
      (player) => player.id === playerId
    );
    return playerRound
      ? playerRound.stats.filter((stat) => stat.name === statName).length
      : 0;
  };

  const calculateRoundScoreChange = (playerId: number) => {
    const previousRound = scoreHistory[scoreHistory.length - 1];
    const currentRound = newScoreState;
    //calculate the difference between the current round and the previous round
    const previousRoundPlayer = previousRound.playerscores.find(
      (player) => player.id === playerId
    );
    const currentRoundPlayer = currentRound.playerscores.find(
      (player) => player.id === playerId
    );
    const previousScore = previousRoundPlayer ? previousRoundPlayer.score : 0;
    const currentScore = currentRoundPlayer ? currentRoundPlayer.score : 0;
    return currentScore - previousScore;
  };

  const getPlayerWeightedScoreChange = (
    playerId: number,
    currentWeightedScore: number
  ) => {
    // Get the score state for previous round (excluding the current round)
    const LastRoundScoreState = [...scoreHistory];
    const totalStatsDuringLastRound = getPlayersGameStats(
      playerId,
      LastRoundScoreState
    );
    const weightedScoreDuringLastRound = getWeightedScore(
      totalStatsDuringLastRound,
      LastRoundScoreState
    );
    const weightedScoreChange =
      currentWeightedScore - weightedScoreDuringLastRound;
    return weightedScoreChange;
  };

  const onStatChipClick = () => {
    setShowStats(!showStats);

    if (!showStats) {
      const action = (snackbarId: SnackbarKey | undefined) => (
        <Button
          color="inherit"
          onClick={() => {
            closeSnackbar(snackbarId);
          }}
        >
          close
        </Button>
      );
      enqueueSnackbar("Tap statistics to show weight and score.", {
        variant: "info",
        action,
      });
    }
  };

  // Calulate the longest yasat streak of a player
  const getLongestYasatStreakOfPlayer = (
    playerId: number,
    scoreState: ScoreState[]
  ) => {
    return scoreState.reduce((longestStreak, round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );
      return playerRound
        ? Math.max(longestStreak, playerRound.yasatStreak)
        : longestStreak;
    }, 0);
  };

  // get the longest yasat of the game
  const getLongestYasatStreakOfGame = (scoreState: ScoreState[]) => {
    return scoreState.reduce((longestStreak, round) => {
      return Math.max(
        longestStreak,
        Math.max(...round.playerscores.map((player) => player.yasatStreak))
      );
    }, 0);
  };

  // get the current streak of a player
  const getCurrentYasatStreak = (playerId: number) => {
    const currentRound = currentScores.find((player) => player.id === playerId);
    return currentRound ? currentRound.yasatStreak : 0;
  };

  const getWeightedScore = (
    playerStats: PlayerStats,
    scoreState: ScoreState[]
  ) => {
    let weightedScore = 0;
    playerStats.stats.forEach((stat) => {
      const statWeight = statsWeigts.find(
        (weightedStat) => weightedStat.statName === stat.name
      );

      if (statWeight) {
        if (stat.name === "Longest Streak") {
          // check if its the longest streak of the game
          if (
            stat.count === getLongestYasatStreakOfGame(scoreState) &&
            stat.count > 1
          ) {
            weightedScore += 1 * statWeight.weight;
          }
        } else {
          weightedScore += stat.count * statWeight.weight;
        }
      }
    });
    return weightedScore;
  };

  const getPlayersGameStats = (playerId: number, scoreState: ScoreState[]) => {
    const playerStatistics: PlayerStats = { stats: [] };

    const longestStreak = getLongestYasatStreakOfPlayer(playerId, scoreState);
    if (longestStreak > 1) {
      playerStatistics.stats.push({
        name: "Longest Streak",
        count: longestStreak,
      });
    }
    statsWeigts.forEach((stat) => {
      if (stat.statName === "Longest Streak") return; // Not for longest streak
      const count = getGameStatCount(playerId, stat.statName, scoreState);
      if (count > 0) {
        playerStatistics.stats.push({
          name: stat.statName,
          count,
        });
      }
    });

    return playerStatistics;
  };

  const getPlayersRoundStats = (playerId: number) => {
    const playerStatistics: PlayerStats = { stats: [] };
    statsWeigts.forEach((stat) => {
      const count = getRoundStatCount(playerId, stat.statName, newScoreState);
      if (count > 0) {
        playerStatistics.stats.push({
          name: stat.statName,
          count,
        });
      }
    });

    return playerStatistics;
  };

  // create an array of players with their stats and weighted score
  const playersForRanking = players.map((player) => {
    const playerStats = getPlayersGameStats(player.id, totalScores);
    const calculatedWeightedScore = getWeightedScore(playerStats, totalScores);
    const roundStats = getPlayersRoundStats(player.id);
    const roundWeigtedScore = getPlayerWeightedScoreChange(
      player.id,
      calculatedWeightedScore
    );
    return {
      playerInfo: player,
      stats: playerStats,
      weightedScore: calculatedWeightedScore,
      roundStats: roundStats,
      roundWeigtedScore: roundWeigtedScore,
    };
  });

  // Sorting based on weighted score and then current score
  //sort by weighted score and if equal sort by the lowest currentScores
  playersForRanking.sort((a, b) => {
    if (a.weightedScore === b.weightedScore) {
      const aCurrentScore = currentScores.find(
        (score) => score.id === a.playerInfo.id
      )!.score;
      const bCurrentScore = currentScores.find(
        (score) => score.id === b.playerInfo.id
      )!.score;
      return aCurrentScore - bCurrentScore;
    } else {
      return b.weightedScore - a.weightedScore;
    }
  });

  return (
    <>
      <Stack
        direction="row"

        sx={{
          minWidth: "100%",
          zIndex: 2,
          maxWidth: "100%",
          position: "fixed",
          overflowX: "visible",
          overflowY: "hidden",
          bgcolor: theme.palette.background.paper,
          "&::-webkit-scrollbar": {
            display: "none",
          },
        }}
      >
        <Stack
          direction="row"
          mt={1}
          alignItems={"center"}
        >
          <img
            src={theme.palette.mode === "light" ? logolight : logo}
            className="App-logo-small"
            alt="logo"
          />

          <RoundHistoryDialog />
          <StatsFullScreenDialog />
          <WeightedValuesDialog />

          <Chip
            label="Stats"
            icon={showStats ? <CheckIcon /> : <></>}
            variant={showStats ? "filled" : "outlined"}
            color="primary"
            onClick={onStatChipClick}
            disabled={scoreHistory.length < 2}
          />

          {showStats && (
            <Chip
              label={showLastRoundInfo ? "Round" : "Game"}
              variant="filled"
              color="primary"
              sx={{ ml: 1, mr: 1 }}
              deleteIcon={<ArrowDropDownIcon />}
              onDelete={() => setShowLastRoundInfo(!showLastRoundInfo)}
              onClick={() => setShowLastRoundInfo(!showLastRoundInfo)}
              disabled={scoreHistory.length < 2}
            />
          )}
        </Stack>
      </Stack>

      <Stack direction="column" spacing={3} mt={"70px"} width={"85%"}>
        {playersForRanking.map((player) => (
          <PlayerScoreCard
            player={player.playerInfo}
            score={
              currentScores.find((score) => score.id === player.playerInfo.id)!
                .score || 0
            }
            statistics={player.stats}
            weightedScore={player.weightedScore}
            key={player.playerInfo.id}
            streakLength={getCurrentYasatStreak(player.playerInfo.id)}
            hasLongestStreak={
              getLongestYasatStreakOfGame(totalScores) ===
              player.stats.stats.find((stat) => stat.name === "Longest Streak")
                ?.count
            }
            showStats={showStats}
            roundStats={player.roundStats}
            roundWeigtedScore={player.roundWeigtedScore}
            roundScoreChange={calculateRoundScoreChange(player.playerInfo.id)}
            showLastRoundInfo={showLastRoundInfo}
          />
        ))}
        <Offset />
      </Stack>
    </>
  );
}
