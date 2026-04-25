import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
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
  PlayerStats,
} from "../identity/playerService";
import { selectStatsWeight } from "../stats/statsSlice";
import { useAppSelector } from "../../app/hooks";

type MetricKey = string;

interface Metric {
  key: MetricKey;
  label: string;
  /** Extract the value to sort/display for a player. */
  get: (s: PlayerStats) => number;
}

const PRIMARY_METRICS: Metric[] = [
  {
    key: "wins",
    label: "Games won",
    get: (s) => s.totalWins,
  },
  {
    key: "yasats",
    label: "Yasats",
    get: (s) => s.statCounts["Yasat"] ?? 0,
  },
  {
    key: "owns",
    label: "Owns",
    get: (s) => s.statCounts["Own"] ?? 0,
  },
  {
    key: "owned",
    label: "Owned",
    get: (s) => s.statCounts["Owned"] ?? 0,
  },
  {
    key: "kills",
    label: "Kills",
    get: (s) => s.statCounts["Kill"] ?? 0,
  },
  {
    key: "deaths",
    label: "Deaths",
    get: (s) => s.statCounts["Death"] ?? 0,
  },
  {
    key: "longestStreak",
    label: "Longest streak",
    get: (s) => s.longestStreak,
  },
  {
    key: "gamesPlayed",
    label: "Games played",
    get: (s) => s.totalGamesPlayed,
  },
];

/** Stats that are already covered by a primary metric above. */
const COVERED_STAT_NAMES = new Set(["Yasat", "Own", "Owned", "Kill", "Death"]);

export const Leaderboard: React.FC = () => {
  const weights = useAppSelector(selectStatsWeight);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<MetricKey>("wins");
  const [mode, setMode] = useState<
    "ranked" | "play-bo10" | "play-firstTo10"
  >("ranked");

  const getStats = (entry: LeaderboardEntry): PlayerStats | null => {
    if (mode === "ranked") return entry.stats;
    if (mode === "play-bo10") return entry.playStats?.bo10 ?? null;
    return entry.playStats?.firstTo10 ?? null;
  };

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

  const metrics: Metric[] = useMemo(() => {
    const extra: Metric[] = weights
      .filter(
        (w) =>
          w.statName !== "Longest Streak" && !COVERED_STAT_NAMES.has(w.statName)
      )
      .map((w) => ({
        key: `stat:${w.statName}`,
        label: w.statName,
        get: (s: PlayerStats) => s.statCounts[w.statName] ?? 0,
      }));
    return [...PRIMARY_METRICS, ...extra];
  }, [weights]);

  const activeMetric =
    metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const ranked = useMemo(() => {
    if (!entries) return [];
    return entries
      .map((e) => {
        const s = getStats(e);
        return s ? { entry: e, value: activeMetric.get(s) } : null;
      })
      .filter((r): r is { entry: LeaderboardEntry; value: number } =>
        r !== null && r.value > 0,
      )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activeMetric, mode]);

  return (
    <Stack
      direction="column"
      spacing={2}
      sx={{ width: "100%", maxWidth: 360, px: 2 }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <EmojiEventsIcon color="primary" />
        <Typography variant="h6" sx={{ color: '#7df3e1' }}>Leaderboards</Typography>
      </Stack>

      <FormControl size="small" fullWidth>
        <InputLabel id="leaderboard-mode-label">Mode</InputLabel>
        <Select
          labelId="leaderboard-mode-label"
          label="Mode"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as typeof mode)
          }
        >
          <MenuItem value="ranked">Ranked</MenuItem>
          <MenuItem value="play-bo10">Play – Best of 10</MenuItem>
          <MenuItem value="play-firstTo10">Play – First to 10</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth>
        <InputLabel id="leaderboard-metric-label">Ranking</InputLabel>
        <Select
          labelId="leaderboard-metric-label"
          label="Ranking"
          value={activeMetric.key}
          onChange={(e) => setMetricKey(e.target.value as MetricKey)}
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
              {r.value}
            </Typography>
          </Stack>
        ))}
      </Box>

      {mode !== "ranked" && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Play stats are saved only when logged in. Classic games are not tracked.
        </Typography>
      )}
    </Stack>
  );
};

export default Leaderboard;
