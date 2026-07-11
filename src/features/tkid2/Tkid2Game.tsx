import * as React from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Slide,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { TransitionProps } from "@mui/material/transitions";
import { Tkid2Logo } from "./Tkid2Logo";
import { Difficulty } from "./ai/botPolicy";
import { useTkid2BotDriver } from "./useTkid2BotDriver";
import {
  CrownOwner,
  FACTIONS,
  Faction,
  REGIONS,
  RegionId,
  TKID2Action,
  TKID2State,
  applyAction,
  cardById,
  crownCounts,
  currentPlayer,
  currentRegionId,
  decidingFaction,
  isGameOver,
  isInvasion,
  newGame,
  projectedOwner,
  results,
  winners,
} from "./engine/tkid2Engine";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const FACTION_COLOR: Record<Faction, string> = {
  english: "#9E9E9E",
  scottish: "#4F86C6",
  welsh: "#D65A5A",
};
const CROWN_COLOR: Record<CrownOwner, string> = {
  ...FACTION_COLOR,
  french: "#66A366",
};
const CROWN_LABEL: Record<CrownOwner, string> = {
  english: "English",
  scottish: "Scottish",
  welsh: "Welsh",
  french: "Foreign (revolt)",
};
const FACTION_LABEL: Record<Faction, string> = {
  english: "English",
  scottish: "Scottish",
  welsh: "Welsh",
};

const HUMAN_ID = "human";

// ===========================================================================
// Setup screen
// ===========================================================================

interface SetupResult {
  botCount: number;
  difficulty: Difficulty;
}

function SetupScreen({ onStart }: { onStart: (r: SetupResult) => void }) {
  const [botCount, setBotCount] = React.useState(1);
  const [difficulty, setDifficulty] = React.useState<Difficulty>("normal");

  return (
    <Stack spacing={3} sx={{ maxWidth: 460, mx: "auto", mt: 2 }}>
      <Typography variant="body1" color="text.secondary">
        Vie for control of Britain. Play single-use action cards to sway each
        region, and collect followers of the faction you think will end up on
        top. If enough regions fall into revolt, a foreign invasion flips the
        game — then the weakest faction's followers win.
      </Typography>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          AI opponents
        </Typography>
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={botCount}
          onChange={(_, v) => v && setBotCount(v)}
        >
          <ToggleButton value={1}>1 AI</ToggleButton>
          <ToggleButton value={2}>2 AI</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Difficulty
        </Typography>
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={difficulty}
          onChange={(_, v) => v && setDifficulty(v)}
        >
          <ToggleButton value="easy">Easy</ToggleButton>
          <ToggleButton value="normal">Normal</ToggleButton>
          <ToggleButton value="godlike">Godlike</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Button
        variant="contained"
        size="large"
        onClick={() => onStart({ botCount, difficulty })}
      >
        Start game
      </Button>
    </Stack>
  );
}

// ===========================================================================
// Board pieces
// ===========================================================================

function CubeRow({ cubes }: { cubes: Record<Faction, number> }) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 0.5 }}>
      {FACTIONS.map((f) => (
        <Chip
          key={f}
          size="small"
          label={`${FACTION_LABEL[f]} ${cubes[f]}`}
          sx={{
            bgcolor: FACTION_COLOR[f],
            color: "#111",
            fontWeight: 700,
            opacity: cubes[f] > 0 ? 1 : 0.35,
          }}
        />
      ))}
    </Stack>
  );
}

