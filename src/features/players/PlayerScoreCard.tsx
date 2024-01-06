import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { player } from "./playersSlice";
import { Chip, Stack, Badge, Divider, Avatar } from "@mui/material";
import { PlayerStats, Stat } from "./Ranking";
import { GiDeathSkull } from "react-icons/gi";
import { GiPistolGun } from "react-icons/gi";
import { GiFist } from "react-icons/gi";
import { FaSadCry } from "react-icons/fa";
import { FaFire } from "react-icons/fa";
import { useAppSelector } from "../../app/hooks";
import { selectStatsWeight } from "../stats/statsSlice";

export type PlayerScoreCardProps = {
  player: player;
  statistics: PlayerStats;
  score: number;
  streak?: number;
};

export const PlayerScoreCard = ({
  player,
  statistics,
  score,
  streak,
}: PlayerScoreCardProps) => {


  function stringToColor(string: string) {
    let hash = 0;
    let i;

    /* eslint-disable no-bitwise */
    for (i = 0; i < string.length; i += 1) {
      hash = string.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = "#";

    for (i = 0; i < 3; i += 1) {
      const value = (hash >> (i * 8)) & 0xff;
      color += `00${value.toString(16)}`.slice(-2);
    }
    /* eslint-enable no-bitwise */

    return color;
  }

  function stringAvatar(name: string) {
    return {
      sx: {
        bgcolor: stringToColor(name),
      },
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
      case "Highest Streak":
        return (
          <Chip
            avatar={<Avatar src="../logo192.png" />}
            variant="filled"
            label={"streak"}
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
            icon={<FaSadCry size={"17px"} />}
            variant="filled"
            size="small"
            key={stat.name}
          />
        );
      case "Multi-Owned":
        return (
          <Chip
            variant="filled"
            size="small"
            label={stat.name}
            key={stat.name}
          />
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
  } else if (score > 55) {
    badgecolor = "error";
  } else {
    badgecolor = "default";
  }
  const statsWeigts = useAppSelector(selectStatsWeight);

  const getStatBadgeColor = (statName: string) => {
    const foundStat = statsWeigts.find((stat) => stat.statName === statName);
    if (foundStat && foundStat.weight < 0) {
      return "error";
    } else if (foundStat && foundStat.weight > 0) {
      return "success";
    } else {
      return "primary";
    }
  }

  return (
    <Card elevation={2} sx={{width:"100%"}}>
      <CardContent>
        <Stack
          justifyContent={"left"}
          alignItems={"end"}
          alignContent={"end"}
          spacing={2}
          direction="row"
          divider={<Divider orientation="vertical" flexItem />}
        >
          <Avatar
            {...stringAvatar(player.name)}
            key={player.id}
            variant="circular"
          />

          <Stack alignItems={"center"} spacing={1} direction="column">
            <Typography
              sx={{ fontSize: 11 }}
              color="text.secondary"
              gutterBottom
            >
              Score
            </Typography>
            <Chip label={score} variant="filled" color={badgecolor} />
          </Stack>
          {(streak ?? 0 > 1) && (
            <Stack alignItems={"center"} spacing={1} direction="column">
              <Typography
                sx={{ fontSize: 11 }}
                color="text.secondary"
                gutterBottom
              >
                Streak
              </Typography>
              <Chip
                icon={<FaFire size={"17px"} />}
                label={streak}
                variant="filled"
                color="warning"
              />
            </Stack>
          )}

          <Stack alignItems={"center"} spacing={1} direction="column">
            <Typography
              sx={{ fontSize: 11 }}
              color="text.secondary"
              gutterBottom
            >
              Rank
            </Typography>
            <Chip
              label={statistics.weightedScore}
              variant="filled"
              color="primary"
            />
          </Stack>
        </Stack>
        {statistics.stats.length > 0 && (
          <>
            <Divider variant="middle" sx={{ mt: 2, mb: 2 }} />

            {statistics.stats.map((stat) => (
              <Badge
                badgeContent={stat.count}
                color={getStatBadgeColor(stat.name)}
                sx={{ margin: 1 }}
                key={stat.name}
              >
                {renderStat(stat)}
              </Badge>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};
