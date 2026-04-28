import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { setGameView } from '../game/gameSlice';
import { goHome } from '../game/gameSlice';
import {
  beginNextRound,
  clearRoundResult,
  endGame,
  selectPlayGameOver,
  selectPlayLastRoundResult,
  selectPlayNames,
  selectPlayRound,
  selectPlayTotals,
} from './playSlice';
import PlayingCard from './PlayingCard';
import { EVENT_LABELS } from './eventLabels';

export const RoundEndDialog: React.FC = () => {
  const dispatch = useAppDispatch();
  const result = useAppSelector(selectPlayLastRoundResult);
  const names = useAppSelector(selectPlayNames);
  const totals = useAppSelector(selectPlayTotals);
  const round = useAppSelector(selectPlayRound);
  const gameOver = useAppSelector(selectPlayGameOver);

  if (!result) return null;

  const handByPlayer = new Map(
    (round?.players ?? []).map((p) => [p.id, p.hand]),
  );

  const handleNext = () => {
    dispatch(clearRoundResult());
    if (gameOver) {
      dispatch(setGameView('new'));
      return;
    }
    dispatch(beginNextRound());
  };

  const handleEnd = () => {
    dispatch(endGame());
    dispatch(goHome());
  };

  return (
    <Dialog open={true} maxWidth="sm" fullWidth>
      <DialogTitle>
        Round {result.roundIndex + 1} — {result.callerWon ? 'Yasat!' : 'Owned!'}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Caller: {names[result.callerId] ?? result.callerId}
        </Typography>
        <List dense disablePadding>
          {result.perPlayer.map((p) => {
            const hand = handByPlayer.get(p.playerId) ?? [];
            return (
              <ListItem
                key={p.playerId}
                alignItems="flex-start"
                sx={{ flexDirection: 'column', alignItems: 'stretch', px: 0, py: 1 }}
              >
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="baseline"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography sx={{ fontWeight: 600 }}>
                        {names[p.playerId] ?? p.playerId}
                        {p.playerId === result.callerId && ' (caller)'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        hand {p.handPoints} · +{p.pointsAdded} · total{' '}
                        {totals[p.playerId] ?? p.newTotal}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    p.events.length > 0
                      ? p.events.map((e) => EVENT_LABELS[e]).join(' · ')
                      : null
                  }
                />
                {hand.length > 0 && (
                  <Stack
                    direction="row"
                    spacing={0.5}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 1 }}
                  >
                    {hand.map((c) => (
                      <PlayingCard key={c.id} card={c} size="sm" />
                    ))}
                  </Stack>
                )}
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleEnd}>End Game</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={handleNext}>
          {gameOver ? 'Show Final Results' : 'Next Round'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoundEndDialog;