function RegionCard({
  state,
  regionId,
}: {
  state: TKID2State;
  regionId: RegionId;
}) {
  const def = REGIONS.find((r) => r.id === regionId)!;
  const cubes = state.regions[regionId];
  const crown = state.crowns[regionId];
  const contested = currentRegionId(state) === regionId;
  const projected = projectedOwner(cubes);

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: "2px solid",
        borderColor: contested ? "primary.main" : "divider",
        bgcolor: contested ? "rgba(176,124,243,0.10)" : "background.paper",
        minWidth: 190,
        flex: "1 1 190px",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {def.name}
        </Typography>
        {crown && (
          <Tooltip title={`Crown: ${CROWN_LABEL[crown]}`}>
            <EmojiEventsIcon sx={{ color: CROWN_COLOR[crown] }} />
          </Tooltip>
        )}
        {contested && !crown && (
          <Chip
            size="small"
            label="Contested"
            color="primary"
            variant="outlined"
          />
        )}
      </Stack>
      {crown ? (
        <Typography variant="caption" color="text.secondary">
          Won by {CROWN_LABEL[crown]}
        </Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          <CubeRow cubes={cubes} />
          <Typography variant="caption" color="text.secondary">
            {projected === "french"
              ? "Currently: revolt (tie/empty)"
              : `Currently leading: ${CROWN_LABEL[projected]}`}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

function CourtRow({
  state,
  playerId,
}: {
  state: TKID2State;
  playerId: string;
}) {
  const player = state.players.find((p) => p.id === playerId)!;
  const onTurn = currentPlayer(state).id === playerId && !isGameOver(state);
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        p: 1,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: onTurn ? "primary.main" : "divider",
        bgcolor: onTurn ? "rgba(176,124,243,0.08)" : "transparent",
      }}
    >
      {player.isBot ? (
        <SmartToyIcon fontSize="small" />
      ) : (
        <PersonIcon fontSize="small" />
      )}
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 90 }}>
        {player.name}
        {player.passed && !isGameOver(state) ? " (passed)" : ""}
      </Typography>
      <CubeRow cubes={player.court} />
      <Box sx={{ flexGrow: 1 }} />
      <Chip size="small" label={`${player.hand.length} cards`} variant="outlined" />
    </Stack>
  );
}

// ===========================================================================
// Human controls
// ===========================================================================

