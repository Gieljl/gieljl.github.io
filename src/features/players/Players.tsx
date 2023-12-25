import { AvatarGroup, Stack } from "@mui/material";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "./playersSlice";
import { selectScores } from "../game/scoreSlice";
import { PlayerAvatar } from "./PlayerAvatar";
import { Avatar, Badge } from "@mui/material";

export function PlayerList() {
  const players = useAppSelector(selectPlayers);

  function stringToColor(string: string) {
    let hash = 0;
    let i;

    /* eslint-disable no-bitwise */
    for (i = 0; i < string.length; i += 1) {
      hash = string.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = "#";

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
      children: `${name.slice(0, 2)}`,
    };
  }

  return (
    <Stack direction="row" >
      <AvatarGroup max={6}>
        {players.map((player) => (
          <Avatar {...stringAvatar(player.name)} variant="circular" />
        ))}
      </AvatarGroup>
    </Stack>
  );
}
