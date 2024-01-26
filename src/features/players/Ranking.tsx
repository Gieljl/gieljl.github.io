import React, { useState } from "react";
import { Chip, Stack, styled, useTheme } from "@mui/material";
import { PlayerScoreCard } from "./PlayerScoreCard";
import { useAppSelector } from "../../app/hooks";
import { RootState } from "../../app/store";
import { ScoreState, selectScores } from "../game/scoreSlice";
import { selectPlayers } from "./playersSlice";
import { WeightedValuesDialog } from "../stats/WeightedValues";
import { StatsFullScreenDialog } from "../stats/StatsDialog";
import { RoundHistoryDialog } from "../rounds/RoundHistoryDialog";
import { selectStatsWeight } from "../stats/statsSlice";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import logo from "../../logo192.png";
import logolight from "../../logo192_light.png";

export type PlayerStats = {
  stats: Stat[];
  weightedScore: number;
};

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
  const [showStats, setShowStats] = useState(true);
  //const [sorting, setSorting] = useState("rank");


  const newScoreState: ScoreState = {
    playerscores: [...currentScores],
  };
  const totalScores = [...scoreHistory, newScoreState];

  const getStatCount = (playerId: number, statName: string) => {
    return totalScores.reduce((total, round) => {
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

  const getLongestYasatStreakPlayer = (playerId: number) => {
    return totalScores.reduce((longestStreak, round) => {
      const playerRound = round.playerscores.find(
        (player) => player.id === playerId
      );
      return playerRound
        ? Math.max(longestStreak, playerRound.yasatStreak)
        : longestStreak;
    }, 0);
  };

  // get player with longest yasat streak of the game
  const getLongestYasatStreak = () => {
    return totalScores.reduce((longestStreak, round) => {
      return Math.max(
        longestStreak,
        Math.max(...round.playerscores.map((player) => player.yasatStreak))
      );
    }, 0);
  };

  const getCurrentYasatStreak = (playerId: number) => {
    const currentRound = currentScores.find((player) => player.id === playerId);
    return currentRound ? currentRound.yasatStreak : 0;
  };

  const getPlayerStats = (playerId: number) => {
    const playerStatistics: PlayerStats = { stats: [], weightedScore: 0 };

    const longestStreak = getLongestYasatStreakPlayer(playerId);
    if (longestStreak > 1) {
      playerStatistics.stats.push({
        name: "Longest Streak",
        count: longestStreak,
      });

      // const statWeight = statsWeigts.find((stat) => stat.statName === "Longest Streak")!;
      // playerStatistics.weightedScore += longestStreak * statWeight.weight;
    }

    // if player is equal to the longest streak of the game player add "Longest Streak" stat to playerStatistics.weightedScore
    if (longestStreak === getLongestYasatStreak() && longestStreak > 1) {
      const statWeight = statsWeigts.find(
        (stat) => stat.statName === "Longest Streak"
      )!;
      playerStatistics.weightedScore += 1 * statWeight.weight;
    }

    const statNames = [
      "Yasat",
      "Death",
      "Kill",
      "Own",
      "Owned",
      "Multi-owned",
      "Lullify",
      "Enable 69",
      "Contra-own 50",
      "Contra-own 100",
      "Nullify 50",
      "Nullify 100",
      "Enable 50",
      "Enable 100",
      "Double Kill",
      "Multi Kill",
      "Mega Kill",
      "Monster Kill",
    ];

    statNames.forEach((statName) => {
      const count = getStatCount(playerId, statName);
      const statWeight = statsWeigts.find(
        (stat) => stat.statName === statName
      ) || { weight: 0 };

      if (count > 0) {
        playerStatistics.stats.push({
          name: statName,
          count,
        });

        playerStatistics.weightedScore += count * statWeight.weight;
      }
    });

    return playerStatistics;
  };

  const [sortingMethod, setSortingMethod] = useState<"ranked" | "points">("ranked");

  const handleSortChipClick = () => {
    setSortingMethod((prevMethod) => (prevMethod === "ranked" ? "points" : "ranked"));
  };

  // create an array of players with their stats and weighted score
  // sort the array by weighted score
  const sortedPlayers = players.map((player) => {
    const playerStats = getPlayerStats(player.id);
    return {
      playerInfo: player,
      stats: playerStats,
      weightedScore: playerStats.weightedScore,
    };
  });
  // Sort players based on the chosen method
  sortedPlayers.sort((a, b) => {
    if (sortingMethod === "ranked") {
      // Sorting based on weighted score and then current score
      if (a.weightedScore === b.weightedScore) {
        const aCurrentScore = currentScores.find((score) => score.id === a.playerInfo.id)!.score;
        const bCurrentScore = currentScores.find((score) => score.id === b.playerInfo.id)!.score;
        return aCurrentScore - bCurrentScore;
      } else {
        return b.weightedScore - a.weightedScore;
      }
    } else {
      // Sorting based solely on current score
      const aCurrentScore = currentScores.find((score) => score.id === a.playerInfo.id)!.score;
      const bCurrentScore = currentScores.find((score) => score.id === b.playerInfo.id)!.score;
      return aCurrentScore - bCurrentScore;
    }
  });
  return (
    <>
        <Stack
          direction="row"
          alignItems={"center"}
          sx={{
            margin: 1,
            maxWidth: "95%",
          }}
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
            variant={showStats ? "filled" : "outlined"}
            color="primary"
            onClick={() => setShowStats(!showStats)}
          />
          <Chip
            icon={<SwapVertIcon />}
            label={sortingMethod === "ranked" ? "Rank" : "Points"}
            onClick={handleSortChipClick}
            variant="filled"
            color="primary"
            sx={{ ml: 1 }}
          />
        </Stack>

      <Stack direction="column" spacing={3} width={"85%"}>
        {sortedPlayers.map((player) => (
          <PlayerScoreCard
            player={player.playerInfo}
            score={
              currentScores.find((score) => score.id === player.playerInfo.id)!
                .score || 0
            }
            statistics={player.stats}
            key={player.playerInfo.id}
            streak={getCurrentYasatStreak(player.playerInfo.id)}
            longestStreak={
              getLongestYasatStreak() ===
              player.stats.stats.find((stat) => stat.name === "Longest Streak")
                ?.count
            }
            showStats={showStats}
          />
        ))}
        <Offset />
      </Stack>
    </>
  );
}
