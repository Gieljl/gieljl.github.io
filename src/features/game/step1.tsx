import { TextField } from '@mui/material';
import React, { useState } from 'react';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import {
  decrement,
  increment,
  incrementByAmount,
  incrementIfOdd,
  selectPlayerCount,
} from './gameSlice';
import styles from './newgame.module.css';




export default function Step1() {
  const playerCount = useAppSelector(selectPlayerCount);
  const dispatch = useAppDispatch();

  return (
    <>
    
    <TextField
        value={playerCount}
        onChange={(e) => dispatch(incrementByAmount(Number(e.target.value)))}
        required
        id="numberofPlayers"
        label='Number of players'
        type="number"
        variant="outlined"
        sx={{ mt: 1, mr: 1, mb: 1 }}
        inputProps={{ inputMode: 'numeric' }} />
    
    <div className={styles.row}>
      <button
        className={styles.button}
        aria-label="Decrement value"
        onClick={() => dispatch(decrement())}
      >
        -
      </button>
      <button
        className={styles.button}
        aria-label="Increment value"
        onClick={() => dispatch(increment())}
      >
        +
      </button>
    </div>
    
    </>
    
  );
}
