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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useAppDispatch } from '../../app/hooks';
import { goHome, startGame } from '../game/gameSlice';
import { initGame } from './playSlice';
import type { Difficulty } from './ai/botPolicy';

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
  const [yourName, setYourName] = React.useState('You');
  const [numBots, setNumBots] = React.useState(2);
  const [difficulty, setDifficulty] = React.useState<Difficulty>('normal');

  const difficultyHint: Record<Difficulty, string> = {
    easy: 'Easy: bots play simpler and declare Yasat earlier.',
    normal: 'Normal: bots play for weighted stats and better long-term value.',
    godlike: 'Godlike: bots use one-turn lookahead and optimize for weighted stats.',
  };

  const start = () => {
    const picks = shuffled(BOT_NAMES);
    const bots = Array.from({ length: numBots }, (_, i) => ({
      name: picks[i] ?? `Bot${i + 1}`,
      isBot: true,
    }));
    const players = [{ name: yourName.trim() || 'You', isBot: false }, ...bots];
    dispatch(initGame({ players, humanIndex: 0, difficulty }));
    dispatch(startGame());
  };

  return (
    <Stack
      direction="column"
      alignItems="center"
      spacing={3}
      sx={{ width: '100%', pt: 4, pb: 10, maxWidth: 360, mx: 'auto', px: 2 }}
    >
      <Typography variant="h5" color="text.primary">
        Play vs. Bots
      </Typography>

      <TextField
        label="Your name"
        value={yourName}
        onChange={(e) => setYourName(e.target.value)}
        size="small"
        sx={{ width: 220 }}
      />

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

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button variant="outlined" onClick={() => dispatch(goHome())}>
          Back
        </Button>
        <Button variant="contained" size="large" onClick={start}>
          Start Game
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360, textAlign: 'center' }}>
        Local sandbox game vs. bots. Results are not saved, shared, or counted
        towards any ranking.
      </Typography>
    </Stack>
  );
};

export default PlayCreator;
