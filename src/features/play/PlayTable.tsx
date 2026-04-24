import React from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goHome } from '../game/gameSlice';
import PlayingCard from './PlayingCard';
import { classifyDiscard, pickableFromDiscard } from './engine/combos';
import { Card, handPoints } from './engine/cards';
import {
  clearError,
  endGame,
  selectPlayCurrentPlayerId,
  selectPlayHumanId,
  selectPlayLastError,
  selectPlayLog,
  selectPlayRound,
  submitAction,
} from './playSlice';
import { useBotDriver } from './useBotDriver';
import RoundEndDialog from './RoundEndDialog';

export const PlayTable: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const round = useAppSelector(selectPlayRound);
  const humanId = useAppSelector(selectPlayHumanId);
  const currentId = useAppSelector(selectPlayCurrentPlayerId);
  const error = useAppSelector(selectPlayLastError);
  const log = useAppSelector(selectPlayLog);
  const totals = useAppSelector((s) => s.play.cumulativeTotals);
  const thinking = useAppSelector((s) => s.play.thinkingPlayerId);

  useBotDriver();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    // Clear selection whenever turn changes.
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

  const opponents = round.players.filter((p) => p.id !== humanId);

  return (
    <Box sx={{ width: '100%', pb: 10, pt: 1, px: 0 }}>
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
            <Stack direction="row" spacing={-1.5}>
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
        <Stack alignItems="center">
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

        <Stack alignItems="center">
          <Stack direction="row" spacing={-1.5}>
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
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: isMyTurn ? 700 : 400,
              color: isMyTurn ? theme.palette.primary.main : 'text.primary',
            }}
          >
            {human?.name ?? 'You'} — {myPoints} pts
          </Typography>
          {isMyTurn && <Chip size="small" label="Your turn" color="primary" />}
          {discardShape && (
            <Chip size="small" variant="outlined" label={discardShape} />
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            total {totals[humanId ?? ''] ?? 0}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
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

      <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
        <Button
          size="small"
          onClick={() => {
            dispatch(endGame());
            dispatch(goHome());
          }}
        >
          Quit
        </Button>
      </Stack>

      <RoundEndDialog />
    </Box>
  );
};

export default PlayTable;
