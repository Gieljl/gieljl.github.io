import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

/**
 * The heraldic shield from the second-edition cover: per bend red and blue
 * with a white bend and three gold crowns.
 */
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
    <defs>
      <clipPath id="tkid2-shield">
        <path d="M 12 8 L 52 8 C 53.5 9.5 54 11 54 13 L 54 34 C 54 47 45 54 32 59 C 19 54 10 47 10 34 L 10 13 C 10 11 10.5 9.5 12 8 Z" />
      </clipPath>
    </defs>
    {/* Blue field */}
    <path
      d="M 12 8 L 52 8 C 53.5 9.5 54 11 54 13 L 54 34 C 54 47 45 54 32 59 C 19 54 10 47 10 34 L 10 13 C 10 11 10.5 9.5 12 8 Z"
      fill="#2f4d8a"
    />
    <g clipPath="url(#tkid2-shield)">
      {/* Red half (per bend) with white bend */}
      <path d="M 4 4 L 60 60 L 4 60 Z" fill="#a32c26" />
      <path d="M 2 8 L 58 64 M 8 2 L 64 58" stroke="#f2e8cf" strokeWidth="6" />
      {/* Crowns */}
      {[
        [22, 20],
        [42, 28],
        [26, 42],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`translate(${x}, ${y})`}>
          <path
            d="M -7 4 L -8 -5 L -3.5 -0.5 L 0 -7 L 3.5 -0.5 L 8 -5 L 7 4 Z"
            fill="#e0b44a"
            stroke="#8a6d24"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect x="-7" y="4" width="14" height="3" rx="1" fill="#c8a244" />
        </g>
      ))}
    </g>
    {/* Shield outline */}
    <path
      d="M 12 8 L 52 8 C 53.5 9.5 54 11 54 13 L 54 34 C 54 47 45 54 32 59 C 19 54 10 47 10 34 L 10 13 C 10 11 10.5 9.5 12 8 Z"
      fill="none"
      stroke="#3a2c1a"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  </svg>
);

export default Tkid2Logo;
