import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

/** Three overlapping playing cards in the Flip 7 colour palette. */
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
    {/* Back card — red, rotated left */}
    <rect
      x="6" y="8" width="36" height="50" rx="5" ry="5"
      fill="#E84C4C"
      transform="rotate(-12 24 33)"
    />
    {/* Middle card — teal, rotated right */}
    <rect
      x="6" y="8" width="36" height="50" rx="5" ry="5"
      fill="#4FB7BC"
      transform="rotate(8 24 33)"
    />
    {/* Front card — yellow with navy border */}
    <rect
      x="14" y="7" width="36" height="50" rx="5" ry="5"
      fill="#F4C947"
      stroke="#1B3A8A"
      strokeWidth="2.5"
    />
  </svg>
);

export default Flip7Logo;
