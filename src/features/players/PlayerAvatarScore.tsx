import { Avatar, Badge } from "@mui/material";

export type PlayerAvatarProps = {
  id: number;
  name: string;
  score: number;
  color: string;
};

export const PlayerAvatar = ({ id, name, score, color }: PlayerAvatarProps) => {

  function stringAvatar(name: string, color: string) {
    return {
      sx: {
        bgcolor: color,
      },
      children: `${name.slice(0, 2)}`,
    };
  }

  let badgecolor:
    | "default"
    | "primary"
    | "secondary"
    | "error"
    | "success"
    | "warning"
    | "info" = "primary";

  if (score === 15 || score === 65 || score === 69 || score === 0) {
    badgecolor = "success";
  } else if (score > 60) {
    badgecolor = "secondary";
  } else {
    badgecolor = "primary";
  }

  return (
    <Badge key={id} showZero badgeContent={score} color={badgecolor}>
      <Avatar {...stringAvatar(name, color)} variant="circular" />
    </Badge>
  );
};
