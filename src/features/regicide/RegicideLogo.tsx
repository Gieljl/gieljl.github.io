import * as React from "react";

interface Props {
  size?: number;
  sx?: React.CSSProperties;
  className?: string;
}

export const RegicideLogo: React.FC<Props> = ({ size = 40, sx, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    style={sx}
    className={className}
    aria-label="Regicide"
    role="img"
  >
    {/* Crown base band */}
    <rect x="8" y="42" width="48" height="10" rx="2" />
    
    {/* Decorative jewels on band */}
    <circle cx="20" cy="47" r="2.5" fill="#000" fillOpacity="0.3" />
    <circle cx="32" cy="47" r="2.5" fill="#000" fillOpacity="0.3" />
    <circle cx="44" cy="47" r="2.5" fill="#000" fillOpacity="0.3" />
    
    {/* Left prong */}
    <polygon points="8,42 16,14 24,42" />
    <circle cx="16" cy="10" r="4" />
    
    {/* Center prong (tallest) */}
    <polygon points="24,42 32,6 40,42" />
    <circle cx="32" cy="4" r="4.5" />
    
    {/* Right prong */}
    <polygon points="40,42 48,14 56,42" />
    <circle cx="48" cy="10" r="4" />
    
    {/* Base trim */}
    <rect x="8" y="52" width="48" height="4" rx="1" fillOpacity="0.5" />
  </svg>
);

export default RegicideLogo;
