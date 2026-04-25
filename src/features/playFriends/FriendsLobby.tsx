/**
 * Lobby UI for Play vs Friends.
 *
 * Two phases:
 *   1. Pre-session: requires login, lets the user create or join a game.
 *   2. In-lobby: shows the session code, share link/QR, participants, length
 *      selector (host-only), and Start button (host-only).
 *
 * When the host clicks Start: a `seating` order is generated, the doc's
 * status is flipped to 'in-progress', the round is started locally, and the
 * doc is updated. Guests see the new round via their subscription and the
 * `HYDRATE_PLAY_FROM_FRIENDS_SESSION` root action.
 */
import React from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { QRCodeSVG } from 'qrcode.react';
import { nanoid } from '@reduxjs/toolkit';
import { useSnackbar } from 'notistack';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import type { RootState } from '../../app/store';
import { selectCurrentPlayer } from '../identity/identitySlice';
import { IdentityDialog } from '../identity/IdentityDialog';
import {
  cancelPlaySession,
  createPlaySession,
  fetchPlaySession,
  generatePlaySessionCode,
  joinPlaySession,
  pushHostState,
  setParticipantConnected,
  type PlayFriendsLength,
} from './playSessionService';
import {
  clearFriendsSession,
  selectPlayFriendsCode,
  selectPlayFriendsHostUsername,
  selectPlayFriendsLength,
  selectPlayFriendsParticipants,
  selectPlayFriendsRole,
  selectPlayFriendsStatus,
  setCode,
  setLength,
  setRole,
} from './playFriendsSlice';
import { initFriendsGame, selectPlayRound } from '../play/playSlice';
import { startGame, goHome, setGameView } from '../game/gameSlice';

interface FriendsLobbyProps {
  /** Optional initial code, e.g. from a `?play=CODE` deep-link. */
  initialJoinCode?: string;
}

