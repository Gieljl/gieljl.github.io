/**
 * PlayPlayerRanking — renders the exact same "new" (weighted-stats) view used
 * by Ranked/Unranked games, but backed by `playSlice` data instead of
 * `scoreSlice`/`playersSlice`. The visual output is identical.
 *
 * Adapter strategy:
 *  - synthesize a numeric playersSlice-compatible `player[]` from
 *    `playSlice.seating` + `playerNames` (id = seating index + 1)
 *  - convert `playSlice.roundHistory[].perPlayer[]` into
 *    `scoreSlice.ScoreState[]` (past rounds) + a current ScoreState using
 *    `cumulativeTotals`
 *  - derive stats from events via `EVENT_TO_STAT_NAME`
 *  - reuse the existing `PlayerScoreCard` for rendering (weights read from the
 *    shared `statsSlice`, so weight changes there also apply here)
 */
import React, { useState } from 'react';
import {
  Button,
  Chip,
  Stack,
  Tooltip,
  styled,
  useTheme,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import StyleIcon from '@mui/icons-material/Style';
import { SnackbarKey, closeSnackbar, enqueueSnackbar } from 'notistack';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { setGameView } from '../game/gameSlice';
import { PlayerScoreCard } from '../players/PlayerScoreCard';
import type { PlayerStats } from '../players/Ranking';
import type { player } from '../players/playersSlice';
import type { ScoreState, playerScore } from '../game/scoreSlice';
import { selectStatsWeight } from '../stats/statsSlice';
import {
  selectPlayNames,
  selectPlayTotals,
} from './playSlice';
import type { PlayerId } from './engine/round';
import type { RootState } from '../../app/store';
import { EVENT_TO_STAT_NAME } from './eventLabels';
import logo from '../../yasa7.png';
import logolight from '../../yasa7_light.png';

/** Shared color palette for bot avatars (stable by index). */
const BOT_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac'];

export function PlayPlayerRanking() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const Offset = styled('div')(({ theme }) => theme.mixins.toolbar);

  const statsWeigts = useAppSelector(selectStatsWeight);
  const names = useAppSelector(selectPlayNames);
  const totals = useAppSelector(selectPlayTotals);
  const seating = useAppSelector((s: RootState) => s.play.seating);
  const humanId = useAppSelector((s: RootState) => s.play.humanId);
  const history = useAppSelector((s: RootState) => s.play.roundHistory);
  const round = useAppSelector((s: RootState) => s.play.round);

  const [showStats, setShowStats] = useState(false);
  const [showLastRoundInfo, setShowLastRoundInfo] = useState(false);

  // -- Adapter: synthesize playersSlice-compatible list --------------------
  // Numeric ids derived from seating index (stable for this game).
  const players: player[] = React.useMemo(
    () =>
      seating.map((id, i) => ({
        id: i + 1,
        name: names[id] ?? `Player ${i + 1}`,
        color: id === humanId ? theme.palette.primary.main : BOT_COLORS[i % BOT_COLORS.length],
      })),
    [seating, names, humanId, theme.palette.primary.main],
  );

  // -- Adapter: convert roundHistory to ScoreState[] -----------------------
  // yasatStreak: running per-player streak of consecutive rounds with a
  // 'yasat' event. Reset on any other round.
  const pastScoreStates: ScoreState[] = React.useMemo(() => {
    const streakByPid: Record<PlayerId, number> = {};
    for (const id of seating) streakByPid[id] = 0;

    // Running cumulative total per player across rounds.
    const runningTotal: Record<PlayerId, number> = {};
    for (const id of seating) runningTotal[id] = 0;

    return history.map((r) => {
      const perById: Record<PlayerId, (typeof r.perPlayer)[number]> = {};
      for (const p of r.perPlayer) perById[p.playerId] = p;

      const playerscores: playerScore[] = seating.map((pid, i) => {
        const per = perById[pid];
        const events = per?.events ?? [];
        const hasYasat = events.includes('yasat');
        streakByPid[pid] = hasYasat ? (streakByPid[pid] ?? 0) + 1 : 0;
        runningTotal[pid] = per?.newTotal ?? runningTotal[pid];

        const statsList = events
          .map((e) => EVENT_TO_STAT_NAME[e])
          .filter((n): n is string => !!n)
          .map((name) => ({ name }));

        return {
          id: i + 1,
          score: runningTotal[pid],
          stats: statsList,
          yasatStreak: streakByPid[pid],
        };
      });

      return { playerscores };
    });
  }, [history, seating]);

  // "current" round: no new events; scores mirror cumulative totals.
  const currentScores: playerScore[] = React.useMemo(() => {
    const lastPast = pastScoreStates[pastScoreStates.length - 1];
    const prevStreaks: Record<PlayerId, number> = {};
    if (lastPast) {
      seating.forEach((pid, i) => {
        const ps = lastPast.playerscores.find((x) => x.id === i + 1);
        prevStreaks[pid] = ps?.yasatStreak ?? 0;
      });
    }
    return seating.map((pid, i) => ({
      id: i + 1,
      score: totals[pid] ?? 0,
      stats: [],
      yasatStreak: prevStreaks[pid] ?? 0,
    }));
  }, [pastScoreStates, seating, totals]);

  const newScoreState: ScoreState = { playerscores: [...currentScores] };
  const totalScores: ScoreState[] = [...pastScoreStates, newScoreState];

  // -- Reimplementation of Ranking's pure helpers --------------------------
  const getGameStatCount = (playerId: number, statName: string, scores: ScoreState[]) =>
    scores.reduce((total, r) => {
      const pr = r.playerscores.find((p) => p.id === playerId);
      return total + (pr ? pr.stats.filter((s) => s.name === statName).length : 0);
    }, 0);

  const getRoundStatCount = (playerId: number, statName: string, s: ScoreState) => {
    const pr = s.playerscores.find((p) => p.id === playerId);
    return pr ? pr.stats.filter((x) => x.name === statName).length : 0;
  };

  const calculateRoundScoreChange = (playerId: number) => {
    const prev = pastScoreStates[pastScoreStates.length - 1];
    if (!prev) return 0;
    const prevP = prev.playerscores.find((p) => p.id === playerId);
    const currP = newScoreState.playerscores.find((p) => p.id === playerId);
    return (currP?.score ?? 0) - (prevP?.score ?? 0);
  };

  const getLongestYasatStreakOfPlayer = (pid: number, state: ScoreState[]) =>
    state.reduce((max, r) => {
      const pr = r.playerscores.find((p) => p.id === pid);
      return pr ? Math.max(max, pr.yasatStreak) : max;
    }, 0);

  const getLongestStreakOwner = (state: ScoreState[]): number | null => {
    let best = 1;
    let owner: number | null = null;
    for (const r of state) {
      for (const ps of r.playerscores) {
        if (ps.yasatStreak > best) {
          best = ps.yasatStreak;
          owner = ps.id;
        }
      }
    }
    return owner;
  };

  const getCurrentYasatStreak = (pid: number) =>
    currentScores.find((p) => p.id === pid)?.yasatStreak ?? 0;

  const getWeightedScore = (
    pid: number,
    playerStats: PlayerStats,
    state: ScoreState[],
  ) => {
    let weighted = 0;
    for (const stat of playerStats.stats) {
      const w = statsWeigts.find((x) => x.statName === stat.name);
      if (!w) continue;
      if (stat.name === 'Longest Streak') {
        if (getLongestStreakOwner(state) === pid && stat.count > 1) {
          weighted += w.weight;
        }
      } else {
        weighted += stat.count * w.weight;
      }
    }
    return weighted;
  };

  const getPlayersGameStats = (pid: number, state: ScoreState[]): PlayerStats => {
    const out: PlayerStats = { stats: [] };
    const longest = getLongestYasatStreakOfPlayer(pid, state);
    if (longest > 1) out.stats.push({ name: 'Longest Streak', count: longest });
    for (const sw of statsWeigts) {
      if (sw.statName === 'Longest Streak') continue;
      const count = getGameStatCount(pid, sw.statName, state);
      if (count > 0) out.stats.push({ name: sw.statName, count });
    }
    return out;
  };

  const getPlayersRoundStats = (pid: number): PlayerStats => {
    // "Round" in the reusable card means last completed round — use the most
    // recent entry from history (events carry through there).
    const last = pastScoreStates[pastScoreStates.length - 1];
    const out: PlayerStats = { stats: [] };
    if (!last) return out;
    for (const sw of statsWeigts) {
      const count = getRoundStatCount(pid, sw.statName, last);
      if (count > 0) out.stats.push({ name: sw.statName, count });
    }
    return out;
  };

  const getPlayerWeightedScoreChange = (pid: number, currentWeighted: number) => {
    const previousWeighted = getWeightedScore(
      pid,
      getPlayersGameStats(pid, pastScoreStates.slice(0, -1)),
      pastScoreStates.slice(0, -1),
    );
    return currentWeighted - previousWeighted;
  };

  const getPreviousStreak = (pid: number): number => {
    const prev = pastScoreStates[pastScoreStates.length - 2];
    if (!prev) return 0;
    return prev.playerscores.find((p) => p.id === pid)?.yasatStreak ?? 0;
  };

  // -- Build ranking list ---------------------------------------------------
  const ranked = players.map((p) => {
    const gameStats = getPlayersGameStats(p.id, totalScores);
    const weighted = getWeightedScore(p.id, gameStats, totalScores);
    const roundStats = getPlayersRoundStats(p.id);
    const roundWeighted = getPlayerWeightedScoreChange(p.id, weighted);
    return { player: p, gameStats, weighted, roundStats, roundWeighted };
  });

  ranked.sort((a, b) => {
    if (a.weighted === b.weighted) {
      const aScore = currentScores.find((s) => s.id === a.player.id)?.score ?? 0;
      const bScore = currentScores.find((s) => s.id === b.player.id)?.score ?? 0;
      return aScore - bScore;
    }
    return b.weighted - a.weighted;
  });

  const onStatChipClick = () => {
    setShowStats((v) => !v);
    if (!showStats) {
      const action = (snackbarId: SnackbarKey | undefined) => (
        <Button color="inherit" onClick={() => closeSnackbar(snackbarId)}>
          close
        </Button>
      );
      enqueueSnackbar('Tap statistics to show weight and score.', {
        variant: 'info',
        action,
      });
    }
  };

  const longestOwnerId = getLongestStreakOwner(totalScores);

  return (
    <>
      <Stack
        direction="row"
        sx={{
          minWidth: '100%',
          zIndex: 2,
          maxWidth: '100%',
          position: 'fixed',
          overflowX: 'visible',
          overflowY: 'hidden',
          bgcolor: theme.palette.background.paper,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Stack direction="row" mt={1} alignItems="center">
          <img
            src={theme.palette.mode === 'light' ? logolight : logo}
            className="App-logo-small"
            alt="logo"
          />

          <Tooltip title="Back to table">
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<StyleIcon />}
              onClick={() => dispatch(setGameView('play'))}
              aria-label="Back to table"
              sx={{ ml: 1 }}
            >
              Table
            </Button>
          </Tooltip>

          <Chip
            label="Stats"
            icon={showStats ? <CheckIcon /> : <></>}
            variant={showStats ? 'filled' : 'outlined'}
            color="primary"
            onClick={onStatChipClick}
            disabled={pastScoreStates.length < 1}
            sx={{ ml: 1 }}
          />

          {showStats && (
            <Chip
              label={showLastRoundInfo ? 'Round' : 'Game'}
              variant="filled"
              color="primary"
              sx={{ ml: 1, mr: 1 }}
              deleteIcon={<ArrowDropDownIcon />}
              onDelete={() => setShowLastRoundInfo(!showLastRoundInfo)}
              onClick={() => setShowLastRoundInfo(!showLastRoundInfo)}
              disabled={pastScoreStates.length < 1}
            />
          )}
        </Stack>
      </Stack>

      <Stack direction="column" spacing={3} mt="70px" width="85%">
        {ranked.map(({ player: p, gameStats, weighted, roundStats, roundWeighted }) => (
          <PlayerScoreCard
            key={p.id}
            player={p}
            score={currentScores.find((s) => s.id === p.id)?.score ?? 0}
            statistics={gameStats}
            weightedScore={weighted}
            streakLength={getCurrentYasatStreak(p.id)}
            hasLongestStreak={longestOwnerId === p.id}
            showStats={showStats}
            roundStats={roundStats}
            roundWeigtedScore={roundWeighted}
            roundScoreChange={calculateRoundScoreChange(p.id)}
            showLastRoundInfo={showLastRoundInfo}
            previousStreak={getPreviousStreak(p.id)}
          />
        ))}

        {history.length === 0 && (
          <Chip
            label={
              round?.phase === 'in-progress'
                ? 'Play a round to see stats'
                : 'No rounds yet'
            }
            variant="outlined"
            sx={{ alignSelf: 'center' }}
          />
        )}

        <Offset />
      </Stack>
    </>
  );
}

export default PlayPlayerRanking;
