/**
 * Visual constants for The King Is Dead, matching the second-edition
 * rulebook's illuminated-manuscript look: aged parchment, portolan-chart
 * map colours, and the three faction colours (Scottish blue, Welsh red,
 * English yellow).
 */
import { Faction, RegionId } from "./engine/tkid2Engine";

export const PARCHMENT = "#f0e3c0";
export const PARCHMENT_DARK = "#e5d3a5";
export const PARCHMENT_DEEP = "#d9c48e";
export const INK = "#3a2c1a";
export const INK_FADED = "#6b573a";
export const RUBRIC = "#a32c26"; // the red used for headings in the book
export const AZURE = "#2f4d8a"; // the blue of the cover shield
export const GOLD = "#c8a244";
export const CARD_BACK = "#7e2f26";
export const SEA = "#e9dcb4";

export const FACTION_COLOR: Record<Faction, { main: string; dark: string; light: string }> = {
  scottish: { main: "#3d6cb0", dark: "#25457a", light: "#6f97cf" },
  welsh: { main: "#bf3b2b", dark: "#84251a", light: "#d96a55" },
  english: { main: "#e0af2e", dark: "#a37a14", light: "#efcb69" },
};

export const REGION_COLOR: Record<RegionId, { fill: string; edge: string }> = {
  moray: { fill: "#8db3d6", edge: "#4a6f96" },
  strathclyde: { fill: "#d3aa4b", edge: "#96742a" },
  lancaster: { fill: "#79ab8f", edge: "#47755c" },
  northumbria: { fill: "#dfa8b4", edge: "#a56b78" },
  gwynedd: { fill: "#b05446", edge: "#7a3229" },
  warwick: { fill: "#cd7f45", edge: "#95562a" },
  essex: { fill: "#b9c465", edge: "#7f8a3c" },
  devon: { fill: "#8caf5b", edge: "#5d7c37" },
};

export const FRANCE_COLOR = { fill: "#9aa5b5", edge: "#5e6a7d" };

export const INSTABILITY = "#4a3524";
export const NEGOTIATION = "#f6efe2";

/** Font stacks — loaded via @import in index.css, with graceful fallbacks. */
export const FONT_UNCIAL = "'Uncial Antiqua', 'Luminari', 'Palatino', serif";
export const FONT_BODY = "'IM Fell English', 'Iowan Old Style', 'Palatino', Georgia, serif";
