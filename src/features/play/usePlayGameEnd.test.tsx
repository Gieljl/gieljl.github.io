import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';

jest.mock('../../app/hooks', () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

jest.mock('./weightedScore', () => ({
  computePlayWeightedScores: jest.fn(),
}));

jest.mock('./playGameResults', () => ({
  computePlayGameResult: jest.fn(() => ({
    username: 'alice',
    statCounts: { Yasat: 2 },
    longestStreak: 2,
    weightedScore: 12,
    won: true,
  })),
}));

jest.mock('../identity/playerService', () => ({
  savePlayGameResult: jest.fn(() => Promise.resolve()),
  saveFriendsPlayGameResult: jest.fn(() => Promise.resolve()),
}));

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}));

import { usePlayGameEnd } from './usePlayGameEnd';
import { computePlayWeightedScores } from './weightedScore';
import { computePlayGameResult } from './playGameResults';
import { savePlayGameResult } from '../identity/playerService';

const dispatchMock = jest.fn();

function HookHarness() {
  usePlayGameEnd();
  return null;
}

describe('usePlayGameEnd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAppDispatch as jest.Mock).mockReturnValue(dispatchMock);
    (computePlayWeightedScores as jest.Mock).mockReturnValue({ 0: 12, 1: 5 });
    (computePlayGameResult as jest.Mock).mockReturnValue({
      username: 'alice',
      statCounts: { Yasat: 2 },
      longestStreak: 2,
      weightedScore: 12,
      won: true,
    });
    (savePlayGameResult as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves stats when humanId is 0', async () => {
    const state = {
      play: {
        gameOver: false,
        length: 'bo10',
        cumulativeTotals: { 0: 5, 1: 9 },
        playerNames: { 0: 'You', 1: 'Bot' },
        humanId: 0,
        humanUsername: 'alice',
        difficulty: 'normal',
        seating: [0, 1],
        roundHistory: Array.from({ length: 10 }, () => ({ perPlayer: [] })),
        round: null,
        usernameByPlayerId: {},
      },
      playFriends: {
        role: null,
        code: null,
      },
      stats: {
        weights: [],
      },
    };

    (useAppSelector as jest.Mock).mockImplementation((selector: (s: unknown) => unknown) =>
      selector(state),
    );

    render(<HookHarness />);

    await waitFor(() => {
      expect(computePlayGameResult).toHaveBeenCalled();
      expect(savePlayGameResult).toHaveBeenCalledWith(
        'alice',
        'bo10',
        expect.objectContaining({ username: 'alice' }),
        'normal',
      );
    });
  });
});
