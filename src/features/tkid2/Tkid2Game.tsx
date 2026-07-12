import * as React from "react";
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slide,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { TransitionProps } from "@mui/material/transitions";
import { Tkid2Logo } from "./Tkid2Logo";
import { Difficulty } from "./ai/botPolicy";
import { useTkid2BotDriver } from "./useTkid2BotDriver";
import {
  CARD_INFO,
  CardId,
  CardParams,
  FACTIONS,
  FACTION_LABEL,
  Faction,
  FactionCounts,
  PlayerId,
  Tkid2Action,
  Tkid2Event,
  Tkid2Player,
  Tkid2State,
  applyAction,
  contestedRegionId,
  controlledCounts,
  currentPlayer,
  enumerateCardParams,
  gameResult,
  isGameOver,
  newGame,
  regionName,
  setCount,
  summonOptions,
} from "./engine/tkid2Engine";
import {
  CubeRef,
  Selection,
  cubeKey,
  finalParams,
  getTargets,
  pickCube,
  pickRegion,
  pickSlot,
  pickVariant,
  startSelection,
} from "./selection";
import { BoardMap } from "./BoardMap";
import { RegionCardTrack } from "./RegionCardTrack";
import { ActionCardView } from "./ActionCardView";
import {
  CARD_BACK,
  FACTION_COLOR,
  FONT_BODY,
  FONT_UNCIAL,
  GOLD,
  INK,
  INK_FADED,
  INSTABILITY,
  PARCHMENT,
  PARCHMENT_DARK,
  RUBRIC,
} from "./style";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const HUMAN_ID = "human";

// ===========================================================================
// Small shared pieces
// ===========================================================================

function FactionCube({ faction, size = 15 }: { faction: Faction; size?: number }) {
  const c = FACTION_COLOR[faction];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "3px",
        background: `linear-gradient(145deg, ${c.light}, ${c.main} 60%)`,
        border: `1.5px solid ${c.dark}`,
        verticalAlign: "middle",
      }}
    />
  );
}

