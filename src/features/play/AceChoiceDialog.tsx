import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  selectAwaitingAceChoices,
  selectPlayHumanId,
  selectPlayRound,
  selectPlayTotals,
  selectPlayersWithAces,
  selectPendingAceChoices,
  submitAceChoices,
} from './playSlice';
import PlayingCard from './PlayingCard';
import type { Card } from './engine/cards';

/**
 * Shown after a round ends when the human player holds at least one ace.
 * Each ace gets a 1 / 11 toggle. Confirming dispatches `submitAceChoices`.
 *
 * If the human has NO aces but other players do, auto-submits immediately
 * (the human has nothing to choose).
 */
export const AceChoiceDialog: React.FC = () => {
  const dispatch = useAppDispatch();
  const awaiting = useAppSelector(selectAwaitingAceChoices);
  const humanId = useAppSelector(selectPlayHumanId);
  const round = useAppSelector(selectPlayRound);
  const playersWithAces = useAppSelector(selectPlayersWithAces);
  const pendingChoices = useAppSelector(selectPendingAceChoices);
  const totals = useAppSelector(selectPlayTotals);

  const humanHasAces = humanId !== null && playersWithAces.includes(humanId);
  const humanAlreadySubmitted = humanId !== null && humanId in (pendingChoices ?? {});

  // Local toggle state — one entry per ace card.
  const [choices, setChoices] = React.useState<Record<string, 1 | 11>>({});

  // Derive cards from the human's hand.
  const humanPlayer = round?.players.find((p) => p.id === humanId);
  const hand: Card[] = humanPlayer?.hand ?? [];
  const aces: Card[] = hand.filter((c) => c.rank === 'A');
  const nonAces: Card[] = hand.filter((c) => c.rank !== 'A');

  // Initialise choices when dialog opens (all default to 1).
  React.useEffect(() => {
    if (awaiting && humanHasAces && !humanAlreadySubmitted) {
      const init: Record<string, 1 | 11> = {};
      for (const a of aces) init[a.id] = 1;
      setChoices(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, humanHasAces, humanAlreadySubmitted]);

  // Auto-submit for the human when they hold no aces.
  React.useEffect(() => {
    if (awaiting && humanId && !humanHasAces && !humanAlreadySubmitted) {
      dispatch(submitAceChoices({ playerId: humanId, choices: {} }));
    }
  }, [awaiting, humanId, humanHasAces, humanAlreadySubmitted, dispatch]);

  // Nothing to render when not awaiting or human doesn't have aces.
  if (!awaiting || !humanHasAces || humanAlreadySubmitted) return null;

  // Compute live preview of hand points.
  const currentTotal = humanId ? (totals[humanId] ?? 0) : 0;
  const handPreview = hand.reduce((sum, c) => {
    if (c.rank === 'A') return sum + (choices[c.id] ?? 1);
    if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return sum + 10;
    return sum + Number(c.rank);
  }, 0);
  const projectedTotal = currentTotal + handPreview;

  const handleToggle = (cardId: string, val: 1 | 11) => {
    setChoices((prev) => ({ ...prev, [cardId]: val }));
  };

  const handleConfirm = () => {
    if (!humanId) return;
    dispatch(submitAceChoices({ playerId: humanId, choices }));
  };

  return (
    <Dialog open maxWidth="xs" fullWidth>
      <DialogTitle>Choose Ace Values</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Current score: <strong>{currentTotal}</strong>
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose whether each Ace counts as 1 or 11.
        </Typography>

        {nonAces.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Other cards
            </Typography>
            <Stack
              direction="row"
              spacing={0.5}
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 2, mt: 0.5 }}
            >
              {nonAces.map((c) => (
                <PlayingCard key={c.id} card={c} size="sm" />
              ))}
            </Stack>
          </>
        )}

        <Typography variant="caption" color="text.secondary">
          Aces
        </Typography>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {aces.map((ace) => (
            <Stack
              key={ace.id}
              direction="row"
              spacing={2}
              alignItems="center"
            >
              <PlayingCard card={ace} size="sm" />
              <ToggleButtonGroup
                exclusive
                size="small"
                value={choices[ace.id] ?? 1}
                onChange={(_, val) => {
                  if (val !== null) handleToggle(ace.id, val as 1 | 11);
                }}
              >
                <ToggleButton value={1}>1</ToggleButton>
                <ToggleButton value={11}>11</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          ))}
        </Stack>

        <Typography variant="subtitle1" sx={{ mt: 2 }}>
          Hand total: <strong>{handPreview}</strong> · New score:{' '}
          <strong>{projectedTotal}</strong>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleConfirm}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AceChoiceDialog;
