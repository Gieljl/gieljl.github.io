import React from 'react';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';

vi.mock('../../app/hooks', () => ({
  useAppDispatch: vi.fn(),
  useAppSelector: vi.fn(),
}));

vi.mock('./weightedScore', () => ({
  computePlayWeightedScores: vi.fn(),
}));

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}));

import { usePlayGameEnd } from './usePlayGameEnd';
import { computePlayWeightedScores } from './weightedScore';
import { markGameOver } from './playSlice';
import { enqueueSnackbar } from 'notistack';

const dispatchMock = vi.fn();

function HookHarness() {
  usePlayGameEnd();
  return null;
}

function mockState(roundsPlayed: number) {
  const state = {
    play: {
      gameOver: false,
      length: 'bo10',
      cumulativeTotals: { a: 5, b: 9 },
      playerNames: { a: 'You', b: 'Bot' },
      seating: ['a', 'b'],
      roundHistory: Array.from({ length: roundsPlayed }, () => ({ perPlayer: [] })),
    },
    stats: { weights: [] },
  };
  (useAppSelector as Mock).mockImplementation(
    (selector: (s: unknown) => unknown) => selector(state),
  );
}

describe('usePlayGameEnd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAppDispatch as Mock).mockReturnValue(dispatchMock);
    (computePlayWeightedScores as Mock).mockReturnValue({ a: 12, b: 5 });
  });

  it('marks the game over and announces the winner once the length is met', async () => {
    mockState(10);
    render(<HookHarness />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith(markGameOver());
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        expect.stringContaining('Winner: You'),
        expect.anything(),
      );
    });
  });

  it('does nothing before the length is met', () => {
    mockState(3);
    render(<HookHarness />);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
