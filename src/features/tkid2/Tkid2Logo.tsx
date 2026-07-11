import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

/** A stylised crown for "The King Is Dead" in the game's purple palette. */
export const Tkid2Logo: React.FC<Props> = ({ size = 40, sx, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    style={sx}
    className={className}
    aria-label="The King Is Dead"
    role="img"
  >
    {/* Crown body */}
    <path
      d="M10 44 L8 22 L22 34 L32 16 L42 34 L56 22 L54 44 Z"
      fill="#B07CF3"
      stroke="#5B2E93"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Crown base band */}
    <rect x="10" y="44" width="44" height="8" rx="2" fill="#5B2E93" />
    {/* Jewels */}
    <circle cx="22" cy="34" r="3" fill="#F4C947" />
    <circle cx="32" cy="26" r="3.5" fill="#E84C4C" />
    <circle cx="42" cy="34" r="3" fill="#4FB7BC" />
  </svg>
);

export default Tkid2Logo;
