import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

/** A green gas cloud with speed lines — the Reet My Scheet mark. */
export const ScheetLogo: React.FC<Props> = ({ size = 40, sx, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    style={sx}
    className={className}
    aria-label="Reet My Scheet"
    role="img"
  >
    {/* Speed lines */}
    <g stroke="#7f9a1c" strokeWidth="3.5" strokeLinecap="round">
      <line x1="3" y1="30" x2="12" y2="30" />
      <line x1="1" y1="39" x2="10" y2="39" />
      <line x1="4" y1="48" x2="12" y2="48" />
    </g>
    {/* Cloud */}
    <g fill="#b5d335" stroke="#7f9a1c" strokeWidth="2.5">
      <circle cx="25" cy="38" r="11" />
      <circle cx="38" cy="29" r="13" />
      <circle cx="50" cy="40" r="10" />
      <ellipse cx="37" cy="45" rx="19" ry="9" />
    </g>
    {/* Cover the inner outlines so the cloud reads as one shape */}
    <g fill="#b5d335">
      <circle cx="25" cy="38" r="9.6" />
      <circle cx="38" cy="29" r="11.6" />
      <circle cx="50" cy="40" r="8.6" />
      <ellipse cx="37" cy="45" rx="17.6" ry="7.6" />
    </g>
    {/* Stink wisps */}
    <g fill="none" stroke="#f2cf5b" strokeWidth="2.5" strokeLinecap="round">
      <path d="M30 13 q-3 -3 0 -6 q3 -3 0 -6" />
      <path d="M40 12 q-3 -3 0 -6 q3 -3 0 -6" transform="translate(0 2)" />
      <path d="M50 16 q-3 -3 0 -6 q3 -3 0 -6" transform="translate(0 4)" />
    </g>
  </svg>
);

export default ScheetLogo;
