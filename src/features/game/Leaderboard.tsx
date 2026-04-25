import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import {
  fetchLeaderboard,
  LeaderboardEntry,
} from "../identity/playerService";
import { selectStatsWeight } from "../stats/statsSlice";
import { useAppSelector } from "../../app/hooks";

type Mode = "ranked" | "play" | "friends";
type PlayTab = "games" | "stats";
type DifficultyFilter = "all" | "easy" | "normal" | "godlike";

type MetricFormat = "int" | "percent";

interface Metric {
  key: string;
  label: string;
  /** Returns the value, or null when the player should be excluded (e.g. min samples). */
  get: (e: LeaderboardEntry) => number | null;
  format?: MetricFormat;
}

const WINRATE_MIN_GAMES = 5;

/** Stats already covered by an explicit primary metric — skipped from dynamic stat list. */
const COVERED_STAT_NAMES = new Set(["Yasat", "Own", "Owned", "Kill", "Death"]);

const winRate = (wins: number, games: number): number | null =>
  games >= WINRATE_MIN_GAMES ? (wins / games) * 100 : null;

/** Sum of wins / games across the two tracked Play lengths (bo10 + firstTo10). */
const playTotalWins = (e: LeaderboardEntry): number =>
  (e.playStats?.bo10?.totalWins ?? 0) +
  (e.playStats?.firstTo10?.totalWins ?? 0);

const playTotalGames = (e: LeaderboardEntry): number =>
  (e.playStats?.bo10?.totalGamesPlayed ?? 0) +
  (e.playStats?.firstTo10?.totalGamesPlayed ?? 0);

/** Per-difficulty wins/games (or totals when filter='all'). */
const playDiffWins = (
  e: LeaderboardEntry,
  filter: DifficultyFilter,
): number => {
  if (filter === "all") return playTotalWins(e);
  return e.playByDifficulty?.[filter]?.totalWins ?? 0;
};
const playDiffGames = (
  e: LeaderboardEntry,
  filter: DifficultyFilter,
): number => {
  if (filter === "all") return playTotalGames(e);
  return e.playByDifficulty?.[filter]?.totalGamesPlayed ?? 0;
};

/** Sum of a stat across all tracked Play lengths. */
const aggregatePlayStat = (e: LeaderboardEntry, statName: string): number =>
  (e.playStats?.bo10?.statCounts[statName] ?? 0) +
  (e.playStats?.firstTo10?.statCounts[statName] ?? 0);

/** Sum of wins / games across the two tracked Friends lengths (bo10 + firstTo10). */
const friendsTotalWins = (e: LeaderboardEntry): number =>
  (e.friendsPlayStats?.bo10?.totalWins ?? 0) +
  (e.friendsPlayStats?.firstTo10?.totalWins ?? 0);
const friendsTotalGames = (e: LeaderboardEntry): number =>
  (e.friendsPlayStats?.bo10?.totalGamesPlayed ?? 0) +
  (e.friendsPlayStats?.firstTo10?.totalGamesPlayed ?? 0);
const aggregateFriendsStat = (e: LeaderboardEntry, statName: string): number =>
  (e.friendsPlayStats?.bo10?.statCounts[statName] ?? 0) +
  (e.friendsPlayStats?.firstTo10?.statCounts[statName] ?? 0);