export const FriendsLobby: React.FC<FriendsLobbyProps> = ({
  initialJoinCode,
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const store = useStore();
  const { enqueueSnackbar } = useSnackbar();
  const currentPlayer = useAppSelector(selectCurrentPlayer);
  const role = useAppSelector(selectPlayFriendsRole);
  const code = useAppSelector(selectPlayFriendsCode);
  const status = useAppSelector(selectPlayFriendsStatus);
  const participants = useAppSelector(selectPlayFriendsParticipants);
  const hostUsername = useAppSelector(selectPlayFriendsHostUsername);
  const length = useAppSelector(selectPlayFriendsLength);
  const playRound = useAppSelector(selectPlayRound);
  const [identityOpen, setIdentityOpen] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState(
    (initialJoinCode ?? '').toUpperCase(),
  );
  const [busy, setBusy] = React.useState(false);

  // Auto-attempt join from deep-link once logged in.
  const autoJoinAttemptedRef = React.useRef(false);
  React.useEffect(() => {
    if (
      initialJoinCode &&
      currentPlayer &&
      !autoJoinAttemptedRef.current &&
      !code
    ) {
      autoJoinAttemptedRef.current = true;
      handleJoin(initialJoinCode.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoinCode, currentPlayer, code]);

  // When the host flips status to 'in-progress' AND has broadcast the initial
  // round into the session doc, transition the guest into the game view. We
  // do NOT re-init / re-shuffle the round locally — the round comes from the
  // host's broadcast via HYDRATE_PLAY_FROM_FRIENDS_SESSION (mounted in App).
  React.useEffect(() => {
    if (role !== 'guest' || !code) return;
    if (status !== 'in-progress') return;
    if (!currentPlayer) return;
    if (!playRound) return;
    dispatch(setGameView('play'));
    dispatch(startGame());
  }, [status, role, code, currentPlayer, dispatch, playRound]);

  // Best-effort presence cleanup for guests in lobby on tab close/unmount.
  React.useEffect(() => {
    if (role !== 'guest' || !code || !currentPlayer) return;
    if (status !== 'lobby') return;
    const markOffline = () => {
      setParticipantConnected(code, currentPlayer.username, false).catch(
        () => undefined,
      );
    };
    window.addEventListener('beforeunload', markOffline);
    return () => {
      window.removeEventListener('beforeunload', markOffline);
      markOffline();
    };
  }, [role, code, status, currentPlayer]);

  if (!currentPlayer) {
    return (
      <Stack
        direction="column"
        alignItems="center"
        spacing={3}
        sx={{ width: '100%', pt: 6, px: 2 }}
      >
        <IconButton
          aria-label="Back"
          color="primary"
          onClick={() => dispatch(goHome())}
          sx={{ position: 'absolute', top: 8, left: 8 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#7df3e1' }}>
          Play vs. Friends
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 320, textAlign: 'center' }}
        >
          You must log in to host or join an online friends game. Stats will be
          saved to the leaderboard.
        </Typography>
        <Button variant="contained" onClick={() => setIdentityOpen(true)}>
          Log in / register
        </Button>
        <IdentityDialog
          open={identityOpen}
          onClose={() => setIdentityOpen(false)}
        />
      </Stack>
    );
  }

  const handleCreate = async () => {
    if (!currentPlayer) return;
    setBusy(true);
    try {
      const newCode = generatePlaySessionCode();
      await createPlaySession(
        newCode,
        {
          username: currentPlayer.username,
          displayName: currentPlayer.displayName,
          color: currentPlayer.color,
        },
        length,
      );
      dispatch(setRole('host'));
      dispatch(setCode(newCode));
    } catch (err) {
      enqueueSnackbar(`Failed to create game: ${(err as Error).message}`, {
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (codeToJoin: string) => {
    const trimmed = codeToJoin.trim().toUpperCase();
    if (!currentPlayer || trimmed.length !== 6) return;
    setBusy(true);
    try {
      await joinPlaySession(trimmed, {
        username: currentPlayer.username,
        displayName: currentPlayer.displayName,
        color: currentPlayer.color,
      });
      dispatch(setRole('guest'));
      dispatch(setCode(trimmed));
    } catch (err) {
      enqueueSnackbar(`Failed to join: ${(err as Error).message}`, {
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (role !== 'host' || !code) return;
    if (participants.length < 2) return;
    setBusy(true);
    try {
      // Generate stable PlayerIds for everyone (8-char nanoid for low collision).
      const seating = participants.map(() => nanoid(6));
      const playerNames: Record<string, string> = {};
      const usernameByPlayerId: Record<string, string> = {};
      participants.forEach((p, i) => {
        playerNames[seating[i]] = p.displayName;
        usernameByPlayerId[seating[i]] = p.username;
      });
      const seed = Date.now() & 0xffffffff;
      // Init the game locally first so we can read the freshly-shuffled round
      // and broadcast it to all guests in the same write that flips status to
      // 'in-progress'. This guarantees every device starts from the SAME hand
      // / discard / deck state.
      dispatch(
        initFriendsGame({
          seating,
          playerNames,
          usernameByPlayerId,
          humanUsername: currentPlayer.username,
          length,
          seed,
        }),
      );
      const freshState = (store.getState() as RootState).play;
      await pushHostState(code, {
        status: 'in-progress',
        seating,
        playerNames,
        usernameByPlayerId,
        round: freshState.round,
        cumulativeTotals: freshState.cumulativeTotals,
        roundHistory: freshState.roundHistory,
        log: freshState.log,
        lastEvents: freshState.lastEvents,
        gameOver: freshState.gameOver,
        length,
      });
      dispatch(setGameView('play'));
      dispatch(startGame());
    } catch (err) {
      enqueueSnackbar(`Failed to start: ${(err as Error).message}`, {
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (role === 'host' && code && (status === 'lobby' || status === null)) {
      await cancelPlaySession(code);
    }
    if (role === 'guest' && code && currentPlayer) {
      await setParticipantConnected(code, currentPlayer.username, false).catch(
        () => undefined,
      );
    }
    dispatch(clearFriendsSession());
    dispatch(goHome());
  };

  // Pre-session: choose create or join.
  if (!code) {
    return (
      <Stack
        direction="column"
        alignItems="center"
        spacing={3}
        sx={{ width: '100%', pt: 6, px: 2 }}
      >
        <IconButton
          aria-label="Back"
          color="primary"
          onClick={() => dispatch(goHome())}
          sx={{ position: 'absolute', top: 8, left: 8 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#7df3e1' }}>
          Play vs. Friends
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: 320, textAlign: 'center' }}
        >
          Logged in as <strong>{currentPlayer.displayName}</strong>.
        </Typography>

        <Stack
          direction="column"
          spacing={2}
          alignItems="center"
          sx={{ width: '100%', maxWidth: 360 }}
        >
          <Typography variant="subtitle1" sx={{ color: '#7df3e1', mt: 2 }}>
            Host a new game
          </Typography>
          <ButtonGroup
            fullWidth
            size="small"
            aria-label="Game length"
            sx={{ maxWidth: 280 }}
          >
            {(['bo10', 'firstTo10'] as PlayFriendsLength[]).map((l) => (
              <Button
                key={l}
                variant={length === l ? 'contained' : 'outlined'}
                onClick={() => dispatch(setLength(l))}
              >
                {l === 'bo10' ? 'Best of 10' : 'First to 10'}
              </Button>
            ))}
          </ButtonGroup>
          <Button variant="contained" disabled={busy} onClick={handleCreate}>
            Create game
          </Button>

          <Divider flexItem sx={{ my: 1 }}>
            <Typography variant="caption" color="text.secondary">
              or
            </Typography>
          </Divider>

          <Typography variant="subtitle1" sx={{ color: '#7df3e1' }}>
            Join with code
          </Typography>
          <TextField
            label="6-character code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            inputProps={{
              style: { textAlign: 'center', letterSpacing: 4, fontFamily: 'monospace' },
              maxLength: 6,
            }}
            sx={{ maxWidth: 280 }}
            fullWidth
          />
          <Button
            variant="outlined"
            disabled={busy || joinCode.length !== 6}
            onClick={() => handleJoin(joinCode)}
          >
            Join
          </Button>
        </Stack>
      </Stack>
    );
  }

  // In-session lobby (status==='lobby' renders here; other statuses transition out).
  const joinUrl = `${window.location.origin}${window.location.pathname}?play=${code}`;
  const isHost = role === 'host';
  const canStart = isHost && participants.length >= 2 && status === 'lobby';

  return (
    <Stack
      direction="column"
      alignItems="center"
      spacing={3}
      sx={{ width: '100%', pt: 6, px: 2, pb: 10 }}
    >
      <IconButton
        aria-label="Leave"
        color="primary"
        onClick={onLeave}
        sx={{ position: 'absolute', top: 8, left: 8 }}
      >
        <ArrowBackIcon />
      </IconButton>
      <Typography variant="h5" sx={{ color: '#7df3e1' }}>
        Play vs. Friends — Lobby
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography
          variant="h4"
          sx={{ fontFamily: 'monospace', letterSpacing: 4 }}
        >
          {code}
        </Typography>
        <Tooltip title="Copy code">
          <IconButton
            size="small"
            onClick={() => {
              navigator.clipboard.writeText(code);
              enqueueSnackbar('Code copied', { variant: 'success' });
            }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ p: 1, bgcolor: 'white', borderRadius: 1 }}>
        <QRCodeSVG value={joinUrl} size={160} />
      </Box>
      <Button
        variant="text"
        size="small"
        onClick={() => {
          navigator.clipboard.writeText(joinUrl);
          enqueueSnackbar('Link copied', { variant: 'success' });
        }}
      >
        Copy invite link
      </Button>

      <Divider flexItem />

      <Typography variant="subtitle1" sx={{ color: '#7df3e1' }}>
        Players ({participants.length}/4)
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        justifyContent="center"
      >
        {participants.map((p) => (
          <Chip
            key={p.username}
            avatar={
              <Avatar sx={{ bgcolor: p.color || theme.palette.primary.main }}>
                {p.displayName.slice(0, 1).toUpperCase()}
              </Avatar>
            }
            label={
              p.displayName +
              (p.username === hostUsername ? ' (host)' : '') +
              (p.connected ? '' : ' • offline')
            }
            variant={p.connected ? 'filled' : 'outlined'}
            sx={{ opacity: p.connected ? 1 : 0.6 }}
          />
        ))}
      </Stack>

      {isHost ? (
        <>
          <ButtonGroup
            fullWidth
            size="small"
            aria-label="Game length"
            sx={{ maxWidth: 280 }}
          >
            {(['bo10', 'firstTo10'] as PlayFriendsLength[]).map((l) => (
              <Button
                key={l}
                variant={length === l ? 'contained' : 'outlined'}
                onClick={async () => {
                  dispatch(setLength(l));
                  if (code) {
                    await pushHostState(code, { length: l }).catch(() => undefined);
                  }
                }}
              >
                {l === 'bo10' ? 'Best of 10' : 'First to 10'}
              </Button>
            ))}
          </ButtonGroup>
          <Button
            variant="contained"
            color="primary"
            disabled={!canStart || busy}
            onClick={handleStart}
          >
            Start game
          </Button>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Waiting for host to start…
        </Typography>
      )}

      <Button variant="outlined" color="warning" size="small" onClick={onLeave}>
        Leave lobby
      </Button>
    </Stack>
  );
};

export default FriendsLobby;
