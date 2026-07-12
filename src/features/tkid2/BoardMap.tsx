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

type Pt = [number, number];

/** Closed polygon → path (straight edges; shared vertices keep borders tight). */
function polyPath(pts: Pt[]): string {
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`;
}

/** Closed polygon → smoothed path (quadratic through edge midpoints). */
function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M ${m0[0]} ${m0[1]}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q ${p[0]} ${p[1]} ${m[0]} ${m[1]}`;
  }
  return d + " Z";
}

/**
 * The coastline of Britain, traced clockwise from the northern tip after the
 * game board's map (ragged sea lochs in the north-west, the Solway and
 * Humber inlets, the East Anglian bulge, Kent, the Cornish peninsula, the
 * Bristol Channel and the Welsh coast).
 */
const ISLAND: Pt[] = [
  [322, 42], [352, 60], [346, 88], [324, 98], [352, 112], [372, 140],
  [388, 168], [380, 198], [354, 210], [336, 216], [368, 232], [398, 252],
  [418, 288], [438, 330], [448, 372], [444, 408], [462, 428], [452, 448],
  [492, 462], [524, 486], [532, 516], [516, 540], [498, 552], [536, 576],
  [548, 600], [524, 622], [476, 634], [430, 642], [386, 650], [344, 658],
  [306, 668], [270, 676], [240, 690], [200, 706], [162, 724], [148, 712],
  [176, 692], [208, 672], [232, 654], [246, 636], [226, 624], [196, 630],
  [166, 644], [154, 626], [176, 608], [192, 588], [182, 560], [162, 544],
  [148, 528], [172, 516], [196, 512], [216, 496], [236, 480], [232, 456],
  [218, 440], [238, 420], [234, 392], [222, 376], [246, 360], [226, 348],
  [204, 352], [188, 336], [212, 322], [232, 312], [222, 288], [206, 292],
  [198, 276], [222, 262], [216, 236], [192, 244], [186, 222], [208, 214],
  [198, 188], [178, 196], [172, 176], [196, 168], [188, 142], [210, 136],
  [204, 108], [228, 104], [224, 76], [252, 74], [262, 50], [290, 52],
  [302, 36],
];

/** The Hebrides, off the north-west coast (part of Moray). */
const ISLES: Pt[][] = [
  [[140, 92], [160, 80], [170, 98], [156, 120], [138, 112]],
  [[150, 150], [168, 136], [178, 152], [166, 178], [148, 172]],
  [[128, 196], [146, 188], [152, 206], [138, 222], [124, 214]],
];

/**
 * Region territories, tiling the island (edges beyond the coast are clipped
 * away by the island silhouette, so only the shared inland borders matter).
 * Shared border vertices are identical between neighbours.
 */
const SHAPES: Record<
  RegionId,
  { poly: Pt[]; label: Pt; angle?: number; cubes: Pt }
> = {
  moray: {
    poly: [
      [95, 25], [330, 15], [430, 60], [415, 186], [330, 212], [250, 240],
      [185, 258], [95, 180],
    ],
    label: [295, 112],
    cubes: [290, 162],
  },
  strathclyde: {
    poly: [
      [185, 258], [250, 240], [330, 212], [415, 186], [445, 210], [430, 262],
      [330, 315], [290, 336], [200, 380], [160, 330],
    ],
    label: [302, 262],
    angle: -12,
    cubes: [300, 297],
  },
  lancaster: {
    poly: [
      [200, 380], [290, 336], [330, 315], [342, 396], [356, 462], [306, 486],
      [240, 476], [200, 474],
    ],
    label: [270, 382],
    angle: -62,
    cubes: [285, 430],
  },
  northumbria: {
    poly: [
      [330, 315], [430, 262], [470, 300], [492, 432], [448, 460], [408, 492],
      [356, 462], [342, 396],
    ],
    label: [404, 350],
    angle: -62,
    cubes: [398, 398],
  },
  gwynedd: {
    poly: [
      [200, 474], [240, 476], [306, 486], [298, 530], [292, 572], [268, 606],
      [240, 646], [130, 660], [120, 500],
    ],
    label: [196, 549],
    angle: -68,
    cubes: [240, 540],
  },
  warwick: {
    poly: [
      [356, 462], [408, 492], [398, 538], [404, 584], [350, 582], [292, 572],
      [298, 530], [306, 486],
    ],
    label: [352, 512],
    angle: -8,
    cubes: [352, 543],
  },
  essex: {
    poly: [
      [408, 492], [448, 460], [492, 432], [560, 470], [580, 560], [560, 640],
      [470, 680], [420, 660], [416, 620], [404, 584], [398, 538],
    ],
    label: [472, 508],
    angle: -15,
    cubes: [476, 550],
  },
  devon: {
    poly: [
      [240, 646], [268, 606], [292, 572], [350, 582], [404, 584], [416, 620],
      [420, 660], [380, 700], [240, 740], [120, 745], [125, 668],
    ],
    label: [246, 666],
    angle: -14,
    cubes: [322, 630],
  },
};

const FRANCE: Pt[] = [
  [560, 656], [620, 636], [676, 668], [676, 796], [520, 796], [508, 744],
  [532, 690],
];

