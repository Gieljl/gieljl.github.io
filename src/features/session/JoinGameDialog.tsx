import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  CircularProgress,
  Stack,
} from '@mui/material';
import { useAppDispatch } from '../../app/hooks';
import { setRole, setSessionCode, setSessionError } from './sessionSlice';
import { fetchSession } from './sessionService';
import { HYDRATE_FROM_SESSION } from '../../app/store';

interface JoinGameDialogProps {
  open: boolean;
  onClose: () => void;
  initialCode?: string;
}

export const JoinGameDialog: React.FC<JoinGameDialogProps> = ({
  open,
  onClose,
  initialCode = '',
}) => {
  const dispatch = useAppDispatch();
  const [code, setCode] = React.useState(initialCode);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Code must be 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const session = await fetchSession(trimmed);
      if (!session) {
        setError('Game not found. Check the code and try again.');
        setLoading(false);
        return;
      }

      // Hydrate local state with the session data
      dispatch({
        type: HYDRATE_FROM_SESSION,
        payload: {
          players: session.players,
          scores: session.scores,
          stats: session.stats,
          game: session.game,
        },
      });

      dispatch(setSessionCode(trimmed));
      dispatch(setRole('viewer'));
      dispatch(setSessionError(null));

      setLoading(false);
      onClose();
    } catch (err) {
      setError('Failed to join game. Please try again.');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode('');
    setError(null);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Join Online Game</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Enter the 6-character game code to watch a game live.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Game Code"
            placeholder="e.g. ABC123"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().slice(0, 6));
              setError(null);
            }}
            inputProps={{
              maxLength: 6,
              style: {
                fontFamily: 'monospace',
                fontSize: 24,
                letterSpacing: 6,
                textAlign: 'center',
              },
            }}
            error={!!error}
            helperText={error}
            disabled={loading}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleJoin}
          variant="contained"
          disabled={loading || code.trim().length !== 6}
          startIcon={loading ? <CircularProgress size={18} /> : undefined}
        >
          {loading ? 'Joining...' : 'Join'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
