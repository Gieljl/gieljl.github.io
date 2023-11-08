import React, { useState } from 'react';
import { Avatar, Badge, Stack, IconButton, Button} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { deepOrange, deepPurple, indigo, yellow, teal } from '@mui/material/colors';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import {
  selectPlayers,
  addPlayer,
  removePlayer,
} from './playersSlice';


export function PlayerList() {
  // const player = useAppSelector(selectPlayers)[0]; 
  // const score = player.score;
  // const playerName = player.name;
  
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

  return (
    <Stack direction="row" spacing={4} mt={2} mb={3}>
      {/* <Badge showZero badgeContent={score} color="primary">
        <Avatar {...stringAvatar(playerName)} />
      </Badge> */}

      <Button variant="contained" color="error">
        New Game
      </Button>
      
    
    {/* <Badge badgeContent={22} color="primary">
      <Avatar sx={{ bgcolor: deepOrange[500] }}>P2</Avatar>
    </Badge>
    <Badge badgeContent={22} color="primary">
      <Avatar sx={{ bgcolor: yellow[500] }}>P3</Avatar>
    </Badge>
    <Badge badgeContent={65} color="success">
      <Avatar sx={{ bgcolor: deepPurple[500] }}>P4</Avatar>
    </Badge>
    <Badge badgeContent={99} color="error">
    < Avatar sx={{ bgcolor: indigo[500] }}>P5</Avatar>
    </Badge> */}
  </Stack>
  );
}