import * as React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { CARD_INFO, CardId, Faction } from "./engine/tkid2Engine";
import {
  CARD_BACK,
  FACTION_COLOR,
  FONT_BODY,
  FONT_UNCIAL,
  GOLD,
  INK,
  PARCHMENT,
  RUBRIC,
} from "./style";

/** Mini cube used in card pictograms. `faction: null` = "any/other" cube. */
function GlyphCube({ x, y, faction, cross }: { x: number; y: number; faction: Faction | null; cross?: boolean }) {
  const fill = faction ? FACTION_COLOR[faction].main : "#cbbd9a";
  const stroke = faction ? FACTION_COLOR[faction].dark : "#857852";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-6} y={-6} width={12} height={12} rx={1.5} fill={fill} stroke={stroke} strokeWidth={1.4} />
      {cross && (
        <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" stroke={RUBRIC} strokeWidth={1.6} strokeLinecap="round" />
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ax = x2 - Math.cos(angle) * 6;
  const ay = y2 - Math.sin(angle) * 6;
  return (
    <g stroke={INK} strokeWidth={1.8} fill={INK} strokeLinecap="round">
      <line x1={x1} y1={y1} x2={ax} y2={ay} />
      <path
        d={`M ${x2} ${y2} L ${x2 - Math.cos(angle - 0.45) * 7} ${y2 - Math.sin(angle - 0.45) * 7} L ${x2 - Math.cos(angle + 0.45) * 7} ${y2 - Math.sin(angle + 0.45) * 7} Z`}
        strokeWidth={0.5}
      />
    </g>
  );
}

function RegionBlob({ x, y, w = 34, h = 18 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={w / 2}
      ry={h / 2}
      fill="none"
      stroke={INK}
      strokeWidth={1.5}
      strokeDasharray="4 3"
      opacity={0.8}
    />
  );
}

/** The little effect schematic drawn in the picture area of each card. */
function CardGlyph({ cardId }: { cardId: CardId }) {
  const inner = (() => {
    switch (cardId) {
      case "scottish-support":
      case "welsh-support":
      case "english-support": {
        const f: Faction =
          cardId === "scottish-support" ? "scottish" : cardId === "welsh-support" ? "welsh" : "english";
        return (
          <>
            <GlyphCube x={30} y={12} faction={f} />
            <GlyphCube x={46} y={12} faction={f} />
            <Arrow x1={38} y1={22} x2={38} y2={38} />
            <RegionBlob x={38} y={46} />
          </>
        );
      }
      case "assemble-1":
      case "assemble-2":
        return (
          <>
            <GlyphCube x={22} y={12} faction="scottish" />
            <GlyphCube x={38} y={12} faction="welsh" />
            <GlyphCube x={54} y={12} faction="english" />
            <Arrow x1={38} y1={22} x2={38} y2={38} />
            <RegionBlob x={38} y={46} />
          </>
        );
      case "negotiate":
        return (
          <>
            <rect x={14} y={14} width={18} height={26} rx={2} fill={PARCHMENT} stroke={INK} strokeWidth={1.5} />
            <rect x={44} y={14} width={18} height={26} rx={2} fill={PARCHMENT} stroke={INK} strokeWidth={1.5} />
            <Arrow x1={33} y1={22} x2={43} y2={22} />
            <Arrow x1={43} y1={32} x2={33} y2={32} />
            <circle cx={53} cy={48} r={5} fill="#fff" stroke={INK} strokeWidth={1.4} />
          </>
        );
      case "manoeuvre":
        return (
          <>
            <GlyphCube x={20} y={16} faction={null} />
            <GlyphCube x={56} y={40} faction={null} />
            <Arrow x1={28} y1={20} x2={48} y2={36} />
            <Arrow x1={48} y1={44} x2={28} y2={24} />
          </>
        );
      case "outmanoeuvre":
        return (
          <>
            <GlyphCube x={16} y={26} faction={null} />
            <GlyphCube x={56} y={16} faction={null} />
            <GlyphCube x={56} y={38} faction={null} />
            <Arrow x1={26} y1={22} x2={44} y2={18} />
            <Arrow x1={44} y1={36} x2={26} y2={31} />
          </>
        );
      case "spy":
        return (
          <>
            <rect x={26} y={8} width={24} height={34} rx={2} fill={PARCHMENT} stroke={INK} strokeWidth={1.5} />
            <text x={38} y={32} textAnchor="middle" fontSize={20} fontFamily={FONT_BODY} fontWeight={700} fill={RUBRIC}>
              ?
            </text>
          </>
        );
      case "ambush":
        return (
          <>
            <GlyphCube x={26} y={10} faction="scottish" />
            <GlyphCube x={42} y={10} faction="scottish" />
            <Arrow x1={34} y1={20} x2={34} y2={34} />
            <RegionBlob x={34} y={42} />
            <Arrow x1={52} y1={42} x2={62} y2={26} />
            <GlyphCube x={64} y={16} faction={null} />
          </>
        );
      case "march":
        return (
          <>
            <GlyphCube x={16} y={20} faction={null} />
            <GlyphCube x={16} y={36} faction={null} />
            <Arrow x1={28} y1={28} x2={48} y2={28} />
            <RegionBlob x={58} y={28} w={26} h={26} />
          </>
        );
      case "plot":
        return (
          <>
            {[22, 38, 54].map((x) => (
              <path
                key={x}
                d={`M ${x - 7} 30 L ${x - 8} 18 L ${x - 3} 24 L ${x} 15 L ${x + 3} 24 L ${x + 8} 18 L ${x + 7} 30 Z`}
                fill={GOLD}
                stroke="#8a6d24"
                strokeWidth={1.2}
              />
            ))}
          </>
        );
      case "aid":
        return (
          <>
            <rect x={22} y={6} width={32} height={16} rx={3} fill="none" stroke={INK} strokeWidth={1.4} />
            <GlyphCube x={31} y={14} faction={null} />
            <GlyphCube x={45} y={14} faction={null} />
            <Arrow x1={38} y1={26} x2={38} y2={38} />
            <RegionBlob x={38} y={46} />
          </>
        );
      case "influence":
        return (
          <>
            <GlyphCube x={16} y={26} faction="english" />
            <GlyphCube x={56} y={16} faction="english" cross />
            <GlyphCube x={56} y={38} faction="english" cross />
            <Arrow x1={26} y1={22} x2={44} y2={18} />
            <Arrow x1={44} y1={36} x2={26} y2={31} />
          </>
        );
      case "dispute":
        return (
          <>
            <GlyphCube x={20} y={22} faction="welsh" />
            <GlyphCube x={56} y={34} faction="welsh" cross />
            <Arrow x1={30} y1={24} x2={46} y2={31} />
            <Arrow x1={46} y1={38} x2={30} y2={30} />
          </>
        );
      case "edict":
        return (
          <>
            <GlyphCube x={16} y={14} faction="scottish" />
            <GlyphCube x={16} y={36} faction="scottish" />
            <GlyphCube x={60} y={14} faction="scottish" cross />
            <GlyphCube x={60} y={36} faction="scottish" cross />
            <Arrow x1={27} y1={20} x2={49} y2={20} />
            <Arrow x1={49} y1={32} x2={27} y2={32} />
          </>
        );
      case "resist":
        return (
          <>
            <GlyphCube x={30} y={12} faction="scottish" cross />
            <GlyphCube x={46} y={12} faction="scottish" cross />
            <Arrow x1={38} y1={22} x2={38} y2={38} />
            <RegionBlob x={38} y={46} />
          </>
        );
      case "quell":
        return (
          <>
            <GlyphCube x={14} y={14} faction="welsh" />
            <Arrow x1={20} y1={22} x2={26} y2={34} />
            <RegionBlob x={38} y={44} />
            <GlyphCube x={52} y={10} faction={null} />
            <GlyphCube x={66} y={10} faction={null} />
            <Arrow x1={58} y1={20} x2={48} y2={36} />
          </>
        );
      case "suppress":
        return (
          <>
            <GlyphCube x={16} y={10} faction="english" />
            <GlyphCube x={32} y={10} faction={null} />
            <Arrow x1={24} y1={20} x2={30} y2={34} />
            <RegionBlob x={40} y={44} />
            <GlyphCube x={62} y={12} faction={null} />
            <Arrow x1={60} y1={22} x2={50} y2={36} />
          </>
        );
      case "muster":
        return (
          <>
            <GlyphCube x={14} y={14} faction="scottish" />
            <Arrow x1={20} y1={22} x2={26} y2={34} />
            <RegionBlob x={38} y={44} />
            <GlyphCube x={52} y={10} faction={null} />
            <GlyphCube x={66} y={10} faction={null} />
            <Arrow x1={58} y1={20} x2={48} y2={36} />
          </>
        );
      default:
        return null;
    }
  })();
  return (
    <svg viewBox="0 0 76 58" style={{ width: "100%", height: "100%" }}>
      {inner}
    </svg>
  );
}

export interface ActionCardViewProps {
  cardId: CardId;
  disabled?: boolean;
  selected?: boolean;
  faceDown?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/**
 * A hand card, styled after the rulebook: parchment face, dark red frame,
 * effect schematic on top and the card's name in a banner below. Cunning
 * cards carry the ✠ marks around their title, as in the printed game.
 */
export function ActionCardView({
  cardId,
  disabled,
  selected,
  faceDown,
  small,
  onClick,
}: ActionCardViewProps) {
  const info = CARD_INFO[cardId];
  const w = small ? 74 : 104;
  const h = small ? 104 : 146;

  if (faceDown) {
    return (
      <Box
        sx={{
          width: w,
          height: h,
          borderRadius: "7px",
          border: `2px solid #4a1812`,
          background: `repeating-linear-gradient(45deg, ${CARD_BACK}, ${CARD_BACK} 7px, #6e2820 7px, #6e2820 14px)`,
          boxShadow: "0 2px 5px rgba(40,20,10,0.4)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <Tooltip title={info.text} arrow enterTouchDelay={350}>
      <Box
        onClick={disabled ? undefined : onClick}
        sx={{
          width: w,
          height: h,
          borderRadius: "7px",
          border: `2.5px solid ${selected ? GOLD : "#5d2019"}`,
          outline: selected ? `2px solid ${GOLD}` : "none",
          background: `linear-gradient(160deg, #f5ecd2 0%, ${PARCHMENT} 55%, #e7d6a8 100%)`,
          boxShadow: selected
            ? `0 0 12px ${GOLD}`
            : "0 2px 5px rgba(40,20,10,0.35)",
          cursor: disabled || !onClick ? "default" : "pointer",
          opacity: disabled ? 0.45 : 1,
          display: "flex",
          flexDirection: "column",
          p: small ? "4px" : "6px",
          transition: "transform 120ms ease, box-shadow 120ms ease",
          "&:hover":
            disabled || !onClick
              ? {}
              : { transform: "translateY(-4px)", boxShadow: "0 6px 14px rgba(40,20,10,0.45)" },
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <Box
          sx={{
            flexGrow: 1,
            border: `1px solid ${CARD_BACK}`,
            borderRadius: "4px",
            background: "rgba(255,252,240,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            mb: "4px",
          }}
        >
          <CardGlyph cardId={cardId} />
        </Box>
        <Box
          sx={{
            background: `linear-gradient(180deg, #fdf6e4, #efe0ba)`,
            border: `1px solid ${CARD_BACK}`,
            borderRadius: "4px",
            px: 0.25,
            py: small ? "1px" : "3px",
            textAlign: "center",
          }}
        >
          <Typography
            sx={{
              fontFamily: FONT_UNCIAL,
              fontSize: small ? "0.5rem" : "0.62rem",
              lineHeight: 1.15,
              color: RUBRIC,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {info.cunning ? `✠ ${info.name} ✠` : info.name}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
}

export default ActionCardView;
