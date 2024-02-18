import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { player } from "./playersSlice";
import {
  Chip,
  Stack,
  Badge,
  Divider,
  Avatar,
  Tooltip,
} from "@mui/material";
import { PlayerStats, Stat } from "./Ranking";
import { GiDeathSkull } from "react-icons/gi";
import { GiPistolGun } from "react-icons/gi";
import { GiFist } from "react-icons/gi";
import { FaSadCry } from "react-icons/fa";
import { FaFire } from "react-icons/fa";
import { useAppSelector } from "../../app/hooks";
import { selectStatsWeight } from "../stats/statsSlice";
import { RootState } from "../../app/store";

export type PlayerScoreCardProps = {
  player: player;
  statistics: PlayerStats;
  weightedScore: number;
  score: number;
  streakLength?: number;
  hasLongestStreak: boolean;
  showStats: boolean;
  roundStats: PlayerStats;
  roundWeigtedScore: number;
  roundScoreChange: number;
  showLastRoundInfo: boolean;
};

export const PlayerScoreCard = ({
  player,
  statistics,
  weightedScore,
  score,
  streakLength,
  hasLongestStreak,
  showStats,
  roundStats,
  roundWeigtedScore,
  roundScoreChange,
  showLastRoundInfo,
}: PlayerScoreCardProps) => {
  function stringAvatar(name: string) {
    return {
      children: `${name.slice(0, 2)}`,
    };
  }

  const renderStat = (stat: Stat) => {
    switch (stat.name) {
      case "Yasat":
        return (
          <Chip
            avatar={<Avatar src="../logo192.png" />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );
      case "Death":
        return (
          <Chip
            icon={<GiDeathSkull size={"17px"} />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );

      case "Kill":
        return (
          <Chip
            icon={<GiPistolGun size={"20px"} />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );
      case "Own":
        return (
          <Chip
            icon={<GiFist size={"18px"} />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );
      case "Owned":
        return (
          <Chip
            icon={<FaSadCry size={"16px"} />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );

      case "Longest Streak":
        const tooltiptext = hasLongestStreak
          ? `Longest Streak! This adds ${
              statsWeigts.find(
                (weightedStat) => weightedStat.statName === stat.name
              )?.weight
            } to your score.`
          : `${stat.count} is not the longest streak`;
        return (
          <Tooltip title={tooltiptext} arrow>
            <Chip
              icon={<FaFire size={"14px"} />}
              variant="filled"
              {...(hasLongestStreak && { color: "success" })}
              size="small"
              label={stat.count}
              sx={{ ml: 1 }}
            />
          </Tooltip>
        );

      default:
        return (
          <Chip
            variant="filled"
            size="small"
            label={stat.name}
            key={stat.name}
          />
        );
    }
  };

  const getPointsColor = (score: number) => {
    let badgecolor:
      | "default"
      | "primary"
      | "secondary"
      | "error"
      | "success"
      | "warning"
      | "info" = "primary";
    if (score === 15 || score === 65 || score === 69 || score === 0) {
      badgecolor = "success";
    } else if (score > 60) {
      badgecolor = "secondary";
    } else {
      badgecolor = "default";
    }
    return badgecolor;
  };

  const statsWeigts = useAppSelector(selectStatsWeight);

  const getStatBadgeColor = (statName: string) => {
    const foundStat = statsWeigts.find((stat) => stat.statName === statName);
    if (foundStat && foundStat.weight < 0) {
      return "secondary";
    } else if (foundStat && foundStat.weight > 0) {
      return "success";
    } else {
      return "primary";
    }
  };

  // const getRoundBreakdownPointsColor = () => {
  //   let badgecolor:
  //     | "default"
  //     | "primary"
  //     | "secondary"
  //     | "error"
  //     | "success"
  //     | "warning"
  //     | "info" = "primary";

  //   if (roundStats.stats.some((stat) => stat.name === "Death")) {
  //     badgecolor = "error";
  //   } else if (
  //     roundStats.stats.some(
  //       (stat) =>
  //         stat.name === "Nullify 50" ||
  //         stat.name === "Nullify 100" ||
  //         stat.name === "Lullify"
  //     )
  //   ) {
  //     badgecolor = "success";
  //   } else if (roundScoreChange > 0) {
  //     badgecolor = "error";
  //   } else if (roundScoreChange === 0) {
  //     badgecolor = "success";
  //   }

  //   return badgecolor;
  // };

  const scoreHistory = useAppSelector((state: RootState) => state.scores.past);
  const previousRound = scoreHistory[scoreHistory.length - 1];

  const getRoundBreakdownStreakinfo = () => {
    const previousStreak =
      previousRound?.playerscores.find((score) => score.id === player.id)
        ?.yasatStreak ?? 0; 
    const currentStreak = streakLength ?? 0; 

    // check if streak is ended this round
    if (previousStreak > 0 && currentStreak === 0) {
      return "Ended";
    }
    if (currentStreak > previousStreak) {
      return "+1";
    }
  };

  return (
    <Card elevation={2} sx={{ width: "100%" }}>
      <CardContent>
        <Stack
          justifyContent={"left"}
          alignItems={"end"}
          alignContent={"end"}
          spacing={2}
          direction="row"
          divider={
            <Divider orientation="vertical" variant="fullWidth" flexItem />
          }
        >
          <Avatar
            {...stringAvatar(player.name)}
            sx={{ bgcolor: player.color, alignSelf: "center" }}
            key={player.id}
            variant="rounded"
          />

          <Stack alignItems={"center"} spacing={1} direction="column">
            <Typography
              sx={{ fontSize: 12 }}
              color="text.secondary"
              gutterBottom
            >
              Points
            </Typography>
            <Chip
              label={score}
              variant="filled"
              color={getPointsColor(score)}
            />
          </Stack>

          <Stack alignItems={"center"} spacing={1} direction="column">
            <Typography
              sx={{ fontSize: 12 }}
              color="text.secondary"
              gutterBottom
            >
              Score
            </Typography>
            <Chip label={weightedScore} variant="filled" color="primary" />
          </Stack>
          {streakLength && (
            <Stack alignItems={"center"} spacing={1} direction="column">
              <Typography
                sx={{ fontSize: 12 }}
                color="text.secondary"
                gutterBottom
              >
                Streak
              </Typography>
              {streakLength === 1 ? (
                <Chip label={streakLength} variant="filled" />
              ) : (
                <Chip
                  icon={<FaFire size={"17px"} />}
                  label={streakLength}
                  variant="filled"
                />
              )}
            </Stack>
          )}
        </Stack>
        {showLastRoundInfo && showStats && (
          <>
            <Divider variant="fullWidth" sx={{ mt: 2, mb: 1 }}>
              <Typography sx={{ fontSize: 10 }} color="text.secondary">
                Round breakdown
              </Typography>
            </Divider>

            <Chip
              label={
                roundScoreChange > 0 ? `+${roundScoreChange}` : roundScoreChange
              }
              variant="filled"
              size="small"
            />

            <Chip
              label={
                roundWeigtedScore > 0
                  ? `+${roundWeigtedScore}`
                  : roundWeigtedScore
              }
              variant="filled"
              size="small"
              color="primary"
              sx={{ ml: 1 }}
            />

            {getRoundBreakdownStreakinfo() !== undefined && (
              <Chip
                icon={<FaFire size={"14px"} />}
                variant="filled"
                size="small"
                label={getRoundBreakdownStreakinfo()}
                sx={{ ml: 1 }}
              />
            )}

            {roundStats.stats.map((stat) => (
              <React.Fragment key={stat.name}>
                {stat.name !== "Longest Streak" ? (
                  <Tooltip
                    title={`Score: ${stat.count} * ${stat.name} (${
                      statsWeigts.find(
                        (weightedStat) => weightedStat.statName === stat.name
                      )?.weight
                    })`}
                    arrow
                  >
                    <Badge
                      badgeContent={stat.count}
                      color={getStatBadgeColor(stat.name)}
                      sx={{ margin: 1 }}
                    >
                      {renderStat(stat)}
                    </Badge>
                  </Tooltip>
                ) : (
                  renderStat(stat)
                )}
              </React.Fragment>
            ))}
          </>
        )}

        {!showLastRoundInfo && showStats && statistics.stats.length > 0 && (
          <>
            <Divider variant="fullWidth" sx={{ mt: 2, mb: 1 }}>
              <Typography sx={{ fontSize: 10 }} color="text.secondary">
                Game stats
              </Typography>
            </Divider>
            {statistics.stats.map((stat) => (
              <React.Fragment key={stat.name}>
                {stat.name !== "Longest Streak" ? (
                  <Tooltip
                    title={`Score: ${stat.count} * ${stat.name} (${
                      statsWeigts.find(
                        (weightedStat) => weightedStat.statName === stat.name
                      )?.weight
                    })`}
                    arrow
                  >
                    <Badge
                      badgeContent={stat.count}
                      color={getStatBadgeColor(stat.name)}
                      sx={{ margin: 1 }}
                    >
                      {renderStat(stat)}
                    </Badge>
                  </Tooltip>
                ) : (
                  renderStat(stat)
                )}
              </React.Fragment>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};
