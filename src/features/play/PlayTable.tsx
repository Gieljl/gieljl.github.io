import React from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { useSnackbar, closeSnackbar } from 'notistack';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goHome, setGameView } from '../game/gameSlice';
import PlayingCard from './PlayingCard';
import logo from '../../yasa7.png';
import logolight from '../../yasa7_light.png';
import { classifyDiscard, pickableFromDiscard } from './engine/combos';
import { Card, handPoints } from './engine/cards';
import {
  clearError,
  clearLastEvents,
  endGame,
  selectPlayCurrentPlayerId,
  selectPlayHumanId,
  selectPlayLastError,
  selectPlayLastEvents,
  selectPlayLog,
  selectPlayRound,
  submitAction,
} from './playSlice';
import { useBotDriver } from './useBotDriver';
import { usePlayGameEnd } from './usePlayGameEnd';
import RoundEndDialog from './RoundEndDialog';
import { selectStatsWeight } from '../stats/statsSlice';
import { computePlayWeightedScores } from './weightedScore';
import { selectPlayLength } from './playSlice';
import { GameProgressIndicator } from '../game/GameProgressIndicator';

export const PlayTable: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const round = useAppSelector(selectPlayRound);
  const humanId = useAppSelector(selectPlayHumanId);
  const currentId = useAppSelector(selectPlayCurrentPlayerId);
  const error = useAppSelector(selectPlayLastError);
  const log = useAppSelector(selectPlayLog);
  const lastEvents = useAppSelector(selectPlayLastEvents);
  const totals = useAppSelector((s) => s.play.cumulativeTotals);
  const thinking = useAppSelector((s) => s.play.thinkingPlayerId);
  const history = useAppSelector((s) => s.play.roundHistory);
  const statsWeights = useAppSelector(selectStatsWeight);
  const length = useAppSelector(selectPlayLength);

  useBotDriver();
  usePlayGameEnd();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // --- Card-flight animations -------------------------------------------------
  // We keep refs to the deck, the discard area, the human hand row, and each
  // opponent's card stack so we can compute pixel-space source/target rects
  // for each event and animate transient "flyer" cards between them.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const deckRef = React.useRef<HTMLDivElement | null>(null);
  const discardRef = React.useRef<HTMLDivElement | null>(null);
  const humanHandRef = React.useRef<HTMLDivElement | null>(null);
  const opponentRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  interface Flyer {
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    card?: Card;
    faceDown: boolean;
    delay: number;
  }
  const [flyers, setFlyers] = React.useState<Flyer[]>([]);
  const flyerSeqRef = React.useRef(0);

  React.useLayoutEffect(() => {
    if (!lastEvents.length) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      dispatch(clearLastEvents());
      return;
    }
    const centerOf = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - containerRect.left,
        y: r.top + r.height / 2 - containerRect.top,
      };
    };
    const playerCenter = (playerId: string) => {
      if (playerId === humanId) return centerOf(humanHandRef.current);
      return centerOf(opponentRefs.current[playerId] ?? null);
    };

    const newFlyers: Flyer[] = [];
    for (const ev of lastEvents) {
      if (ev.type === 'discarded') {
        const from = playerCenter(ev.playerId);
        const to = centerOf(discardRef.current);
        if (!from || !to) continue;
        ev.cards.forEach((card, i) => {
          newFlyers.push({
            id: `fly-${flyerSeqRef.current++}`,
            fromX: from.x,
            fromY: from.y,
            toX: to.x + (i - (ev.cards.length - 1) / 2) * 10,
            toY: to.y,
            card,
            faceDown: false,
            delay: i * 60,
          });
        });
      } else if (ev.type === 'drewFromDeck') {
        const from = centerOf(deckRef.current);
        const to = playerCenter(ev.playerId);
        if (!from || !to) continue;
        newFlyers.push({
          id: `fly-${flyerSeqRef.current++}`,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          faceDown: true,
          delay: 120,
        });
      } else if (ev.type === 'drewFromDiscard') {
        const from = centerOf(discardRef.current);
        const to = playerCenter(ev.playerId);
        if (!from || !to) continue;
        newFlyers.push({
          id: `fly-${flyerSeqRef.current++}`,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          // Hide opponent draws so the human can't see what was taken.
          card: ev.playerId === humanId ? ev.card : undefined,
          faceDown: ev.playerId !== humanId,
          delay: 120,
        });
      }
    }

    if (newFlyers.length) {
      setFlyers((prev) => [...prev, ...newFlyers]);
      const ids = new Set(newFlyers.map((f) => f.id));
      const maxDelay = newFlyers.reduce((m, f) => Math.max(m, f.delay), 0);
      const cleanup = window.setTimeout(
        () => setFlyers((prev) => prev.filter((f) => !ids.has(f.id))),
        700 + maxDelay,
      );
      dispatch(clearLastEvents());
      return () => window.clearTimeout(cleanup);
    }
    dispatch(clearLastEvents());
  }, [lastEvents, dispatch, humanId]);

  React.useEffect(() => {
    setSelected(new Set());
  }, [currentId, round?.phase]);

  React.useEffect(() => {
    if (error) {
      enqueueSnackbar(error, { variant: 'warning' });
      dispatch(clearError());
    }
  }, [error, enqueueSnackbar, dispatch]);

  if (!round) {
    return (
      <Stack alignItems="center" sx={{ pt: 8 }} spacing={2}>
        <Typography>No play game in progress.</Typography>
        <Button variant="contained" onClick={() => dispatch(goHome())}>
          Home
        </Button>
      </Stack>
    );
  }

  const human = round.players.find((p) => p.id === humanId);
  const isMyTurn = currentId === humanId && round.phase === 'in-progress';
  const humanHand = human?.hand ?? [];
  const selectedCards: Card[] = humanHand.filter((c) => selected.has(c.id));
  const discardShape = classifyDiscard(selectedCards);
  const canDiscard = isMyTurn && discardShape !== null && selectedCards.length > 0;
  const myPoints = handPoints(humanHand);
  const canYasat = isMyTurn && myPoints <= 7;

  const topPly = round.discardPlies[round.discardPlies.length - 1] ?? [];
  const pickable = new Set(pickableFromDiscard(topPly).map((c) => c.id));

  const toggleCard = (id: string) => {
    if (!isMyTurn) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const drawFromDeck = () => {
    if (!canDiscard) return;
    dispatch(
      submitAction({
        type: 'discardThenDraw',
        discard: selectedCards,
        drawFrom: 'deck',
      }),
    );
  };

  const drawFromDiscard = (cardId: string) => {
    if (!canDiscard) {
      enqueueSnackbar('Select a valid discard first.', { variant: 'info' });
      return;
    }
    dispatch(
      submitAction({
        type: 'discardThenDraw',
        discard: selectedCards,
        drawFrom: { fromDiscardId: cardId },
      }),
    );
  };

  const declareYasat = () => {
    dispatch(submitAction({ type: 'declareYasat' }));
  };

  const onClickLeaveGame = () => {
    enqueueSnackbar('Leave the current game and return to the start screen?', {
      variant: 'warning',
      persist: true,
      action: (key) => (
        <>
          <Button
            color="inherit"
            onClick={() => {
              dispatch(endGame());
              dispatch(goHome());
              closeSnackbar(key);
            }}
          >
            Yes
          </Button>
          <Button color="inherit" onClick={() => closeSnackbar(key)}>
            No
          </Button>
        </>
      ),
    });
  };

  const opponents = round.players.filter((p) => p.id !== humanId);

  // Weighted score per player, computed exactly like PlayPlayerRanking /
  // PlayerRanking so the chip matches the stats view.
  const weightedById = computePlayWeightedScores(
    history,
    round.players.map((p) => p.id),
    statsWeights,
  );

  return (
    <Box ref={containerRef} sx={{ width: '100%', pb: 10, pt: 0, px: 0, position: 'relative' }}>
      {/* Top bar with logo, stats + quit buttons (matches PlayPlayerRanking) */}
      <Stack
        direction="row"
        sx={{
          minWidth: '100%',
          zIndex: 2,
          maxWidth: '100%',
          position: 'fixed',
          top: 0,
          left: 0,
          overflowX: 'visible',
          overflowY: 'hidden',
          bgcolor: theme.palette.background.paper,
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Stack direction="row" mt={1} alignItems="center" spacing={1} sx={{ pl: 1, pr: 1, flex: 1 }}>
          <img
            src={theme.palette.mode === 'light' ? logolight : logo}
            className="App-logo-small"
            alt="logo"
          />
          <Tooltip title="Show weighted stats view">
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<QueryStatsIcon />}
              onClick={() => dispatch(setGameView('new'))}
            >
              Stats
            </Button>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Leave game">
            <IconButton
              size="small"
              sx={{ color: theme.palette.primary.main }}
              onClick={onClickLeaveGame}
              aria-label="Leave game"
            >
              <ExitToAppIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ height: 64 }} />

      {/* Opponents row */}
      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        alignItems="flex-start"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2, px: 1 }}
      >
        {opponents.map((p) => (
          <Stack key={p.id} alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography
                variant="body2"
                sx={{
                  fontWeight: currentId === p.id ? 700 : 400,
                  color: currentId === p.id ? theme.palette.primary.main : 'text.primary',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
                {thinking === p.id && ' …'}
              </Typography>
              <Chip
                size="small"
                label={weightedById[p.id] ?? 0}
                color="primary"
                variant="filled"
                sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
              />
            </Stack>
            <Stack
              direction="row"
              spacing={-1.5}
              ref={(el: HTMLDivElement | null) => {
                opponentRefs.current[p.id] = el;
              }}
            >
              {p.hand.map((c) => (
                <PlayingCard key={c.id} faceDown size="sm" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              total {totals[p.id] ?? 0}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {/* Center: deck + discard */}
      <Stack direction="row" spacing={3} justifyContent="center" alignItems="center" sx={{ mb: 2 }}>
        <Stack alignItems="center" ref={deckRef}>
          <Tooltip title={canDiscard ? 'Draw from deck' : 'Select a valid discard first'}>
            <span>
              <PlayingCard
                faceDown
                size="md"
                onClick={canDiscard ? drawFromDeck : undefined}
                disabled={!canDiscard}
              />
            </span>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            deck {round.drawPile.length}
          </Typography>
        </Stack>

        <Stack alignItems="center" ref={discardRef}>
          <Stack direction="row" spacing={pickable.size > 1 ? 0.5 : -1.5}>
            {topPly.length === 0 ? (
              <Box sx={{ width: 62, height: 88 }} />
            ) : (
              topPly.map((c) => {
                const isPickable = pickable.has(c.id) && isMyTurn && canDiscard;
                return (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    size="md"
                    pickable={isPickable}
                    onClick={
                      pickable.has(c.id) && isMyTurn ? () => drawFromDiscard(c.id) : undefined
                    }
                    disabled={!pickable.has(c.id) || !isMyTurn}
                  />
                );
              })
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            discard{topPly.length > 1 ? ' · tap a glowing card to take it' : ''}
          </Typography>
        </Stack>
      </Stack>

      {/* Your hand */}
      <Box sx={{ px: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 2.5 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: isMyTurn ? 700 : 400,
              color: isMyTurn ? theme.palette.primary.main : 'text.primary',
            }}
          >
            {human?.name ?? 'You'}
          </Typography>
          {humanId && (
            <Chip
              size="small"
              label={weightedById[humanId] ?? 0}
              color="primary"
              variant="filled"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
            />
          )}
          <Typography variant="caption" color="text.secondary">
            hand {myPoints} · total {totals[humanId ?? ''] ?? 0}
          </Typography>
          {isMyTurn && <Chip size="small" label="Your turn" color="primary" />}
          {discardShape && (
            <Chip size="small" variant="outlined" label={discardShape} />
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          justifyContent="center"
          useFlexGap
          sx={{ pt: 1.5 }}
          ref={humanHandRef}
        >
          {[...humanHand]
            .sort((a, b) => a.suit.localeCompare(b.suit) || a.rank.localeCompare(b.rank))
            .map((c) => (
              <PlayingCard
                key={c.id}
                card={c}
                size="md"
                selected={selected.has(c.id)}
                onClick={() => toggleCard(c.id)}
                disabled={!isMyTurn}
              />
            ))}
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            size="small"
            disabled={!canDiscard}
            onClick={drawFromDeck}
          >
            Discard &amp; Draw
          </Button>
          <Button
            variant="contained"
            size="small"
            color="secondary"
            disabled={!canYasat}
            onClick={declareYasat}
          >
            Declare Yasat
          </Button>
        </Stack>
      </Box>

      {/* Action log */}
      {log.length > 0 && (
        <Box sx={{ mt: 2, px: 1, maxWidth: 520, mx: 'auto' }}>
          <Typography variant="caption" color="text.secondary">
            Log
          </Typography>
          <Box
            sx={{
              maxHeight: 100,
              overflowY: 'auto',
              bgcolor: 'rgba(0,0,0,0.15)',
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            {log.slice(-8).map((e) => (
              <Typography key={e.id} variant="caption" display="block">
                {e.message}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      <GameProgressIndicator
        roundsPlayed={history.length}
        length={length}
      />

      {/* Card-flight animation overlay (above table, below dialogs). */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 5,
        }}
      >
        {flyers.map((f) => (
          <FlyerCard key={f.id} flyer={f} />
        ))}
      </Box>

      <RoundEndDialog />
    </Box>
  );
};

interface FlyerCardProps {
  flyer: {
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    card?: Card;
    faceDown: boolean;
    delay: number;
  };
}

// Card width/height for size="md", as defined in PlayingCard.tsx.
const FLYER_W = 62;
const FLYER_H = 88;

const FlyerCard: React.FC<FlyerCardProps> = ({ flyer }) => {
  const [arrived, setArrived] = React.useState(false);
  React.useLayoutEffect(() => {
    // Trigger transition on the next paint frame.
    const id = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const x = arrived ? flyer.toX : flyer.fromX;
  const y = arrived ? flyer.toY : flyer.fromY;
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${x - FLYER_W / 2}px, ${y - FLYER_H / 2}px)`,
        transition: `transform 600ms cubic-bezier(.4,.9,.3,1) ${flyer.delay}ms, opacity 200ms ease-out ${flyer.delay + 500}ms`,
        opacity: arrived ? 0 : 1,
        willChange: 'transform, opacity',
      }}
    >
      <PlayingCard card={flyer.card} faceDown={flyer.faceDown} size="md" />
    </Box>
  );
};

export default PlayTable;