function CourtCubes({ court }: { court: FactionCounts }) {
  return (
    <Stack direction="row" spacing={1.2} alignItems="center">
      {FACTIONS.map((f) => (
        <Stack key={f} direction="row" spacing={0.4} alignItems="center">
          <FactionCube faction={f} />
          <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.85rem", color: INK }}>
            {court[f]}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ParchmentPanel({
  children,
  sx,
}: {
  children: React.ReactNode;
  sx?: object;
}) {
  return (
    <Box
      sx={{
        borderRadius: "8px",
        border: `2px solid ${CARD_BACK}`,
        outline: `1px solid ${GOLD}`,
        outlineOffset: "-5px",
        background: `linear-gradient(165deg, #f6eed6, ${PARCHMENT} 60%, ${PARCHMENT_DARK})`,
        p: 1.5,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function UncialHeading({ children, size = "1rem" }: { children: React.ReactNode; size?: string }) {
  return (
    <Typography
      sx={{
        fontFamily: FONT_UNCIAL,
        fontSize: size,
        color: RUBRIC,
        letterSpacing: 0.5,
        lineHeight: 1.2,
      }}
    >
      {children}
    </Typography>
  );
}

// ===========================================================================
// Setup screen
// ===========================================================================

interface SetupResult {
  botCount: number;
  difficulty: Difficulty;
  advanced: boolean;
}

function SetupScreen({ onStart }: { onStart: (r: SetupResult) => void }) {
  const [botCount, setBotCount] = React.useState(2);
  const [difficulty, setDifficulty] = React.useState<Difficulty>("normal");
  const [advanced, setAdvanced] = React.useState(false);

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 520, mx: "auto", mt: 2, pb: 4 }}>
      <Box sx={{ textAlign: "center" }}>
        <Tkid2Logo size={84} />
        <Typography sx={{ fontFamily: FONT_UNCIAL, fontSize: "1.9rem", color: RUBRIC, mt: 1 }}>
          The King is Dead
        </Typography>
        <Typography sx={{ fontFamily: FONT_BODY, fontStyle: "italic", color: INK_FADED }}>
          Second Edition · after Peer Sylvester
        </Typography>
      </Box>

      <ParchmentPanel>
        <Typography sx={{ fontFamily: FONT_BODY, color: INK, fontSize: "0.95rem" }}>
          The king is dead and the kingdom is divided. Three factions — the{" "}
          <b>Scottish</b>, the <b>Welsh</b>, and the <b>English</b> — vie for control
          of eight regions of Britain. Play your eight action cards to steer each
          power struggle, and summon followers to your court so the victorious
          faction crowns <i>you</i>. But beware: too much instability, and the
          French will invade…
        </Typography>
      </ParchmentPanel>

      <ParchmentPanel>
        <Stack spacing={2}>
          <Box>
            <UncialHeading>Opponents</UncialHeading>
            <ToggleButtonGroup
              exclusive
              value={botCount}
              onChange={(_, v) => v && setBotCount(v)}
              sx={{ mt: 0.5 }}
            >
              <ToggleButton value={1}>1 AI</ToggleButton>
              <ToggleButton value={2}>2 AI</ToggleButton>
              <ToggleButton value={3}>3 AI</ToggleButton>
            </ToggleButtonGroup>
            {botCount === 3 && (
              <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.8rem", color: INK_FADED, mt: 0.5 }}>
                Four players play in teams of two — the AI sitting opposite you is
                your ally.
              </Typography>
            )}
          </Box>
          <Box>
            <UncialHeading>Difficulty</UncialHeading>
            <ToggleButtonGroup
              exclusive
              value={difficulty}
              onChange={(_, v) => v && setDifficulty(v)}
              sx={{ mt: 0.5 }}
            >
              <ToggleButton value="easy">Easy</ToggleButton>
              <ToggleButton value="normal">Normal</ToggleButton>
              <ToggleButton value="godlike">Godlike</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <UncialHeading>Rules</UncialHeading>
            <ToggleButtonGroup
              exclusive
              value={advanced}
              onChange={(_, v) => v !== null && setAdvanced(v)}
              sx={{ mt: 0.5 }}
            >
              <ToggleButton value={false}>Basic game</ToggleButton>
              <ToggleButton value={true}>Advanced (cunning cards)</ToggleButton>
            </ToggleButtonGroup>
            <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.8rem", color: INK_FADED, mt: 0.5 }}>
              Advanced: the three Support cards are replaced by three secret
              cunning action cards, dealt to each player.
            </Typography>
          </Box>
        </Stack>
      </ParchmentPanel>

      <Button
        size="large"
        onClick={() => onStart({ botCount, difficulty, advanced })}
        sx={{
          fontFamily: FONT_UNCIAL,
          fontSize: "1.1rem",
          color: "#fdf3d8",
          background: `linear-gradient(180deg, #a13c30, ${CARD_BACK})`,
          border: `2px solid #4a1812`,
          "&:hover": { background: `linear-gradient(180deg, #b04b3e, #8e3a2e)` },
          py: 1.2,
        }}
      >
        Begin the Struggle
      </Button>
    </Stack>
  );
}

// ===========================================================================
// Player panels & chronicle
// ===========================================================================

function PlayerPanel({
  state,
  player,
  isTeammate,
}: {
  state: Tkid2State;
  player: Tkid2Player;
  isTeammate: boolean;
}) {
  const onTurn = !isGameOver(state) && currentPlayer(state).id === player.id;
  const topDiscard = player.discard[player.discard.length - 1];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        borderRadius: "6px",
        border: `2px solid ${onTurn ? GOLD : "#c5ad7c"}`,
        boxShadow: onTurn ? `0 0 8px ${GOLD}` : "none",
        background: "rgba(255,252,240,0.5)",
        px: 1,
        py: 0.6,
      }}
    >
      {player.isBot ? (
        <SmartToyIcon sx={{ fontSize: 18, color: INK_FADED }} />
      ) : (
        <PersonIcon sx={{ fontSize: 18, color: INK_FADED }} />
      )}
      <Box sx={{ minWidth: 76 }}>
        <Typography sx={{ fontFamily: FONT_BODY, fontWeight: 700, fontSize: "0.9rem", color: INK, lineHeight: 1.1 }}>
          {player.name}
          {isTeammate ? " ♥" : ""}
        </Typography>
        <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.72rem", color: INK_FADED }}>
          {player.hand.length} card{player.hand.length === 1 ? "" : "s"} · sets {setCount(player.court)}
        </Typography>
      </Box>
      <CourtCubes court={player.court} />
      <Box sx={{ flexGrow: 1 }} />
      {topDiscard ? (
        <Tooltip title={`Last played: ${CARD_INFO[topDiscard].name}`}>
          <Box>
            <ActionCardView cardId={topDiscard} small />
          </Box>
        </Tooltip>
      ) : (
        <Box sx={{ width: 74 }} />
      )}
    </Box>
  );
}

function describeEvents(events: Tkid2Event[], state: Tkid2State): string[] {
  const name = (id: PlayerId) => state.players.find((p) => p.id === id)?.name ?? id;
  const lines: string[] = [];
  for (const e of events) {
    switch (e.kind) {
      case "played":
        lines.push(
          e.viaSpy
            ? `${name(e.playerId)} copied ${CARD_INFO[e.cardId].name} with Spy.`
            : `${name(e.playerId)} played ${CARD_INFO[e.cardId].name}.`,
        );
        break;
      case "summoned":
        lines.push(
          `${name(e.playerId)} summoned a ${FACTION_LABEL[e.faction]} follower from ${regionName(e.regionId)}.`,
        );
        break;
      case "summonSkipped":
        lines.push(`${name(e.playerId)} could not summon a follower.`);
        break;
      case "passed":
        lines.push(`${name(e.playerId)} passed.`);
        break;
      case "struggle":
        lines.push(
          e.record.outcome === "unstable"
            ? `⚑ ${regionName(e.record.regionId)} fell into instability!`
            : `⚑ The ${FACTION_LABEL[e.record.outcome]} took control of ${regionName(e.record.regionId)}.`,
        );
        break;
      case "invasion":
        lines.push("⚜ The French invade Britain — the game ends!");
        break;
      case "coronation":
        lines.push("♔ Every region is decided — a new ruler is crowned!");
        break;
    }
  }
  return lines;
}

// ===========================================================================
// AI turn overlay
// ===========================================================================

/** What the last AI action looked like, for the turn overlay. */
interface BotFeed {
  playerId: PlayerId;
  name: string;
  /** Card played, or null for a pass. */
  cardId: CardId | null;
  lines: string[];
  ts: number;
}

function ThinkingDots() {
  return (
    <Box component="span" sx={{ display: "inline-flex", gap: "3px", ml: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: RUBRIC,
            animation: "tkid2dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </Box>
  );
}

function BotTurnOverlay({
  feed,
  thinking,
}: {
  feed: BotFeed | null;
  thinking: Tkid2Player | null;
}) {
  if (!feed && !thinking) return null;
  return (
    <Box
      sx={{
        position: "fixed",
        top: 78,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 40,
        pointerEvents: "none",
        width: "min(94vw, 460px)",
      }}
    >
      <Box
        key={feed ? `feed-${feed.ts}` : `think-${thinking?.id}`}
        sx={{
          borderRadius: "8px",
          border: `2px solid ${CARD_BACK}`,
          outline: `1px solid ${GOLD}`,
          outlineOffset: "-5px",
          background: `linear-gradient(165deg, #f6eed6, ${PARCHMENT} 60%, ${PARCHMENT_DARK})`,
          boxShadow: "0 10px 28px rgba(40,20,10,0.5)",
          px: 2,
          py: 1.2,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          animation: "tkid2overlayin 240ms ease-out",
        }}
      >
        {feed ? (
          <>
            {feed.cardId ? (
              <ActionCardView cardId={feed.cardId} small />
            ) : (
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  border: `2px solid ${INK_FADED}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FONT_UNCIAL,
                  color: INK_FADED,
                  fontSize: "0.9rem",
                  flexShrink: 0,
                }}
              >
                ✋
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: FONT_UNCIAL, color: RUBRIC, fontSize: "0.95rem" }}>
                {feed.cardId
                  ? `${feed.name} plays ${CARD_INFO[feed.cardId].name}`
                  : `${feed.name} passes`}
              </Typography>
              {feed.lines.slice(1).map((line, i) => (
                <Typography
                  key={`${i}-${line}`}
                  sx={{ fontFamily: FONT_BODY, color: INK, fontSize: "0.82rem", lineHeight: 1.35 }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          </>
        ) : (
          thinking && (
            <>
              <SmartToyIcon sx={{ color: INK_FADED }} />
              <Typography
                sx={{
                  fontFamily: FONT_UNCIAL,
                  color: RUBRIC,
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {thinking.name} is pondering their move
                <ThinkingDots />
              </Typography>
            </>
          )
        )}
      </Box>
    </Box>
  );
}

// ===========================================================================
// Game over
// ===========================================================================

function GameOverPanel({ state, onAgain }: { state: Tkid2State; onAgain: () => void }) {
  const result = gameResult(state);
  if (!result) return null;
  const invasion = result.ending === "invasion";
  const ranked = [...result.results].sort(
    (a, b) => Number(b.winner) - Number(a.winner) || b.score - a.score || b.secondary - a.secondary,
  );
  return (
    <ParchmentPanel sx={{ textAlign: "center" }}>
      <UncialHeading size="1.5rem">{invasion ? "Invasion" : "Coronation"}</UncialHeading>
      <Typography sx={{ fontFamily: FONT_BODY, fontStyle: "italic", color: INK_FADED, mb: 1 }}>
        {invasion
          ? "The French invade Britain. The leader who can unite the factions will claim the throne."
          : "The struggle for power comes to an end, and a new monarch is crowned."}
      </Typography>

      {!invasion && (
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 1.5 }}>
          {result.standings.map((s, i) => (
            <Stack key={s.faction} alignItems="center" spacing={0.3}>
              <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.75rem", color: INK_FADED }}>
                {i + 1}
              </Typography>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: FACTION_COLOR[s.faction].main,
                  border: `3px solid ${FACTION_COLOR[s.faction].dark}`,
                }}
              />
              <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.75rem", color: INK }}>
                {FACTION_LABEL[s.faction]} · {s.regions}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      <Stack spacing={0.6} sx={{ maxWidth: 420, mx: "auto" }}>
        {ranked.map((r) => (
          <Stack key={r.playerId} direction="row" spacing={1} alignItems="center">
            <Typography sx={{ width: 26, fontSize: "1.1rem" }}>{r.winner ? "♔" : ""}</Typography>
            <Typography
              sx={{
                fontFamily: FONT_BODY,
                fontWeight: r.winner ? 700 : 400,
                color: INK,
                flexGrow: 1,
                textAlign: "left",
              }}
            >
              {r.name}
              {r.plot ? " (Plot)" : ""}
            </Typography>
            <Typography sx={{ fontFamily: FONT_BODY, color: INK }}>
              {invasion
                ? `${r.score} set${r.score === 1 ? "" : "s"}`
                : `${r.score} ${FACTION_LABEL[result.standings[0].faction]}`}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {result.teams && (
        <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.8rem", color: INK_FADED, mt: 1 }}>
          Teammates share the victory — the uncrowned ally becomes the power behind the throne.
        </Typography>
      )}
      <Button
        onClick={onAgain}
        sx={{
          mt: 1.5,
          fontFamily: FONT_UNCIAL,
          color: "#fdf3d8",
          background: `linear-gradient(180deg, #a13c30, ${CARD_BACK})`,
          px: 3,
          "&:hover": { background: "#8e3a2e" },
        }}
      >
        Play again
      </Button>
    </ParchmentPanel>
  );
}

// ===========================================================================
// Rules dialog
// ===========================================================================

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontFamily: FONT_UNCIAL, color: RUBRIC }}>
        How to play
      </DialogTitle>
      <DialogContent dividers sx={{ fontFamily: FONT_BODY }}>
        <Typography variant="body2" paragraph>
          On your turn, either <b>take an action</b> (play one of your eight
          single-use action cards and resolve its effect) or <b>pass</b>. After
          taking an action you <b>must summon a follower</b>: take any one
          follower cube from any region into your court.
        </Typography>
        <Typography variant="body2" paragraph>
          When all players pass in sequence, a <b>power struggle</b> is resolved
          in the contested region — the region card in the lowest-numbered space
          that is still face up. The faction with the most followers there takes
          control (its control disc is placed), and all followers in the region
          return to the supply. A tie — or an empty region — makes the region{" "}
          <b>unstable</b>, and an instability disc moves there from France.
        </Typography>
        <Typography variant="body2" paragraph>
          You can never place or move followers into regions that already have a
          control or instability disc.
        </Typography>
        <Typography variant="body2" paragraph>
          <b>The game ends</b> when the third instability disc reaches the board
          (a <b>French invasion</b>: the player with the most complete sets of
          followers — one of each faction — wins) or when all eight regions are
          decided (a <b>coronation</b>: the player with the most followers of
          the most powerful faction in court wins; the most powerful faction is
          the one controlling the most regions, ties broken by the most recent
          power-struggle win).
        </Typography>
        <Typography variant="body2" paragraph>
          Followers in your court crown you — but every follower you summon is
          one fewer fighting for that faction on the board.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Hover or long-press any card to read its exact effect. In the advanced
          game the three Support cards are replaced by three secret cunning
          action cards.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ===========================================================================
// Root component
// ===========================================================================

export function Tkid2Game({ onExit }: { onExit: () => void }) {
  const [state, setState] = React.useState<Tkid2State | null>(null);
  const [config, setConfig] = React.useState<SetupResult | null>(null);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [log, setLog] = React.useState<string[]>([]);
  const [showHelp, setShowHelp] = React.useState(false);
  const [spyOpen, setSpyOpen] = React.useState(false);
  const [confirmNoEffect, setConfirmNoEffect] = React.useState<CardId | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [botFeed, setBotFeed] = React.useState<BotFeed | null>(null);

  const stateRef = React.useRef(state);
  stateRef.current = state;

  const applyLocal = React.useCallback((action: Tkid2Action) => {
    const prev = stateRef.current;
    if (!prev) return;
    const actor = currentPlayer(prev);
    const res = applyAction(prev, action);
    if (res.error) {
      setNotice(res.error);
      return;
    }
    setState(res.state);
    const lines = describeEvents(res.events, prev);
    setLog((l) => [...lines.slice().reverse(), ...l].slice(0, 24));
    // Feed the AI-turn overlay: a play or pass starts a new entry, the
    // follow-up summon is appended to it.
    if (actor.isBot) {
      if (action.type === "play") {
        setBotFeed({ playerId: actor.id, name: actor.name, cardId: action.cardId, lines, ts: Date.now() });
      } else if (action.type === "pass") {
        setBotFeed({ playerId: actor.id, name: actor.name, cardId: null, lines, ts: Date.now() });
      } else {
        setBotFeed((f) =>
          f && f.playerId === actor.id
            ? { ...f, lines: [...f.lines, ...lines], ts: Date.now() }
            : f,
        );
      }
    } else {
      setBotFeed(null);
    }
  }, []);

  // The overlay lingers on an AI's finished move, then fades away.
  React.useEffect(() => {
    if (!botFeed) return;
    const t = setTimeout(() => setBotFeed(null), 1800);
    return () => clearTimeout(t);
  }, [botFeed]);

  const start = (r: SetupResult) => {
    const players = [
      { id: HUMAN_ID, name: "You", isBot: false },
      ...Array.from({ length: r.botCount }, (_, i) => ({
        id: `bot-${i + 1}`,
        name: r.botCount === 1 ? "AI" : `AI ${i + 1}`,
        isBot: true,
      })),
    ];
    const seed = Date.now() & 0x7fffffff;
    setState(newGame(players, seed, { advanced: r.advanced }));
    setConfig(r);
    setSelection(null);
    setLog([]);
  };

  const reset = () => {
    setState(null);
    setConfig(null);
    setSelection(null);
    setLog([]);
  };

  // Auto-clear notices.
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const botIds = React.useMemo(
    () => state?.players.filter((p) => p.isBot).map((p) => p.id) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state?.players.length],
  );
  const difficultyById = React.useMemo(() => {
    const map: Record<string, Difficulty> = {};
    if (config) for (const id of botIds) map[id] = config.difficulty;
    return map;
  }, [botIds, config]);

  useTkid2BotDriver({
    state,
    botIds,
    difficultyById,
    onAction: applyLocal,
    enabled: !showHelp,
  });

  const gameOver = state !== null && isGameOver(state);
  const contested = state ? contestedRegionId(state) : null;
  const human = state?.players.find((p) => p.id === HUMAN_ID);
  const humanTurn =
    !!state && !gameOver && currentPlayer(state).id === HUMAN_ID;
  const humanSummon = humanTurn && !!state && state.pendingSummon;

  const targets = React.useMemo(
    () => (selection ? getTargets(selection) : null),
    [selection],
  );

  // Dispatch a completed selection.
  React.useEffect(() => {
    if (selection && targets?.done) {
      applyLocal({
        type: "play",
        cardId: selection.cardId,
        params: finalParams(selection, targets.done),
      });
      setSelection(null);
    }
  }, [selection, targets, applyLocal]);

  const highlightRegions = React.useMemo(() => {
    if (selection && targets?.regions) return new Set(targets.regions);
    return undefined;
  }, [selection, targets]);

  const highlightCubes = React.useMemo(() => {
    if (selection && targets?.cubes) return new Set(targets.cubes.map(cubeKey));
    if (humanSummon && state) return new Set(summonOptions(state).map(cubeKey));
    return undefined;
  }, [selection, targets, humanSummon, state]);

  const highlightSlots = React.useMemo(() => {
    if (selection && targets?.slots) return new Set(targets.slots);
    return undefined;
  }, [selection, targets]);

  const onCardClick = (cardId: CardId) => {
    if (!state || !humanTurn || state.pendingSummon || selection) return;
    if (cardId === "plot") {
      setNotice("Plot cannot be taken during the game — it is revealed when the winner is decided.");
      return;
    }
    if (cardId === "spy") {
      const opts = enumerateCardParams(state, "spy");
      if (opts.length === 0) {
        setConfirmNoEffect("spy");
      } else {
        setSpyOpen(true);
      }
      return;
    }
    const opts = enumerateCardParams(state, cardId);
    if (opts.length === 0) {
      setConfirmNoEffect(cardId);
    } else {
      setSelection(startSelection(cardId, opts));
    }
  };

  const onRegionClick = (regionId: Parameters<typeof pickRegion>[1]) => {
    if (selection) setSelection((s) => (s ? pickRegion(s, regionId) : s));
  };

  const onCubeClick = (cube: CubeRef) => {
    if (!state || !humanTurn) return;
    if (selection) {
      setSelection((s) => (s ? pickCube(s, cube) : s));
      return;
    }
    if (humanSummon) {
      applyLocal({ type: "summon", regionId: cube.regionId, faction: cube.faction });
    }
  };

  const onSlotClick = (position: number) => {
    if (selection) setSelection((s) => (s ? pickSlot(s, position) : s));
  };

  const spyGroups = React.useMemo(() => {
    if (!state || !spyOpen) return [];
    const opts = enumerateCardParams(state, "spy");
    const map = new Map<PlayerId, CardParams[]>();
    for (const o of opts) {
      if (!o.spyPlayerId) continue;
      const list = map.get(o.spyPlayerId) ?? [];
      list.push(o.spyParams ?? {});
      map.set(o.spyPlayerId, list);
    }
    return Array.from(map.entries()).map(([playerId, inner]) => {
      const target = state.players.find((p) => p.id === playerId)!;
      return { playerId, name: target.name, top: target.discard[target.discard.length - 1], inner };
    });
  }, [state, spyOpen]);

  const counts = state ? controlledCounts(state) : null;

  // ------------------------------------------------------------------
  // Prompt banner content
  // ------------------------------------------------------------------
  let prompt: string | null = null;
  if (state && !gameOver) {
    if (selection && targets && !targets.done) prompt = targets.prompt;
    else if (humanSummon) prompt = "Summon a follower to your court — tap any follower on the map.";
    else if (humanTurn) prompt = "Your turn — play a card or pass.";
    else prompt = `Waiting for ${currentPlayer(state).name}…`;
  }

  const thinkingBot =
    state && !gameOver && !botFeed && currentPlayer(state).isBot
      ? currentPlayer(state)
      : null;

  return (
    <Dialog fullScreen open onClose={onExit} TransitionComponent={Transition as any}>
      <style>{`
        @keyframes tkid2overlayin {
          from { opacity: 0; transform: translateY(-14px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tkid2dot {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
      <AppBar
        sx={{
          position: "relative",
          background: `linear-gradient(180deg, #8e3a2e, ${CARD_BACK})`,
          borderBottom: `3px solid ${GOLD}`,
        }}
      >
        <Toolbar>
          <Tkid2Logo size={34} sx={{ marginRight: 10 }} />
          <Typography
            sx={{ flex: 1, color: "#fdf3d8", fontFamily: FONT_UNCIAL, fontSize: "1.25rem" }}
          >
            The King is Dead
          </Typography>
          {state && (
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={reset} sx={{ mr: 1, fontFamily: FONT_BODY }}>
              New
            </Button>
          )}
          <Button
            color="inherit"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setShowHelp(true)}
            sx={{ mr: 1, fontFamily: FONT_BODY }}
          >
            Rules
          </Button>
          <IconButton edge="end" color="inherit" onClick={onExit} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {state && !gameOver && <BotTurnOverlay feed={botFeed} thinking={thinkingBot} />}

      <DialogContent
        sx={{
          p: { xs: 1, sm: 2 },
          background: `radial-gradient(ellipse at 50% 20%, #f4ead0 0%, ${PARCHMENT} 55%, ${PARCHMENT_DARK} 100%)`,
        }}
      >
        {!state && <SetupScreen onStart={start} />}

        {state && (
          <Stack spacing={1.5} sx={{ maxWidth: 1200, mx: "auto", pb: 2 }}>
            {/* Status strip */}
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ rowGap: 0.5, justifyContent: "center" }}
            >
              <Typography sx={{ fontFamily: FONT_BODY, color: INK, fontSize: "0.9rem" }}>
                Struggle{" "}
                <b>
                  {Math.min(state.struggles.length + 1, 8)}
                </b>{" "}
                of 8
              </Typography>
              {contested && (
                <Typography sx={{ fontFamily: FONT_BODY, color: RUBRIC, fontSize: "0.9rem" }}>
                  ⚔ {regionName(contested)}
                </Typography>
              )}
              {counts &&
                FACTIONS.map((f) => (
                  <Stack key={f} direction="row" spacing={0.4} alignItems="center">
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: FACTION_COLOR[f].main,
                        border: `2px solid ${FACTION_COLOR[f].dark}`,
                      }}
                    />
                    <Typography sx={{ fontFamily: FONT_BODY, color: INK, fontSize: "0.9rem" }}>
                      {counts[f]}
                    </Typography>
                  </Stack>
                ))}
              <Stack direction="row" spacing={0.4} alignItems="center">
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: INSTABILITY,
                    border: "2px solid #2b1e12",
                  }}
                />
                <Typography sx={{ fontFamily: FONT_BODY, color: INK, fontSize: "0.9rem" }}>
                  {3 - state.instabilityInFrance}/3
                </Typography>
              </Stack>
            </Stack>

            {gameOver && <GameOverPanel state={state} onAgain={reset} />}

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" }}>
              {/* Map column */}
              <Box sx={{ flex: "1 1 380px", maxWidth: 640, mx: "auto" }}>
                <Box sx={{ mb: 1 }}>
                  <RegionCardTrack
                    state={state}
                    contested={contested}
                    highlightSlots={highlightSlots}
                    pickedSlots={selection?.slotsPicked}
                    onSlotClick={onSlotClick}
                  />
                </Box>
                <Box
                  sx={{
                    borderRadius: "10px",
                    border: `3px solid ${CARD_BACK}`,
                    outline: `1.5px solid ${GOLD}`,
                    outlineOffset: "-7px",
                    overflow: "hidden",
                    boxShadow: "0 4px 14px rgba(40,20,10,0.35)",
                  }}
                >
                  <BoardMap
                    state={state}
                    contested={contested}
                    highlightRegions={highlightRegions}
                    highlightCubes={highlightCubes}
                    pickedCubes={selection?.cubesPicked}
                    onRegionClick={onRegionClick}
                    onCubeClick={onCubeClick}
                  />
                </Box>
              </Box>

              {/* Side column: courts & chronicle */}
              <Stack spacing={1} sx={{ flex: "1 1 300px", minWidth: 280 }}>
                <UncialHeading>Courts</UncialHeading>
                {state.players.map((p, i) => (
                  <PlayerPanel
                    key={p.id}
                    state={state}
                    player={p}
                    isTeammate={
                      state.players.length === 4 &&
                      p.id !== HUMAN_ID &&
                      state.players[(state.players.findIndex((q) => q.id === HUMAN_ID) + 2) % 4].id === p.id
                    }
                  />
                ))}
                <UncialHeading>Chronicle</UncialHeading>
                <ParchmentPanel sx={{ p: 1, maxHeight: 190, overflowY: "auto" }}>
                  {log.length === 0 && (
                    <Typography sx={{ fontFamily: FONT_BODY, fontStyle: "italic", color: INK_FADED, fontSize: "0.82rem" }}>
                      The chronicle of the struggle will be written here…
                    </Typography>
                  )}
                  {log.map((line, i) => (
                    <Typography
                      key={`${i}-${line}`}
                      sx={{
                        fontFamily: FONT_BODY,
                        fontSize: "0.82rem",
                        color: i === 0 ? INK : INK_FADED,
                        lineHeight: 1.45,
                      }}
                    >
                      {line}
                    </Typography>
                  ))}
                </ParchmentPanel>
              </Stack>
            </Box>

            {/* Prompt + hand (sticky at the bottom) */}
            {!gameOver && human && (
              <Box
                sx={{
                  position: "sticky",
                  bottom: 0,
                  zIndex: 5,
                  mx: -1,
                  px: 1,
                  pt: 0.5,
                  pb: 1,
                  background: `linear-gradient(180deg, rgba(240,227,192,0), ${PARCHMENT} 22%)`,
                }}
              >
                <ParchmentPanel sx={{ p: 1, mb: 1 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ rowGap: 0.5 }}
                  >
                    <Typography
                      sx={{
                        fontFamily: FONT_BODY,
                        color: notice ? RUBRIC : INK,
                        fontSize: "0.92rem",
                        flexGrow: 1,
                        fontStyle: humanTurn ? "normal" : "italic",
                      }}
                    >
                      {notice ?? prompt}
                    </Typography>
                    {selection &&
                      targets?.variants?.map((v, i) => (
                        <Button
                          key={`${v.label}-${i}`}
                          size="small"
                          variant="outlined"
                          onClick={() => setSelection((s) => (s ? pickVariant(s, v.params) : s))}
                          sx={{ fontFamily: FONT_BODY, color: INK, borderColor: INK_FADED, textTransform: "none" }}
                        >
                          {v.label}
                        </Button>
                      ))}
                    {selection && (
                      <Button
                        size="small"
                        onClick={() => setSelection(null)}
                        sx={{ fontFamily: FONT_BODY, color: RUBRIC, textTransform: "none" }}
                      >
                        Cancel
                      </Button>
                    )}
                    {humanTurn && !state.pendingSummon && !selection && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => applyLocal({ type: "pass" })}
                        sx={{
                          fontFamily: FONT_UNCIAL,
                          background: `linear-gradient(180deg, #a13c30, ${CARD_BACK})`,
                          color: "#fdf3d8",
                          "&:hover": { background: "#8e3a2e" },
                        }}
                      >
                        Pass
                      </Button>
                    )}
                  </Stack>
                </ParchmentPanel>

                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ overflowX: "auto", pb: 0.5, justifyContent: { xs: "flex-start", md: "center" } }}
                >
                  {human.hand.map((cardId) => (
                    <ActionCardView
                      key={cardId}
                      cardId={cardId}
                      selected={selection?.cardId === cardId}
                      disabled={
                        !humanTurn || state.pendingSummon || (!!selection && selection.cardId !== cardId)
                      }
                      onClick={() => onCardClick(cardId)}
                    />
                  ))}
                  {human.hand.length === 0 && (
                    <Typography sx={{ fontFamily: FONT_BODY, fontStyle: "italic", color: INK_FADED }}>
                      You have played all your action cards — you can only pass now.
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      {/* Spy target dialog */}
      <Dialog open={spyOpen} onClose={() => setSpyOpen(false)}>
        <DialogTitle sx={{ fontFamily: FONT_UNCIAL, color: RUBRIC }}>Spy</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT_BODY, mb: 1.5 }} variant="body2">
            Resolve the card on top of another player's discard pile:
          </Typography>
          <Stack direction="row" spacing={2}>
            {spyGroups.map((g) => (
              <Stack key={g.playerId} alignItems="center" spacing={0.5}>
                <ActionCardView
                  cardId={g.top!}
                  onClick={() => {
                    setSpyOpen(false);
                    setSelection(startSelection("spy", g.inner, { playerId: g.playerId, effectiveCardId: g.top! }));
                  }}
                />
                <Typography sx={{ fontFamily: FONT_BODY, fontSize: "0.8rem" }}>{g.name}</Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSpyOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* No-effect confirmation */}
      <Dialog open={confirmNoEffect !== null} onClose={() => setConfirmNoEffect(null)}>
        <DialogTitle sx={{ fontFamily: FONT_UNCIAL, color: RUBRIC }}>
          {confirmNoEffect ? CARD_INFO[confirmNoEffect].name : ""}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT_BODY }} variant="body2">
            This card currently has no possible effect. You may still play it —
            you will summon a follower to your court as usual.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmNoEffect(null)}>Cancel</Button>
          <Button
            onClick={() => {
              if (confirmNoEffect) {
                applyLocal({ type: "play", cardId: confirmNoEffect, params: {} });
              }
              setConfirmNoEffect(null);
            }}
          >
            Play it anyway
          </Button>
        </DialogActions>
      </Dialog>

      <RulesDialog open={showHelp} onClose={() => setShowHelp(false)} />
    </Dialog>
  );
}

export default Tkid2Game;
