import React from 'react';
import { Box } from '@mui/material';
import { Card } from './engine/cards';

export interface PlayingCardProps {
  card?: Card;
  /** Face-down back. */
  faceDown?: boolean;
  selected?: boolean;
  /** Draw attention — rendered with an orange ring to mark it as pickable. */
  pickable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { w: 40, h: 57, fs: 13, corner: 11 },
  md: { w: 62, h: 88, fs: 18, corner: 15 },
  lg: { w: 79, h: 114, fs: 22, corner: 18 },
};

const SUIT_PATHS: Record<string, string> = {
  // Modern, slightly rounded/geometric suit silhouettes.
  spades:
    'M12 2 C 7 8, 2 12, 2 16 a 4 4 0 0 0 7 2.8 C 8.6 20, 8 21, 7 22 h 10 c -1 -1 -1.6 -2 -2 -3.2 A 4 4 0 0 0 22 16 c 0 -4 -5 -8 -10 -14 z',
  hearts:
    'M12 21 C 4 14, 2 10, 2 7 a 5 5 0 0 1 10 -1 a 5 5 0 0 1 10 1 c 0 3 -2 7 -10 14 z',
  diamonds:
    'M12 2 L 22 12 L 12 22 L 2 12 Z',
  clubs:
    'M12 2 a 4 4 0 0 1 3.8 5.2 A 4 4 0 1 1 15 14.5 c 0.3 1 1 2 2 3.5 H 7 c 1 -1.5 1.7 -2.5 2 -3.5 a 4 4 0 1 1 -0.8 -7.3 A 4 4 0 0 1 12 2 z',
};

const SuitIcon: React.FC<{ suit: string; size: number; color: string }> = ({ suit, size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
    <path d={SUIT_PATHS[suit]} fill={color} />
  </svg>
);

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  selected = false,
  pickable = false,
  disabled = false,
  onClick,
  size = 'md',
}) => {
  const s = SIZES[size];
  const red = card ? card.suit === 'hearts' || card.suit === 'diamonds' : false;
  const clickable = !!onClick && !disabled;

  const border = selected
    ? '2px solid #7df3e1'
    : pickable
      ? '2px solid #ffb74d'
      : '1px solid #333';
  const boxShadow = selected
    ? '0 0 8px #7df3e1'
    : pickable
      ? '0 0 10px rgba(255, 183, 77, 0.75)'
      : '0 1px 3px rgba(0,0,0,0.4)';

  return (
    <Box
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      aria-label={card ? `${card.rank} of ${card.suit}` : faceDown ? 'face-down card' : 'empty'}
      sx={{
        width: s.w,
        height: s.h,
        borderRadius: 1.2,
        bgcolor: faceDown ? '#0f2e2a' : '#fafafa',
        color: red ? '#c62828' : '#212121',
        border,
        boxShadow,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        fontFamily: '"Space Grotesk", "Inter", "Helvetica Neue", Arial, system-ui, sans-serif',
        fontWeight: 800,
        letterSpacing: '-0.04em',
        fontSize: s.fs,
        cursor: clickable ? 'pointer' : 'default',
        opacity: disabled ? 0.35 : 1,
        transform: selected ? 'translateY(-8px)' : 'none',
        transition: 'transform 120ms, box-shadow 120ms',
        userSelect: 'none',
        flexShrink: 0,
        backgroundImage: faceDown
          ? 'repeating-linear-gradient(45deg, rgba(125,243,225,0.18) 0 6px, rgba(75,205,185,0.28) 6px 12px), linear-gradient(135deg, #0f2e2a 0%, #15463f 100%)'
          : 'none',
      }}
    >
      {card && !faceDown && (
        <>
          <Box
            sx={{
              position: 'absolute',
              top: 3,
              left: 4,
              fontSize: s.corner,
              lineHeight: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1px',
            }}
          >
            <span>{card.rank}</span>
            <SuitIcon suit={card.suit} size={s.corner} color={red ? '#c62828' : '#212121'} />
          </Box>
          <SuitIcon suit={card.suit} size={s.fs * 1.7} color={red ? '#c62828' : '#212121'} />
          <Box
            sx={{
              position: 'absolute',
              bottom: 3,
              right: 4,
              fontSize: s.corner,
              lineHeight: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1px',
              transform: 'rotate(180deg)',
            }}
          >
            <span>{card.rank}</span>
            <SuitIcon suit={card.suit} size={s.corner} color={red ? '#c62828' : '#212121'} />
          </Box>
        </>
      )}
    </Box>
  );
};

export default PlayingCard;
