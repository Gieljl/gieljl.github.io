import React from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { goHome, startGame, setGameLength } from '../game/gameSlice';
import { GAME_LENGTH_OPTIONS, GAME_LENGTH_DESCRIPTION, type GameLength } from '../game/gameLength';
import { initGame } from './playSlice';
import type { Difficulty } from './ai/botPolicy';
import { IdentityDialog } from '../identity/IdentityDialog';
import {
  logout,
  selectCurrentPlayer,
} from '../identity/identitySlice';
import logo from '../../yasa7.png';
import logolight from '../../yasa7_light.png';
import '../../App.css';

const BOT_NAMES = [
  'Sanne',
  'Daan',
  'Lotte',
  'Jeroen',
  'Femke',
  'Bram',
  'Fleur',
  'Thijs',
  'Anouk',
  'Sven',
  'Eva',
  'Niels',
  'Marieke',
  'Joris',
  'Bas',
  'Lieke',
  'Pieter',
  'Esmee',
  'Tim',
  'Noa',
];

/** Fisher–Yates shuffle returning a new array. */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const PlayCreator: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const currentPlayer = useAppSelector(selectCurrentPlayer);
  const isLoggedIn = !!currentPlayer;
  const [yourName, setYourName] = React.useState(
    currentPlayer?.displayName || 'You',
  );
  const [numBots, setNumBots] = React.useState(2);
  const [difficulty, setDifficulty] = React.useState<Difficulty>('normal');
  const [length, setLength] = React.useState<GameLength>('classic');
  const [openIdentity, setOpenIdentity] = React.useState(false);

  // Keep the name field in sync with the logged-in player.
  React.useEffect(() => {
    if (currentPlayer?.displayName) setYourName(currentPlayer.displayName);
  }, [currentPlayer?.displayName]);

  const difficultyHint: Record<Difficulty, string> = {
    easy: 'Easy: bots play simpler and declare Yasat earlier.',
    normal: 'Normal: bots play for weighted stats and better long-term value.',
    godlike: 'Godlike: bots use one-turn lookahead and optimise for weighted stats.',
  };

  const start = () => {
    const picks = shuffled(BOT_NAMES);
    const bots = Array.from({ length: numBots }, (_, i) => ({
      name: picks[i] ?? `Bot${i + 1}`,
      isBot: true,
    }));
    const players = [{ name: yourName.trim() || 'You', isBot: false }, ...bots];
    dispatch(
      initGame({
        players,
        humanIndex: 0,
        difficulty,
        length,
        humanUsername: currentPlayer?.username ?? null,
      }),
    );
    dispatch(setGameLength(length));
    dispatch(startGame());
  };

  return (
    <>
      <IconButton
        aria-label="Back to home"
        color="primary"
        onClick={() => dispatch(goHome())}
        sx={{ position: 'absolute', top: 8, left: 8 }}
      >
        <ArrowBackIcon />
      </IconButton>
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5, mb: -2 }}>
        <img
          src={theme.palette.mode === 'light' ? logolight : logo}
          className="App-logo-small"
          alt="logo"
        />
      </Box>
      <Stack
        direction="column"
        alignItems="center"
        spacing={3}
        sx={{ width: '100%', pt: 4, pb: 10, maxWidth: 360, mx: 'auto', px: 2 }}
      >
      <Typography variant="h6" color="primary">
        Play vs. AI
      </Typography>

      <TextField
        label="Your name"
        value={yourName}
        onChange={(e) => setYourName(e.target.value)}
        size="small"
        sx={{ width: 220 }}
        disabled={isLoggedIn}
        helperText={isLoggedIn ? 'Using your account name' : ' '}
      />

      {isLoggedIn ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Saving stats as <strong>{currentPlayer.displayName}</strong>
          </Typography>
          <IconButton
            size="small"
            aria-label="Log out"
            onClick={() => dispatch(logout())}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Log in to save your Play stats
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PersonIcon />}
            onClick={() => setOpenIdentity(true)}
          >
            Log in
          </Button>
        </Stack>
      )}

      <Stack direction="row" spacing={2} alignItems="center">
        <Typography>Opponents:</Typography>
        <IconButton
          size="small"
          onClick={() => setNumBots((n) => Math.max(1, n - 1))}
          disabled={numBots <= 1}
        >
          <RemoveIcon />
        </IconButton>
        <Typography variant="h6" sx={{ minWidth: 24, textAlign: 'center' }}>
          {numBots}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setNumBots((n) => Math.min(3, n + 1))}
          disabled={numBots >= 3}
        >
          <AddIcon />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center">
        <Typography>Difficulty:</Typography>
        <Select
          size="small"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
        >
          <MenuItem value="easy">Easy</MenuItem>
          <MenuItem value="normal">Normal</MenuItem>
          <MenuItem value="godlike">Godlike</MenuItem>
        </Select>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320, textAlign: 'center', mt: -1 }}>
        {difficultyHint[difficulty]}
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center">
        <Typography>Length:</Typography>
        <Select
          size="small"
          value={length}
          onChange={(e) => setLength(e.target.value as GameLength)}
        >
          {GAME_LENGTH_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320, textAlign: 'center', mt: -1 }}>
        {GAME_LENGTH_DESCRIPTION[length]}
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button variant="contained" size="large" onClick={start}>
          Start Game
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360, textAlign: 'center' }}>
        {isLoggedIn
          ? 'Best of 10 / First to 10 stats are saved to your Play leaderboards. Classic games are not tracked. AI games are never saved.'
          : 'Log in to save Best of 10 / First to 10 stats to your Play leaderboards. Classic and AI games are never saved.'}
      </Typography>
    </Stack>
      <IdentityDialog open={openIdentity} onClose={() => setOpenIdentity(false)} />
    </>
  );
};

export default PlayCreator;
