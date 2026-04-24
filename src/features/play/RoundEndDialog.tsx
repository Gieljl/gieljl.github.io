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
import { goHome } from '../game/gameSlice';
import {
  beginNextRound,
  clearRoundResult,
  endGame,
  selectPlayLastRoundResult,
  selectPlayNames,
  selectPlayRound,
  selectPlayTotals,
} from './playSlice';
import type { RoundStatEvent } from './engine/scoring';
import PlayingCard from './PlayingCard';

const EVENT_LABELS: Record<RoundStatEvent, string> = {
  yasat: 'Yasat!',
  own: 'Own',
  owned: 'Owned',
  'multi-owned': 'Multi-owned',
  kill: 'Kill',
  'double-kill': 'Double Kill',
  'multi-kill': 'Multi Kill',
  'mega-kill': 'Mega Kill',
  'monster-kill': 'MONSTER KILL',
  death: 'Death',
  'nullify-50': 'Nullify 50',
  'nullify-100': 'Nullify 100',
  'enable-50': 'Enable 50',
  'enable-100': 'Enable 100',
  lullify: 'Lullify',
  'enable-69': 'Enable 69',
  'contra-own-50': 'Contra-own 50',
  'contra-own-100': 'Contra-own 100',
};

export const RoundEndDialog: React.FC = () => {
  const dispatch = useAppDispatch();
  const result = useAppSelector(selectPlayLastRoundResult);
  const names = useAppSelector(selectPlayNames);
  const totals = useAppSelector(selectPlayTotals);
  const round = useAppSelector(selectPlayRound);

  if (!result) return null;

  const handByPlayer = new Map(
    (round?.players ?? []).map((p) => [p.id, p.hand]),
  );

  const handleNext = () => {
    dispatch(clearRoundResult());
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
        <Divider sx={{ my: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Nothing here is saved to rankings — local sandbox only.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleEnd}>End Game</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={handleNext}>
          Next Round
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoundEndDialog;
