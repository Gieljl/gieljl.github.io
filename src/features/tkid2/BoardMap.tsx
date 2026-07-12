import * as React from "react";
import {
  FACTIONS,
  Faction,
  RegionId,
  Tkid2State,
  regionName,
} from "./engine/tkid2Engine";
import { CubeRef, cubeKey } from "./selection";
import {
  FACTION_COLOR,
  FONT_BODY,
  FRANCE_COLOR,
  GOLD,
  INK,
  INK_FADED,
  INSTABILITY,
  PARCHMENT,
  REGION_COLOR,
  RUBRIC,
  SEA,
} from "./style";

/** Hand-tuned geometry for the stylised portolan chart of Britain. */
const SHAPES: Record<
  RegionId,
  { path: string; label: [number, number]; cubes: [number, number] }
> = {
  moray: {
    path: "M 210 42 C 255 24 330 20 388 32 C 436 42 456 78 452 118 C 449 146 431 158 400 161 L 205 170 C 172 170 152 142 158 110 C 163 80 182 53 210 42 Z",
    label: [300, 78],
    cubes: [298, 122],
  },
  strathclyde: {
    path: "M 205 170 L 400 161 C 428 160 441 180 437 204 C 434 227 417 240 392 242 L 190 254 C 160 255 144 233 149 208 C 153 187 176 171 205 170 Z",
    label: [293, 196],
    cubes: [293, 226],
  },
  lancaster: {
    path: "M 190 254 L 297 249 L 302 428 L 178 435 C 153 435 141 413 145 388 L 152 292 C 154 270 168 256 190 254 Z",
    label: [228, 283],
    cubes: [226, 338],
  },
  northumbria: {
    path: "M 297 249 L 392 242 C 420 240 444 254 449 280 L 466 388 C 470 413 456 427 432 428 L 302 428 Z",
    label: [374, 283],
    cubes: [376, 340],
  },
  gwynedd: {
    path: "M 178 435 L 254 431 L 257 568 L 192 575 C 150 580 116 561 111 526 C 106 492 126 473 138 458 C 148 444 160 436 178 435 Z",
    label: [184, 462],
    cubes: [184, 512],
  },
  warwick: {
    path: "M 254 431 L 302 428 L 390 430 L 393 550 C 393 562 381 568 366 569 L 257 568 Z",
    label: [322, 456],
    cubes: [322, 505],
  },
  essex: {
    path: "M 390 430 L 432 428 C 456 427 468 434 471 454 L 486 540 C 490 566 476 582 452 586 L 394 592 C 392 578 393 562 393 550 L 390 430 Z",
    label: [436, 466],
    cubes: [432, 518],
  },
  devon: {
    path: "M 257 568 L 366 569 L 394 592 C 390 604 377 640 330 655 C 285 669 205 700 158 685 C 118 672 124 640 155 622 C 188 603 224 585 257 568 Z",
    label: [268, 598],
    cubes: [258, 634],
  },
};

const FRANCE_PATH =
  "M 476 648 C 528 630 598 634 634 654 L 640 786 L 470 786 C 452 748 456 694 476 648 Z";

const CUBE = 19;
const CUBE_GAP = 23;
const CUBES_PER_ROW = 4;
const MAX_VISIBLE_CUBES = 12;

export interface BoardMapProps {
  state: Tkid2State;
  contested: RegionId | null;
  /** Regions the current selection step accepts (clickable + glowing). */
  highlightRegions?: Set<RegionId>;
  /** Cube keys the current selection step accepts. */
  highlightCubes?: Set<string>;
  /** Cubes already picked this selection (drawn with a gold ring). */
  pickedCubes?: CubeRef[];
  onRegionClick?: (id: RegionId) => void;
  onCubeClick?: (cube: CubeRef) => void;
}