function HumanControls({
  state,
  onAction,
}: {
  state: TKID2State;
  onAction: (a: TKID2Action) => void;
}) {
  const [passOpen, setPassOpen] = React.useState(false);
  const [manoeuvreCard, setManoeuvreCard] = React.useState<string | null>(null);

  const region = currentRegionId(state);
  const me = state.players.find((p) => p.id === HUMAN_ID);
  if (!me || region === null || isGameOver(state)) return null;
  const cubes = state.regions[region];
  const myTurn = currentPlayer(state).id === HUMAN_ID && !me.passed;

  if (!myTurn) {
    return (
      <Typography variant="body2" color="text.secondary">
        {me.passed
          ? "You have passed this round — waiting for opponents…"
          : `Waiting for ${currentPlayer(state).name}…`}
      </Typography>
    );
  }

  const def = REGIONS.find((r) => r.id === region)!;
  const takeable = FACTIONS.filter((f) => cubes[f] > 0);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Your turn — play a card or pass</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
        {me.hand.map((cardId) => {
          const card = cardById(cardId)!;
          const disabled =
            card.kind === "exile" &&
            card.faction !== null &&
            cubes[card.faction] <= 0;
          return (
            <Button
              key={cardId}
              size="small"
              variant="outlined"
              disabled={disabled}
              onClick={() => {
                if (card.kind === "manoeuvre") {
                  setManoeuvreCard(cardId);
                } else {
                  onAction({ type: "playCard", cardId });
                }
              }}
              sx={{
                borderColor:
                  card.faction !== null ? FACTION_COLOR[card.faction] : "text.secondary",
                color: card.faction !== null ? FACTION_COLOR[card.faction] : "text.primary",
              }}
            >
              {card.label}
            </Button>
          );
        })}
      </Stack>
      <Box>
        <Button variant="contained" color="secondary" onClick={() => setPassOpen(true)}>
          Pass{takeable.length > 0 ? " & take a follower" : ""}
        </Button>
      </Box>

      {/* Pass / take-follower dialog */}
      <Dialog open={passOpen} onClose={() => setPassOpen(false)}>
        <DialogTitle>Pass this round</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Take one follower into your court, then sit out the rest of this
            round.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1, mt: 1 }}>
            {takeable.map((f) => (
              <Button
                key={f}
                variant="contained"
                onClick={() => {
                  onAction({ type: "pass", takeFollower: f });
                  setPassOpen(false);
                }}
                sx={{ bgcolor: FACTION_COLOR[f], color: "#111" }}
              >
                Take {FACTION_LABEL[f]}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              onAction({ type: "pass" });
              setPassOpen(false);
            }}
          >
            {takeable.length > 0 ? "Take nothing" : "Pass"}
          </Button>
          <Button onClick={() => setPassOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Manoeuvre source picker */}
      <Dialog open={manoeuvreCard !== null} onClose={() => setManoeuvreCard(null)}>
        <DialogTitle>Manoeuvre into {def.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Move a faction's cubes in from a neighbouring region.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {def.adjacent.map((adj) => {
              const adjDef = REGIONS.find((r) => r.id === adj)!;
              const adjCubes = state.regions[adj];
              const present = FACTIONS.filter((f) => adjCubes[f] > 0);
              return (
                <Box key={adj}>
                  <Typography variant="caption" color="text.secondary">
                    From {adjDef.name}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
                    {present.length === 0 && (
                      <Typography variant="caption" color="text.disabled">
                        (no cubes)
                      </Typography>
                    )}
                    {present.map((f) => (
                      <Button
                        key={f}
                        size="small"
                        variant="contained"
                        onClick={() => {
                          onAction({
                            type: "playCard",
                            cardId: manoeuvreCard!,
                            fromRegion: adj,
                            faction: f,
                          });
                          setManoeuvreCard(null);
                        }}
                        sx={{ bgcolor: FACTION_COLOR[f], color: "#111" }}
                      >
                        {FACTION_LABEL[f]} ({adjCubes[f]})
                      </Button>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManoeuvreCard(null)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ===========================================================================
// End-of-game summary
// ===========================================================================

function GameOverPanel({ state }: { state: TKID2State }) {
  const ranked = results(state);
  const won = winners(state);
  const wonIds = new Set(won.map((w) => w.playerId));
  const invasion = isInvasion(state);
  const deciding = decidingFaction(state);
  const counts = crownCounts(state);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: "2px solid",
        borderColor: "primary.main",
        bgcolor: "rgba(176,124,243,0.10)",
      }}
    >
      <Typography variant="h6" gutterBottom>
        {invasion ? "Foreign invasion!" : "The realm is united"}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {invasion
          ? `Too many regions fell into revolt (${counts.french}). Alignment with the weakest faction, ${CROWN_LABEL[deciding]}, decides the winner.`
          : `The ${CROWN_LABEL[deciding]} faction is strongest. Whoever has the most ${FACTION_LABEL[deciding]} followers wins.`}
      </Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1}>
        {ranked.map((r, i) => (
          <Stack key={r.playerId} direction="row" alignItems="center" spacing={1}>
            {wonIds.has(r.playerId) ? (
              <EmojiEventsIcon sx={{ color: "#F4C947" }} />
            ) : (
              <Typography sx={{ width: 24, textAlign: "center" }}>{i + 1}</Typography>
            )}
            <Typography sx={{ fontWeight: wonIds.has(r.playerId) ? 700 : 400, flexGrow: 1 }}>
              {r.name}
            </Typography>
            <Chip
              size="small"
              label={`${r.score} ${FACTION_LABEL[deciding]}`}
              sx={{ bgcolor: FACTION_COLOR[deciding], color: "#111", fontWeight: 700 }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

// ===========================================================================
// Rules help
// ===========================================================================

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>How to play — The King Is Dead</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" paragraph>
          Regions of Britain are contested one at a time. On your turn you either
          play one single-use <b>action card</b> or <b>pass</b>.
        </Typography>
        <Typography variant="body2" component="div">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <b>Muster</b> — add cubes of a faction to the contested region.
            </li>
            <li>
              <b>Exile</b> — remove cubes of a faction from the contested region.
            </li>
            <li>
              <b>Manoeuvre</b> — move a faction's cubes in from a neighbouring
              region.
            </li>
            <li>
              <b>Pass</b> — take one follower (a cube of your choice present in
              the region) into your court, then sit out the rest of the round.
            </li>
          </ul>
        </Typography>
        <Typography variant="body2" paragraph sx={{ mt: 1 }}>
          When everyone has passed, the region's majority faction earns its
          crown; a tie leaves the region in revolt (a foreign crown). After all
          regions resolve, the strongest faction decides the winner — the player
          with the most followers of that faction. But if enough regions fell
          into revolt, a foreign invasion flips it: the <i>weakest</i> faction's
          followers win instead.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Note: exact rulebook values are an interpretation and may differ from
          the published game.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ===========================================================================
// Root game component
// ===========================================================================

export function Tkid2Game({ onExit }: { onExit: () => void }) {
  const theme = useTheme();
  const [state, setState] = React.useState<TKID2State | null>(null);
  const [config, setConfig] = React.useState<SetupResult | null>(null);
  const [showHelp, setShowHelp] = React.useState(false);

  const start = (r: SetupResult) => {
    const players = [
      { id: HUMAN_ID, name: "You", isBot: false },
      ...Array.from({ length: r.botCount }, (_, i) => ({
        id: `bot-${i + 1}`,
        name: r.botCount === 1 ? "AI" : `AI ${i + 1}`,
        isBot: true,
      })),
    ];
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    setState(newGame(players, seed));
    setConfig(r);
  };

  const applyLocal = React.useCallback((action: TKID2Action) => {
    setState((prev) => {
      if (!prev) return prev;
      const res = applyAction(prev, action);
      // Silently ignore rejected actions (shouldn't happen from valid UI/AI).
      return res.error ? prev : res.state;
    });
  }, []);

  const botIds = React.useMemo(
    () => state?.players.filter((p) => p.isBot).map((p) => p.id) ?? [],
    [state],
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

  return (
    <Dialog fullScreen open onClose={onExit} TransitionComponent={Transition as any}>
      <AppBar
        sx={{
          background: theme.palette.mode === "dark" ? "#2E1B47" : "#5B2E93",
          position: "relative",
        }}
      >
        <Toolbar>
          <Tkid2Logo size={32} sx={{ marginRight: 8 }} />
          <Typography variant="h6" sx={{ flex: 1, color: "#fff", fontWeight: 600 }}>
            The King Is Dead
          </Typography>
          {state && (
            <Button
              color="inherit"
              startIcon={<RefreshIcon />}
              onClick={() => {
                setState(null);
                setConfig(null);
              }}
              sx={{ mr: 1 }}
            >
              New
            </Button>
          )}
          <Button
            color="inherit"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setShowHelp(true)}
            sx={{ mr: 1 }}
          >
            Rules
          </Button>
          <IconButton edge="end" color="inherit" onClick={onExit} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ p: 2 }}>
        {!state && <SetupScreen onStart={start} />}

        {state && (
          <Stack spacing={2} sx={{ maxWidth: 900, mx: "auto" }}>
            {/* Progress */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ rowGap: 1 }}>
              <Chip
                size="small"
                label={`Region ${Math.min(state.eventIndex + 1, REGIONS.length)} / ${REGIONS.length}`}
                color="primary"
              />
              {FACTIONS.map((f) => (
                <Chip
                  key={f}
                  size="small"
                  label={`${FACTION_LABEL[f]}: ${crownCounts(state)[f]} 👑`}
                  sx={{ bgcolor: FACTION_COLOR[f], color: "#111", fontWeight: 700 }}
                />
              ))}
              <Chip
                size="small"
                label={`Revolt: ${crownCounts(state).french}`}
                sx={{ bgcolor: CROWN_COLOR.french, color: "#111", fontWeight: 700 }}
              />
            </Stack>

            {gameOver && <GameOverPanel state={state} />}

            {/* Regions board */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Regions
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1.5}>
                {state.eventOrder.map((rid) => (
                  <RegionCard key={rid} state={state} regionId={rid} />
                ))}
              </Stack>
            </Box>

            {/* Courts */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Courts
              </Typography>
              <Stack spacing={1}>
                {state.players.map((p) => (
                  <CourtRow key={p.id} state={state} playerId={p.id} />
                ))}
              </Stack>
            </Box>

            {/* Human controls */}
            {!gameOver && (
              <>
                <Divider />
                <HumanControls state={state} onAction={applyLocal} />
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      <RulesDialog open={showHelp} onClose={() => setShowHelp(false)} />
    </Dialog>
  );
}

export default Tkid2Game;
