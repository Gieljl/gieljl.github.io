import * as React from "react";
import { Box, Typography } from "@mui/material";
import { RegionId, Tkid2State, regionName } from "./engine/tkid2Engine";
import {
  CARD_BACK,
  FONT_BODY,
  GOLD,
  INK,
  NEGOTIATION,
  PARCHMENT,
  REGION_COLOR,
  RUBRIC,
} from "./style";

export interface RegionCardTrackProps {
  state: Tkid2State;
  contested: RegionId | null;
  /** Slot positions that can be clicked right now (Negotiate). */
  highlightSlots?: Set<number>;
  /** Slots already picked during a Negotiate selection. */
  pickedSlots?: number[];
  onSlotClick?: (position: number) => void;
}

/**
 * The eight numbered spaces around the board with their region cards, drawn
 * as a horizontal track. The lowest-numbered face-up card is the region whose
 * power struggle will be resolved next.
 */
export function RegionCardTrack({
  state,
  contested,
  highlightSlots,
  pickedSlots,
  onSlotClick,
}: RegionCardTrackProps) {
  const anyHighlight = !!highlightSlots && highlightSlots.size > 0;
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        overflowX: "auto",
        pb: 0.5,
        px: 0.5,
        justifyContent: { xs: "flex-start", md: "center" },
      }}
    >
      {state.slots.map((slot) => {
        const highlighted = !!highlightSlots?.has(slot.position);
        const picked = !!pickedSlots?.includes(slot.position);
        const isContested = slot.faceUp && slot.regionId === contested;
        const color = REGION_COLOR[slot.regionId];
        return (
          <Box
            key={slot.position}
            data-slot={slot.position}
            data-slot-active={highlighted ? "1" : "0"}
            onClick={highlighted && onSlotClick ? () => onSlotClick(slot.position) : undefined}
            sx={{
              flexShrink: 0,
              width: 76,
              textAlign: "center",
              cursor: highlighted ? "pointer" : "default",
              opacity: anyHighlight && !highlighted && !picked ? 0.45 : 1,
              perspective: "500px",
            }}
          >
            {/* Numbered space */}
            <Typography
              sx={{
                fontFamily: FONT_BODY,
                fontWeight: 700,
                fontSize: "0.8rem",
                color: isContested ? RUBRIC : INK,
              }}
            >
              {slot.position}
              {isContested ? " ⚔" : ""}
            </Typography>
            <Box
              /* Remount when the card here changes (Negotiate swap) or flips
                 face down (struggle resolved), replaying the flip animation —
                 including when stepping through the history view. */
              key={`${slot.regionId}-${slot.faceUp}`}
              sx={{
                height: 96,
                borderRadius: "6px",
                animation: "tkid2cardflip 420ms ease-out",
                "@keyframes tkid2cardflip": {
                  from: { transform: "rotateY(80deg)", opacity: 0.3 },
                  to: { transform: "rotateY(0deg)", opacity: 1 },
                },
                "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                border: `2.5px solid ${
                  picked ? GOLD : isContested ? RUBRIC : highlighted ? "#fffbe8" : "#5d2019"
                }`,
                boxShadow: picked || highlighted ? `0 0 10px ${GOLD}` : "0 2px 4px rgba(40,20,10,0.35)",
                background: slot.faceUp
                  ? `linear-gradient(165deg, #f5ecd2, ${PARCHMENT})`
                  : `repeating-linear-gradient(45deg, ${CARD_BACK}, ${CARD_BACK} 6px, #6e2820 6px, #6e2820 12px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                p: "4px",
                transition: "box-shadow 120ms ease",
              }}
            >
              {slot.faceUp && (
                <>
                  {/* Oval region vignette, like the printed region cards */}
                  <Box
                    sx={{
                      width: 52,
                      height: 58,
                      borderRadius: "50%",
                      border: `2px solid ${GOLD}`,
                      background: `radial-gradient(circle at 42% 36%, ${color.fill}, ${color.edge})`,
                      mb: "4px",
                    }}
                  />
                  <Typography
                    sx={{
                      fontFamily: FONT_BODY,
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      lineHeight: 1,
                      color: INK,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    <Box component="span" sx={{ color: RUBRIC }}>
                      {regionName(slot.regionId).charAt(0)}
                    </Box>
                    {regionName(slot.regionId).slice(1)}
                  </Typography>
                </>
              )}
              {slot.negotiationDisc && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: NEGOTIATION,
                    border: `2px solid #9a8c6d`,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                    animation: "tkid2discpop 360ms cubic-bezier(0.34, 1.5, 0.64, 1)",
                    "@keyframes tkid2discpop": {
                      from: { transform: "scale(0)" },
                      to: { transform: "scale(1)" },
                    },
                    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                  }}
                  title="Negotiation disc"
                />
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export default RegionCardTrack;