const buildRankedMetrics = (weights: { statName: string }[]): Metric[] => {
  const base: Metric[] = [
    {
      key: "ranked-wins",
      label: "Total wins",
      get: (e) => e.stats.totalWins,
    },
    {
      key: "ranked-winrate",
      label: `Win rate (min ${WINRATE_MIN_GAMES})`,
      get: (e) => winRate(e.stats.totalWins, e.stats.totalGamesPlayed),
      format: "percent",
    },
    {
      key: "ranked-wins-bo10",
      label: "Wins — Best of 10",
      get: (e) => e.rankedByLength?.bo10?.totalWins ?? 0,
    },
    {
      key: "ranked-wins-firstTo10",
      label: "Wins — First to 10",
      get: (e) => e.rankedByLength?.firstTo10?.totalWins ?? 0,
    },
    {
      key: "ranked-wins-classic",
      label: "Wins — Classic",
      get: (e) => e.rankedByLength?.classic?.totalWins ?? 0,
    },
    {
      key: "ranked-games",
      label: "Games played",
      get: (e) => e.stats.totalGamesPlayed,
    },
    {
      key: "ranked-streak",
      label: "Longest streak",
      get: (e) => e.stats.longestStreak,
    },
    {
      key: "ranked-yasats",
      label: "Yasats",
      get: (e) => e.stats.statCounts["Yasat"] ?? 0,
    },
    {
      key: "ranked-owns",
      label: "Owns",
      get: (e) => e.stats.statCounts["Own"] ?? 0,
    },
    {
      key: "ranked-owned",
      label: "Owned",
      get: (e) => e.stats.statCounts["Owned"] ?? 0,
    },
    {
      key: "ranked-kills",
      label: "Kills",
      get: (e) => e.stats.statCounts["Kill"] ?? 0,
    },
    {
      key: "ranked-deaths",
      label: "Deaths",
      get: (e) => e.stats.statCounts["Death"] ?? 0,
    },
  ];
  const dynamic: Metric[] = weights
    .filter(
      (w) =>
        w.statName !== "Longest Streak" && !COVERED_STAT_NAMES.has(w.statName),
    )
    .map((w) => ({
      key: `ranked-stat:${w.statName}`,
      label: w.statName,
      get: (e: LeaderboardEntry) => e.stats.statCounts[w.statName] ?? 0,
    }));
  return [...base, ...dynamic];
};

/** Play vs. AI — Games tab: win-related metrics, length-aware. Difficulty
 *  filter applies to total wins / win rate / games played; per-length cards
 *  are unaffected because difficulty data is aggregated across lengths.
 */
const buildPlayGamesMetrics = (diff: DifficultyFilter): Metric[] => {
  const diffSuffix = diff === "all" ? "" : ` (${diff})`;
  return [
    {
      key: `play-games-wins-${diff}`,
      label: `Total wins${diffSuffix}`,
      get: (e) => playDiffWins(e, diff),
    },
    {
      key: `play-games-winrate-${diff}`,
      label: `Win rate${diffSuffix} (min ${WINRATE_MIN_GAMES})`,
      get: (e) => winRate(playDiffWins(e, diff), playDiffGames(e, diff)),
      format: "percent",
    },
    {
      key: `play-games-played-${diff}`,
      label: `Games played${diffSuffix}`,
      get: (e) => playDiffGames(e, diff),
    },
    {
      key: "play-games-wins-bo10",
      label: "Wins — Best of 10",
      get: (e) => e.playStats?.bo10?.totalWins ?? 0,
    },
    {
      key: "play-games-wins-firstTo10",
      label: "Wins — First to 10",
      get: (e) => e.playStats?.firstTo10?.totalWins ?? 0,
    },
    {
      key: "play-games-played-bo10",
      label: "Games played — Best of 10",
      get: (e) => e.playStats?.bo10?.totalGamesPlayed ?? 0,
    },
    {
      key: "play-games-played-firstTo10",
      label: "Games played — First to 10",
      get: (e) => e.playStats?.firstTo10?.totalGamesPlayed ?? 0,
    },
  ];
};

/** Play vs. AI — Overall stats tab: per-stat counts aggregated across lengths. */
const buildPlayStatsMetrics = (weights: { statName: string }[]): Metric[] => {
  const base: Metric[] = [
    {
      key: "play-stats-streak",
      label: "Longest streak",
      get: (e) =>
        Math.max(
          e.playStats?.bo10?.longestStreak ?? 0,
          e.playStats?.firstTo10?.longestStreak ?? 0,
        ),
    },
    {
      key: "play-stats-yasats",
      label: "Yasats",
      get: (e) => aggregatePlayStat(e, "Yasat"),
    },
    {
      key: "play-stats-owns",
      label: "Owns",
      get: (e) => aggregatePlayStat(e, "Own"),
    },
    {
      key: "play-stats-owned",
      label: "Owned",
      get: (e) => aggregatePlayStat(e, "Owned"),
    },
    {
      key: "play-stats-kills",
      label: "Kills",
      get: (e) => aggregatePlayStat(e, "Kill"),
    },
    {
      key: "play-stats-deaths",
      label: "Deaths",
      get: (e) => aggregatePlayStat(e, "Death"),
    },
  ];
  const dynamic: Metric[] = weights
    .filter(
      (w) =>
        w.statName !== "Longest Streak" && !COVERED_STAT_NAMES.has(w.statName),
    )
    .map((w) => ({
      key: `play-stats-stat:${w.statName}`,
      label: w.statName,
      get: (e: LeaderboardEntry) => aggregatePlayStat(e, w.statName),
    }));
  return [...base, ...dynamic];
};

