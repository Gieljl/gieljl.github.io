import React, { useState } from 'react';
import { Avatar, Badge, Stack, IconButton, Button, styled, TextField} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { deepOrange, deepPurple, indigo, yellow, teal } from '@mui/material/colors';
import {
  selectPlayers,
  addPlayer,
  removePlayer,
} from './playersSlice';
import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { selectPlayerCount, startGame } from '../game/gameSlice';
import { useSelector } from 'react-redux';
import { RootState } from '../../app/store';
import { stringify } from 'querystring';


export function PlayerList() {
  const Players = useAppSelector(selectPlayers); 
  
  function stringToColor(string: string) {
    let hash = 0;
    let i;
  
    /* eslint-disable no-bitwise */
    for (i = 0; i < string.length; i += 1) {
      hash = string.charCodeAt(i) + ((hash << 5) - hash);
    }
  
    let color = '#';
  
    for (i = 0; i < 3; i += 1) {
      const value = (hash >> (i * 8)) & 0xff;
      color += `00${value.toString(16)}`.slice(-2);
    }
    /* eslint-enable no-bitwise */
  
    return color;
  }
  
  function stringAvatar(name: string) {
    return {
      sx: {
        bgcolor: stringToColor(name),
      },
      children: `${name.split(' ')[0][0]}`,
    };
  }

  const gameStatus = useSelector((state: RootState) => state.game.status)
  const dispatch = useAppDispatch();
  const [playerName, setPlayerName] = useState('');


  return (
    <><Stack direction="row" spacing={1} mt={2} mb={3}>
      {Players.map((player) => (
        <Badge key={player.id} showZero badgeContent={player.score} color="primary">
          <Avatar {...stringAvatar(player.name)} />
        </Badge>
      ))}
    </Stack>
    {gameStatus === 'new' && 
      <TextField
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        required
        label='Name'
        type="text"
        variant="outlined"
        sx={{ mr: 1, mb: 1, height:'50px',  width: '250px'}}
        inputProps={{ inputMode: 'text' }}
      />}
      {gameStatus === 'new' &&
      <Stack direction="row" spacing={1} mt={2} mb={3} >
        <Button
        disabled={playerName.length === 0}
        onClick={() => dispatch(addPlayer(playerName)) && setPlayerName('') }
        variant="outlined"
        sx={{ height:'50px', mr: 1, mb: 1, color: '#7df3e1', outlineColor: '#7df3e1' }}
      >
        Add player
      </Button>
        <Button
          disabled={Players.length < 2}
          variant="outlined"
          onClick={() => dispatch(startGame())}
          sx={{ height:'50px', mt: 1, mr: 1, mb: 1, color: '#7df3e1', outlineColor: '#7df3e1' }}
        >
          Start game
        </Button>

      </Stack>}</>
  );
}