const ISLAND_PATH = smoothClosed(ISLAND);
const FRANCE_PATH = smoothClosed(FRANCE);

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
  const { label, angle } = SHAPES[regionId];
  const name = regionName(regionId);
  return (
    <g transform={`translate(${label[0]}, ${label[1]}) rotate(${angle ?? 0})`}>
      <text
        textAnchor="middle"
        fontFamily={FONT_BODY}
        fontSize={17}
        fontWeight={700}
        fill={INK}
        style={{ paintOrder: "stroke", stroke: PARCHMENT, strokeWidth: 4, letterSpacing: 0.5 }}
      >
        <tspan fill={RUBRIC}>{name.charAt(0)}</tspan>
        <tspan>{name.slice(1)}</tspan>
      </text>
      {contested && (
        <text
          y={15}
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
    </g>
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

      <defs>
        <clipPath id="tkid2-island">
          <path d={ISLAND_PATH} />
          {ISLES.map((isle, i) => (
            <path key={i} d={smoothClosed(isle)} />
          ))}
        </clipPath>
      </defs>

      {/* Sea */}
      <rect x={0} y={0} width={680} height={800} rx={10} fill={SEA} />
      {/* Portolan rhumb lines */}
      <g stroke={INK_FADED} strokeWidth={0.7} opacity={0.18}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i * Math.PI) / 8;
          const x = 90 + Math.cos(angle) * 900;
          const y = 760 - Math.sin(angle) * 900;
          return <line key={`a${i}`} x1={90} y1={760} x2={x} y2={y} />;
        })}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = Math.PI / 2 + (i * Math.PI) / 8;
          const x = 620 + Math.cos(angle) * 900;
          const y = 120 + Math.sin(angle) * 900;
          return <line key={`b${i}`} x1={620} y1={120} x2={x} y2={y} />;
        })}
      </g>
      <circle cx={90} cy={760} r={26} fill="none" stroke={RUBRIC} strokeWidth={1.4} opacity={0.5} />
      <circle cx={90} cy={760} r={19} fill="none" stroke={INK_FADED} strokeWidth={1} opacity={0.5} />
      <path d="M 90 738 L 95 755 L 90 751 L 85 755 Z" fill={RUBRIC} opacity={0.7} />

      {/* Regions (clipped to the island silhouette) */}
      {(Object.keys(SHAPES) as RegionId[]).map((id) => {
        const shape = SHAPES[id];
        const color = REGION_COLOR[id];
        const region = state.regions[id];
        const isContested = contested === id;
        const highlighted = !!highlightRegions?.has(id);
        const dimRegion = anyRegionHighlight && !highlighted;
        const d = polyPath(shape.poly);
        return (
          <g
            key={id}
            onClick={highlighted && onRegionClick ? () => onRegionClick(id) : undefined}
            style={{ cursor: highlighted ? "pointer" : "default" }}
            opacity={dimRegion ? 0.45 : 1}
          >
            <g clipPath="url(#tkid2-island)">
              <path
                d={d}
                fill={color.fill}
                stroke={color.edge}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {isContested && (
                <>
                  <path d={d} fill="rgba(200,162,68,0.18)" />
                  <path
                    d={d}
                    fill="none"
                    stroke={GOLD}
                    strokeWidth={5}
                    strokeDasharray="10 7"
                    strokeLinejoin="round"
                    className="tkid2-region-glow"
                  />
                </>
              )}
              {highlighted && (
                <>
                  <path d={d} fill="rgba(255,251,232,0.3)" />
                  <path
                    d={d}
                    fill="none"
                    stroke="#fffbe8"
                    strokeWidth={3.5}
                    strokeLinejoin="round"
                    className="tkid2-region-glow"
                  />
                </>
              )}
            </g>
            <RegionLabel regionId={id} contested={isContested} />
            {region.control && (
              <ControlDisc x={shape.cubes[0]} y={shape.cubes[1]} faction={region.control} />
            )}
            {region.unstable && <InstabilityDisc x={shape.cubes[0]} y={shape.cubes[1]} />}
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

      {/* Coastline over the region fills */}
      <g pointerEvents="none">
        <path d={ISLAND_PATH} fill="none" stroke={INK} strokeWidth={2.2} opacity={0.75} />
        {ISLES.map((isle, i) => (
          <path
            key={i}
            d={smoothClosed(isle)}
            fill="none"
            stroke={INK}
            strokeWidth={2}
            opacity={0.75}
          />
        ))}
      </g>

      {/* France */}
      <g opacity={anyRegionHighlight ? 0.55 : 1}>
        <path
          d={FRANCE_PATH}
          fill={FRANCE_COLOR.fill}
          stroke={FRANCE_COLOR.edge}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <path d={FRANCE_PATH} fill="none" stroke={INK} strokeWidth={2} opacity={0.6} />
        <text
          x={598}
          y={706}
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
          <InstabilityDisc key={i} x={562 + i * 36} y={744} />
        ))}
        {state.instabilityInFrance === 0 && (
          <text
            x={598}
            y={750}
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
              <text x={538} y={y + 5.5} fontFamily={FONT_BODY} fontSize={15} fill={INK}>
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
