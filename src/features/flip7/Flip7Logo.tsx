import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

/**
 * Stylised "FLIP 7" mark inspired by the rulebook cover: a fan of
 * coloured rays bursting from the upper-left, with a bold yellow
 * numeral outlined in deep navy.
 */
export const Flip7Logo: React.FC<Props> = ({ size = 40, sx, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    style={sx}
    className={className}
    aria-label="Flip 7"
    role="img"
  >
    <g transform="translate(10 10)">
      <polygon points="0,0 14,-2 10,8" fill="#E84C4C" />
      <polygon points="0,0 16,4 8,12" fill="#F2A03B" />
      <polygon points="0,0 14,10 4,14" fill="#F4C947" />
      <polygon points="0,0 10,14 -2,14" fill="#4FB7BC" />
      <polygon points="0,0 2,16 -8,10" fill="#3F6FBF" />
    </g>
    <g
      fill="#F4C947"
      stroke="#1B3A8A"
      strokeWidth="2.5"
      strokeLinejoin="round"
    >
      <polygon points="22,22 58,22 58,30 42,60 30,60 46,30 22,30" />
    </g>
  </svg>
);

export default Flip7Logo;
