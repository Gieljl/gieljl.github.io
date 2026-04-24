/**
 * Subtle round counter + game length mode indicator. Rendered below the
 * player list in ranked/unranked ranking, play table, and play stats views.
 */
import { Box, Typography } from '@mui/material';
import { GameLength, GAME_LENGTH_OPTIONS } from './gameLength';

interface GameProgressIndicatorProps {
  roundsPlayed: number;
  length: GameLength;
}

export function GameProgressIndicator({
  roundsPlayed,
  length,
}: GameProgressIndicatorProps) {
  const modeLabel =
    GAME_LENGTH_OPTIONS.find((o) => o.value === length)?.label ?? 'Classic';
  const roundLabel =
    length === 'bo10'
      ? `Round ${Math.min(roundsPlayed + 1, 10)} / 10`
      : `Round ${roundsPlayed + 1}`;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 1,
        opacity: 0.6,
        mt: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {roundLabel}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        •
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {modeLabel}
      </Typography>
    </Box>
  );
}

export default GameProgressIndicator;
