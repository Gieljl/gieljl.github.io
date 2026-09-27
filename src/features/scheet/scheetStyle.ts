import { createTheme } from "@mui/material/styles";

// Fixed "gas cloud" palette: murky browns with a toxic green accent. The
// game renders in its own dark theme regardless of the app's light/dark mode.
export const SCHEET = {
  bg: "#221d14",
  panel: "#2f281b",
  panelLight: "#3d3424",
  border: "#5a4b30",
  green: "#b5d335",
  greenDark: "#7f9a1c",
  yellow: "#f2cf5b",
  cream: "#f4ecd8",
  muted: "#b9ab8c",
  red: "#e5533d",
};

export const HEADING_FONT = '"Space Grotesk", "Roboto", sans-serif';

export const scheetTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: SCHEET.green, contrastText: "#1d1a10" },
    secondary: { main: SCHEET.yellow },
    error: { main: SCHEET.red },
    background: { default: SCHEET.bg, paper: SCHEET.panel },
    text: { primary: SCHEET.cream, secondary: SCHEET.muted },
    divider: SCHEET.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    h4: { fontFamily: HEADING_FONT, fontWeight: 800 },
    h5: { fontFamily: HEADING_FONT, fontWeight: 800 },
    h6: { fontFamily: HEADING_FONT, fontWeight: 700 },
    button: { fontWeight: 700, textTransform: "none" },
  },
});

export function medal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}
