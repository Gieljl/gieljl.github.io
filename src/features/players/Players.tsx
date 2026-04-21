import { AvatarGroup, Stack, Badge, IconButton } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { removePlayer, selectPlayers } from "./playersSlice";
import { Avatar } from "@mui/material";

interface PlayerListProps {
  /** When true, each avatar shows a small delete badge. */
  editable?: boolean;
}

export function PlayerList({ editable = false }: PlayerListProps = {}) {
  const players = useAppSelector(selectPlayers);
  const dispatch = useAppDispatch();

  function stringAvatar(name: string) {
    return {
      children: `${name.slice(0, 2)}`,
    };
  }

  if (editable) {
    return (
      <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1.5}>
        {players.map((player) => (
          <Badge
            key={player.id}
            overlap="circular"
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            badgeContent={
              <IconButton
                size="small"
                aria-label={`remove ${player.name}`}
                onClick={() => dispatch(removePlayer(player.id))}
                sx={{
                  p: 0,
                  color: "error.main",
                  bgcolor: "background.paper",
                  "&:hover": { bgcolor: "background.paper" },
                }}
              >
                <CancelIcon fontSize="small" />
              </IconButton>
            }
          >
            <Avatar
              {...stringAvatar(player.name)}
              variant="circular"
              sx={{
                bgcolor: player.color,
                width: 55,
                height: 55,
                fontSize: "26px",
              }}
            />
          </Badge>
        ))}
      </Stack>
    );
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