/** Friends — Games tab. */
const buildFriendsGamesMetrics = (): Metric[] => [
  {
    key: "friends-games-wins",
    label: "Total wins",
    get: (e) => friendsTotalWins(e),
  },
  {
    key: "friends-games-winrate",
    label: `Win rate (min ${WINRATE_MIN_GAMES})`,
    get: (e) => winRate(friendsTotalWins(e), friendsTotalGames(e)),
    format: "percent",
  },
  {
    key: "friends-games-played",
    label: "Games played",
    get: (e) => friendsTotalGames(e),
  },
  {
    key: "friends-games-wins-bo10",
    label: "Wins — Best of 10",
    get: (e) => e.friendsPlayStats?.bo10?.totalWins ?? 0,
  },
  {
    key: "friends-games-wins-firstTo10",
    label: "Wins — First to 10",
    get: (e) => e.friendsPlayStats?.firstTo10?.totalWins ?? 0,
  },
  {
    key: "friends-games-played-bo10",
    label: "Games played — Best of 10",
    get: (e) => e.friendsPlayStats?.bo10?.totalGamesPlayed ?? 0,
  },
  {
    key: "friends-games-played-firstTo10",
    label: "Games played — First to 10",
    get: (e) => e.friendsPlayStats?.firstTo10?.totalGamesPlayed ?? 0,
  },
];

/** Friends — Overall stats tab. */
const buildFriendsStatsMetrics = (
  weights: { statName: string }[],
): Metric[] => {
  const base: Metric[] = [
    {
      key: "friends-stats-streak",
      label: "Longest streak",
      get: (e) =>
        Math.max(
          e.friendsPlayStats?.bo10?.longestStreak ?? 0,
          e.friendsPlayStats?.firstTo10?.longestStreak ?? 0,
        ),
    },
    {
      key: "friends-stats-yasats",
      label: "Yasats",
      get: (e) => aggregateFriendsStat(e, "Yasat"),
    },
    {
      key: "friends-stats-owns",
      label: "Owns",
      get: (e) => aggregateFriendsStat(e, "Own"),
    },
    {
      key: "friends-stats-owned",
      label: "Owned",
      get: (e) => aggregateFriendsStat(e, "Owned"),
    },
    {
      key: "friends-stats-kills",
      label: "Kills",
      get: (e) => aggregateFriendsStat(e, "Kill"),
    },
    {
      key: "friends-stats-deaths",
      label: "Deaths",
      get: (e) => aggregateFriendsStat(e, "Death"),
    },
  ];
  const dynamic: Metric[] = weights
    .filter(
      (w) =>
        w.statName !== "Longest Streak" && !COVERED_STAT_NAMES.has(w.statName),
    )
    .map((w) => ({
      key: `friends-stats-stat:${w.statName}`,
      label: w.statName,
      get: (e: LeaderboardEntry) => aggregateFriendsStat(e, w.statName),
    }));
  return [...base, ...dynamic];
};

const formatValue = (value: number, format: MetricFormat = "int"): string => {
  if (format === "percent") return `${value.toFixed(1)}%`;
  return String(value);
};