function Cube({
  x,
  y,
  faction,
  clickable,
  picked,
  dim,
  onClick,
}: {
  x: number;
  y: number;
  faction: Faction;
  clickable: boolean;
  picked: boolean;
  dim: boolean;
  onClick?: () => void;
}) {
  const c = FACTION_COLOR[faction];
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={
        clickable && onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      style={{ cursor: clickable ? "pointer" : "default" }}
      opacity={dim ? 0.35 : 1}
    >
      {clickable && (
        <rect
          className="tkid2-pulse"
          x={-CUBE / 2 - 3.5}
          y={-CUBE / 2 - 3.5}
          width={CUBE + 7}
          height={CUBE + 7}
          rx={4}
          fill="none"
          stroke="#fffbe8"
          strokeWidth={2.5}
        />
      )}
      <rect
        x={-CUBE / 2}
        y={-CUBE / 2}
        width={CUBE}
        height={CUBE}
        rx={2.5}
        fill={c.main}
        stroke={picked ? GOLD : c.dark}
        strokeWidth={picked ? 3.5 : 1.8}
      />
      {/* light bevel */}
      <path
        d={`M ${-CUBE / 2 + 2.5} ${CUBE / 2 - 3} L ${-CUBE / 2 + 2.5} ${-CUBE / 2 + 2.5} L ${CUBE / 2 - 3} ${-CUBE / 2 + 2.5}`}
        fill="none"
        stroke={c.light}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.9}
      />
    </g>
  );
}

