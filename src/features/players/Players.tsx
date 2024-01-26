import { AvatarGroup, Stack } from "@mui/material";
import { useAppSelector } from "../../app/hooks";
import { selectPlayers } from "./playersSlice";
import { Avatar } from "@mui/material";

export function PlayerList() {
  const players = useAppSelector(selectPlayers);

  function stringAvatar(name: string) {
    return {
      children: `${name.slice(0, 2)}`,
    };
  }

  return (
    <Stack direction="row">
      <AvatarGroup max={6}>
        {players.map((player) => (
          <Avatar
            {...stringAvatar(player.name)}
            key={player.id}
            variant="circular"
            sx={{
              bgcolor: player.color,
              width: 55,
              height: 55,
              fontSize: "26px",
            }}
          />
        ))}
      </AvatarGroup>
    </Stack>
  );
}
