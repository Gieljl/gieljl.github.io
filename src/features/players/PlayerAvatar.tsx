import { Avatar, Badge} from '@mui/material';
import { deepOrange, deepPurple, indigo, yellow, teal } from '@mui/material/colors';


export type PlayerAvatarProps = {
    id: string; 
    name: string;
    score: number;
  };

export const PlayerAvatar = ({id, name, score }: PlayerAvatarProps) => {
  
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
      children: `${name.slice(0,2)}`,
    };
  }

  let badgecolor: 'default' | 'primary' | 'secondary' | 'error' | 'success' | 'warning' | 'info' = 'primary';

  if (score === 15 || score === 65 || score === 0) {
    badgecolor = 'success';
  } else if (score > 55) {
    badgecolor = 'error';
  } else {
    badgecolor = 'warning';
  }

  return (
    <Badge key={id} showZero badgeContent={score} color={badgecolor}>
        <Avatar {...stringAvatar(name)} />
    </Badge>
  );
}