export const Leaderboard: React.FC = () => {
  const weights = useAppSelector(selectStatsWeight);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("ranked");
  const [playTab, setPlayTab] = useState<PlayTab>("games");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [metricKey, setMetricKey] = useState<string>("ranked-wins");

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load leaderboard.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo<Metric[]>(() => {
    if (mode === "ranked") return buildRankedMetrics(weights);
    if (mode === "friends") {
      return playTab === "games"
        ? buildFriendsGamesMetrics()
        : buildFriendsStatsMetrics(weights);
    }
    return playTab === "games"
      ? buildPlayGamesMetrics(difficulty)
      : buildPlayStatsMetrics(weights);
  }, [mode, playTab, difficulty, weights]);

  // Keep metric selection valid when mode/tab changes.
  useEffect(() => {
    if (!metrics.find((m) => m.key === metricKey)) {
      setMetricKey(metrics[0]?.key ?? "");
    }
  }, [metrics, metricKey]);

  const activeMetric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const ranked = useMemo(() => {
    if (!entries || !activeMetric) return [];
    return entries
      .map((e) => {
        const value = activeMetric.get(e);
        return value !== null ? { entry: e, value } : null;
      })
      .filter(
        (r): r is { entry: LeaderboardEntry; value: number } =>
          r !== null && r.value > 0,
      )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [entries, activeMetric]);

  return (
    <Stack
      direction="column"
      spacing={2}
      sx={{ width: "100%", maxWidth: 360, px: 2 }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <EmojiEventsIcon color="primary" />
        <Typography variant="h6" sx={{ color: "#7df3e1" }}>
          Leaderboards
        </Typography>
      </Stack>

      <ButtonGroup fullWidth size="small" aria-label="Leaderboard mode">
        <Button
          variant={mode === "ranked" ? "contained" : "outlined"}
          onClick={() => setMode("ranked")}
        >
          Ranked
        </Button>
        <Button
          variant={mode === "play" ? "contained" : "outlined"}
          onClick={() => setMode("play")}
        >
          Play vs. AI
        </Button>
        <Button
          variant={mode === "friends" ? "contained" : "outlined"}
          onClick={() => setMode("friends")}
        >
          Friends
        </Button>
      </ButtonGroup>

      {(mode === "play" || mode === "friends") && (
        <ButtonGroup fullWidth size="small" aria-label="Stats tab">
          <Button
            variant={playTab === "games" ? "contained" : "outlined"}
            onClick={() => setPlayTab("games")}
          >
            Games
          </Button>
          <Button
            variant={playTab === "stats" ? "contained" : "outlined"}
            onClick={() => setPlayTab("stats")}
          >
            Overall stats
          </Button>
        </ButtonGroup>
      )}

      {mode === "play" && playTab === "games" && (
        <ButtonGroup
          fullWidth
          size="small"
          aria-label="Bot difficulty filter"
        >
          {(
            ["all", "easy", "normal", "godlike"] as DifficultyFilter[]
          ).map((d) => (
            <Button
              key={d}
              variant={difficulty === d ? "contained" : "outlined"}
              onClick={() => setDifficulty(d)}
            >
              {d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)}
            </Button>
          ))}
        </ButtonGroup>
      )}

      <FormControl size="small" fullWidth>
        <InputLabel id="leaderboard-metric-label">Ranking</InputLabel>
        <Select
          labelId="leaderboard-metric-label"
          label="Ranking"
          value={activeMetric?.key ?? ""}
          onChange={(e) => setMetricKey(e.target.value as string)}
        >
          {metrics.map((m) => (
            <MenuItem key={m.key} value={m.key}>
              {m.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box
        sx={{
          maxHeight: 260,
          overflowY: "auto",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 1,
        }}
      >
        {entries === null && !loadError && (
          <Stack alignItems="center" py={2}>
            <CircularProgress size={20} />
          </Stack>
        )}
        {loadError && (
          <Typography variant="body2" color="error" align="center">
            {loadError}
          </Typography>
        )}
        {entries !== null && ranked.length === 0 && !loadError && (
          <Typography variant="body2" color="text.secondary" align="center">
            {mode === "ranked"
              ? "No data yet. Play some ranked games!"
              : mode === "friends"
              ? "No data yet. Finish a Play vs. Friends game to appear here."
              : "No data yet. Log in and finish a Play game to appear here."}
          </Typography>
        )}
        {ranked.map((r, idx) => (
          <Stack
            key={r.entry.username}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ py: 0.5 }}
          >
            <Typography
              variant="body2"
              sx={{ width: 24, textAlign: "right", color: "text.secondary" }}
            >
              {idx + 1}.
            </Typography>
            <Avatar
              sx={{
                bgcolor: r.entry.color || "#7df3e1",
                width: 30,
                height: 30,
                fontSize: 14,
              }}
            >
              {r.entry.displayName.slice(0, 2).toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
              {r.entry.displayName}
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {formatValue(r.value, activeMetric?.format)}
            </Typography>
          </Stack>
        ))}
      </Box>

      {mode === "play" && playTab === "stats" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Overall stats are aggregated across all Play vs. AI game lengths
          (Best of 10 and First to 10). Classic Play games are not tracked.
        </Typography>
      )}
      {mode === "play" && playTab === "games" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Play stats are saved only when logged in. Classic games are not tracked.
        </Typography>
      )}
      {mode === "friends" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Friends stats are saved by the host once the game ends, for every
          logged-in participant.
        </Typography>
      )}
    </Stack>
  );
};

export default Leaderboard;