function RegionCubes({
  state,
  regionId,
  highlightCubes,
  pickedCubes,
  onCubeClick,
  anyHighlight,
}: {
  state: Tkid2State;
  regionId: RegionId;
  highlightCubes?: Set<string>;
  pickedCubes?: CubeRef[];
  onCubeClick?: (cube: CubeRef) => void;
  anyHighlight: boolean;
}) {
  const cubes = state.regions[regionId].cubes;
  const list: Faction[] = [];
  for (const f of FACTIONS) {
    for (let i = 0; i < cubes[f]; i++) list.push(f);
  }
  const [cx, cy] = SHAPES[regionId].cubes;
  const visible = list.slice(0, MAX_VISIBLE_CUBES);
  const extra = list.length - visible.length;
  const rows = Math.ceil(visible.length / CUBES_PER_ROW);

  // Track how many cubes of each faction in this region are "picked" so the
  // right number of gold rings is drawn.
  const pickedCount = new Map<string, number>();
  for (const p of pickedCubes ?? []) {
    if (p.regionId !== regionId) continue;
    pickedCount.set(p.faction, (pickedCount.get(p.faction) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  return (
    <g>
      {visible.map((f, i) => {
        const row = Math.floor(i / CUBES_PER_ROW);
        const inRow = Math.min(visible.length - row * CUBES_PER_ROW, CUBES_PER_ROW);
        const col = i % CUBES_PER_ROW;
        const x = cx + (col - (inRow - 1) / 2) * CUBE_GAP;
        const y = cy + (row - (rows - 1) / 2) * CUBE_GAP;
        const key = cubeKey({ regionId, faction: f });
        const idx = seen.get(f) ?? 0;
        seen.set(f, idx + 1);
        const picked = idx < (pickedCount.get(f) ?? 0);
        const clickable = !!highlightCubes?.has(key) && !!onCubeClick;
        return (
          <Cube
            key={`${f}-${i}`}
            x={x}
            y={y}
            faction={f}
            clickable={clickable}
            picked={picked}
            dim={anyHighlight && !clickable && !picked}
            onClick={() => onCubeClick?.({ regionId, faction: f })}
          />
        );
      })}
      {extra > 0 && (
        <text
          x={cx + ((CUBES_PER_ROW - 1) / 2 + 1) * CUBE_GAP}
          y={cy + ((rows - 1) / 2) * CUBE_GAP + 5}
          fontSize={14}
          fontFamily={FONT_BODY}
          fill={INK}
          fontWeight={700}
        >
          +{extra}
        </text>
      )}
    </g>
  );
}

function ControlDisc({ x, y, faction }: { x: number; y: number; faction: Faction }) {
  const c = FACTION_COLOR[faction];
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={13} fill={c.main} stroke={c.dark} strokeWidth={2.5} />
      <circle r={7.5} fill="none" stroke={c.light} strokeWidth={2} opacity={0.9} />
    </g>
  );
}

function InstabilityDisc({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={13} fill={INSTABILITY} stroke="#2b1e12" strokeWidth={2.5} />
      <circle r={7.5} fill="none" stroke="#6d5233" strokeWidth={2} opacity={0.9} />
    </g>
  );
}

function RegionLabel({ regionId, contested }: { regionId: RegionId; contested: boolean }) {
  const [x, y] = SHAPES[regionId].label;
  const name = regionName(regionId);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily={FONT_BODY}
      fontSize={17}
      fontWeight={700}
      fill={INK}
      style={{ paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 4, letterSpacing: 0.5 }}
    >
      <tspan fill={contested ? RUBRIC : RUBRIC}>{name.charAt(0)}</tspan>
      <tspan>{name.slice(1)}</tspan>
    </text>
  );
}

export function BoardMap({
  state,
  contested,
  highlightRegions,
  highlightCubes,
  pickedCubes,
  onRegionClick,
  onCubeClick,
}: BoardMapProps) {
  const anyRegionHighlight = !!highlightRegions && highlightRegions.size > 0;
  const anyCubeHighlight = !!highlightCubes && highlightCubes.size > 0;

  return (
    <svg
      viewBox="0 0 680 800"
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Map of Britain"
    >
      <style>{`
        .tkid2-pulse { animation: tkid2pulse 1.1s ease-in-out infinite; }
        .tkid2-region-glow { animation: tkid2glow 1.2s ease-in-out infinite; }
        @keyframes tkid2pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
        @keyframes tkid2glow { 0%,100% { stroke-opacity: 0.35; } 50% { stroke-opacity: 1; } }
      `}</style>

      {/* Sea */}
      <rect x={0} y={0} width={680} height={800} rx={10} fill={SEA} />
      {/* Portolan rhumb lines */}
      <g stroke={INK_FADED} strokeWidth={0.7} opacity={0.18}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i * Math.PI) / 8;
          const x = 90 + Math.cos(angle) * 900;
          const y = 700 - Math.sin(angle) * 900;
          return <line key={`a${i}`} x1={90} y1={700} x2={x} y2={y} />;
        })}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = Math.PI / 2 + (i * Math.PI) / 8;
          const x = 620 + Math.cos(angle) * 900;
          const y = 120 + Math.sin(angle) * 900;
          return <line key={`b${i}`} x1={620} y1={120} x2={x} y2={y} />;
        })}
      </g>
      <circle cx={90} cy={700} r={26} fill="none" stroke={RUBRIC} strokeWidth={1.4} opacity={0.5} />
      <circle cx={90} cy={700} r={19} fill="none" stroke={INK_FADED} strokeWidth={1} opacity={0.5} />
      <path d="M 90 678 L 95 695 L 90 691 L 85 695 Z" fill={RUBRIC} opacity={0.7} />

      {/* Regions */}
      {(Object.keys(SHAPES) as RegionId[]).map((id) => {
        const shape = SHAPES[id];
        const color = REGION_COLOR[id];
        const region = state.regions[id];
        const isContested = contested === id;
        const highlighted = !!highlightRegions?.has(id);
        const dimRegion = anyRegionHighlight && !highlighted;
        return (
          <g
            key={id}
            onClick={highlighted && onRegionClick ? () => onRegionClick(id) : undefined}
            style={{ cursor: highlighted ? "pointer" : "default" }}
            opacity={dimRegion ? 0.45 : 1}
          >
            <path
              d={shape.path}
              fill={color.fill}
              stroke={color.edge}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {isContested && (
              <path
                d={shape.path}
                fill="none"
                stroke={GOLD}
                strokeWidth={5}
                strokeDasharray="10 7"
                strokeLinejoin="round"
                className="tkid2-region-glow"
              />
            )}
            {highlighted && (
              <path
                d={shape.path}
                fill="rgba(255,251,232,0.25)"
                stroke="#fffbe8"
                strokeWidth={3.5}
                strokeLinejoin="round"
                className="tkid2-region-glow"
              />
            )}
            <RegionLabel regionId={id} contested={isContested} />
            {isContested && (
              <text
                x={shape.label[0]}
                y={shape.label[1] + 16}
                textAnchor="middle"
                fontSize={11.5}
                fontFamily={FONT_BODY}
                fontStyle="italic"
                fill={RUBRIC}
                style={{ paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 3 }}
              >
                ⚔ contested ⚔
              </text>
            )}
            {region.control && (
              <ControlDisc
                x={SHAPES[id].cubes[0]}
                y={SHAPES[id].cubes[1]}
                faction={region.control}
              />
            )}
            {region.unstable && (
              <InstabilityDisc x={SHAPES[id].cubes[0]} y={SHAPES[id].cubes[1]} />
            )}
            <RegionCubes
              state={state}
              regionId={id}
              highlightCubes={highlightCubes}
              pickedCubes={pickedCubes}
              onCubeClick={onCubeClick}
              anyHighlight={anyCubeHighlight}
            />
          </g>
        );
      })}

      {/* France */}
      <g opacity={anyRegionHighlight ? 0.55 : 1}>
        <path
          d={FRANCE_PATH}
          fill={FRANCE_COLOR.fill}
          stroke={FRANCE_COLOR.edge}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <text
          x={552}
          y={680}
          textAnchor="middle"
          fontFamily={FONT_BODY}
          fontSize={17}
          fontWeight={700}
          fill={INK}
          style={{ paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 4 }}
        >
          <tspan fill={RUBRIC}>F</tspan>
          <tspan>rance</tspan>
        </text>
        {Array.from({ length: state.instabilityInFrance }, (_, i) => (
          <InstabilityDisc key={i} x={518 + i * 34} y={718} />
        ))}
        {state.instabilityInFrance === 0 && (
          <text
            x={552}
            y={724}
            textAnchor="middle"
            fontSize={12}
            fontFamily={FONT_BODY}
            fontStyle="italic"
            fill="#26303f"
          >
            invasion!
          </text>
        )}
      </g>

      {/* Supply */}
      <g opacity={anyRegionHighlight || anyCubeHighlight ? 0.55 : 1}>
        <rect
          x={484}
          y={36}
          width={176}
          height={170}
          rx={12}
          fill={PARCHMENT}
          stroke={GOLD}
          strokeWidth={2.5}
        />
        <rect
          x={490}
          y={42}
          width={164}
          height={158}
          rx={9}
          fill="none"
          stroke={RUBRIC}
          strokeWidth={1}
          opacity={0.5}
        />
        <text
          x={572}
          y={68}
          textAnchor="middle"
          fontFamily={FONT_BODY}
          fontSize={16}
          fontWeight={700}
          fill={RUBRIC}
          style={{ letterSpacing: 1.5 }}
        >
          SUPPLY
        </text>
        {FACTIONS.map((f, i) => {
          const c = FACTION_COLOR[f];
          const y = 96 + i * 36;
          return (
            <g key={f}>
              <rect
                x={508}
                y={y - CUBE / 2}
                width={CUBE}
                height={CUBE}
                rx={2.5}
                fill={c.main}
                stroke={c.dark}
                strokeWidth={1.8}
              />
              <text
                x={538}
                y={y + 5.5}
                fontFamily={FONT_BODY}
                fontSize={15}
                fill={INK}
              >
                × {state.supply[f]}
              </text>
              <text
                x={578}
                y={y + 5.5}
                fontFamily={FONT_BODY}
                fontSize={12.5}
                fill={INK_FADED}
                fontStyle="italic"
              >
                {f}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default BoardMap;
