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
  IconButton,
  InputAdornment,
  Slide,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import UndoIcon from "@mui/icons-material/Undo";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import { TransitionProps } from "@mui/material/transitions";
import { Flip7Logo } from "./Flip7Logo";
import {
  Flip7Player,
  Flip7RoundEntry,
  Flip7State,
  MODIFIER_BONUSES,
  ModifierBonus,
  entryScore,
  isGameOver,
  leaderboard,
  makeEmptyEntry,
  newGame,
  winners,
} from "./flip7Engine";

// === Flip 7 rulebook palette =============================================
const FLIP7 = {
  cream: "#F8EFC8",
  teal: "#4FB7BC",
  tealDark: "#2F7E83",
  navy: "#1B3A8A",
  yellow: "#F4C947",
  red: "#E84C4C",
  orange: "#F2A03B",
};

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// =========================================================================
// Setup screen — collect player names before starting a game
// =========================================================================
function SetupScreen({
  onStart,
}: {
  onStart: (players: Flip7Player[]) => void;
}) {
  const [players, setPlayers] = React.useState<Flip7Player[]>([]);
  const [draft, setDraft] = React.useState("");

  const addPlayer = () => {
    const name = draft.trim();
    if (!name) return;
    setPlayers((prev) => [...prev, { id: genId(), name }]);
    setDraft("");
  };

  const removePlayer = (id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <Stack
      spacing={3}
      sx={{
        maxWidth: 480,
        mx: "auto",
        mt: 2,
        p: 3,
        borderRadius: 3,
        bgcolor: FLIP7.teal,
        border: `2px solid ${FLIP7.navy}`,
        boxShadow: `0 0 0 4px ${FLIP7.cream} inset`,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Flip7Logo size={64} />
        <Box>
          <Typography
            variant="h5"
            sx={{ color: FLIP7.navy, fontWeight: 800, letterSpacing: 1 }}
          >
            PRESS YOUR LUCK
          </Typography>
          <Typography variant="body2" sx={{ color: FLIP7.navy }}>
            First to 200 points wins.
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          placeholder="Player name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPlayer();
            }
          }}
          sx={{
            bgcolor: FLIP7.cream,
            borderRadius: 1,
            "& .MuiOutlinedInput-root": {
              "& fieldset": { borderColor: FLIP7.navy },
              "&:hover fieldset": { borderColor: FLIP7.navy },
              "&.Mui-focused fieldset": { borderColor: FLIP7.navy },
            },
            input: { color: FLIP7.navy },
          }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={addPlayer}
          disabled={!draft.trim()}
          sx={{
            bgcolor: FLIP7.yellow,
            color: FLIP7.navy,
            fontWeight: 700,
            "&:hover": { bgcolor: "#e6bc35" },
          }}
        >
          Add
        </Button>
      </Stack>

      <Stack spacing={1}>
        {players.length === 0 ? (
          <Typography
            variant="body2"
            sx={{ color: FLIP7.navy, fontStyle: "italic" }}
          >
            Add 2 or more players to start.
          </Typography>
        ) : (
          players.map((p, idx) => (
            <Stack
              key={p.id}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                bgcolor: FLIP7.cream,
                border: `2px solid ${FLIP7.navy}`,
                borderRadius: 2,
                px: 2,
                py: 1,
              }}
            >
              <Typography
                sx={{ color: FLIP7.navy, fontWeight: 700, flexGrow: 1 }}
              >
                {idx + 1}. {p.name}
              </Typography>
              <IconButton
                size="small"
                onClick={() => removePlayer(p.id)}
                sx={{ color: FLIP7.red }}
                aria-label={`Remove ${p.name}`}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))
        )}
      </Stack>

      <Button
        variant="contained"
        size="large"
        disabled={players.length < 2}
        onClick={() => onStart(players)}
        sx={{
          bgcolor: FLIP7.navy,
          color: FLIP7.yellow,
          fontWeight: 800,
          letterSpacing: 1,
          "&:hover": { bgcolor: "#15306e" },
          "&.Mui-disabled": {
            bgcolor: "rgba(27,58,138,0.4)",
            color: "rgba(244,201,71,0.5)",
          },
        }}
      >
        START GAME
      </Button>
    </Stack>
  );
}

// =========================================================================
// Per-player round entry row
// =========================================================================
function RoundEntryRow({
  player,
  entry,
  onChange,
}: {
  player: Flip7Player;
  entry: Flip7RoundEntry;
  onChange: (next: Flip7RoundEntry) => void;
}) {
  const score = entryScore(entry);
  const setStatus = (status: "stayed" | "busted") => {
    if (status === "busted") {
      onChange({ ...makeEmptyEntry(), busted: true });
    } else {
      onChange({ ...entry, busted: false });
    }
  };
  const toggleMod = (m: ModifierBonus) => {
    const has = entry.modifiers.includes(m);
    onChange({
      ...entry,
      modifiers: has
        ? entry.modifiers.filter((v) => v !== m)
        : [...entry.modifiers, m],
    });
  };

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: FLIP7.cream,
        border: `2px solid ${FLIP7.navy}`,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          sx={{ color: FLIP7.navy, fontWeight: 800, fontSize: "1.05rem" }}
        >
          {player.name}
        </Typography>
        <Chip
          label={`+${score}`}
          sx={{
            bgcolor: entry.busted ? FLIP7.red : FLIP7.yellow,
            color: entry.busted ? "#fff" : FLIP7.navy,
            fontWeight: 800,
            fontSize: "1rem",
          }}
        />
      </Stack>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={entry.busted ? "busted" : "stayed"}
        onChange={(_, v) => v && setStatus(v)}
        sx={{
          mt: 1.5,
          "& .MuiToggleButton-root": {
            color: FLIP7.navy,
            borderColor: FLIP7.navy,
            fontWeight: 700,
            textTransform: "none",
          },
          "& .MuiToggleButton-root.Mui-selected": {
            bgcolor: FLIP7.navy,
            color: FLIP7.yellow,
            "&:hover": { bgcolor: "#15306e" },
          },
        }}
      >
        <ToggleButton value="stayed">Stayed / Flip 7</ToggleButton>
        <ToggleButton value="busted">
          <LocalFireDepartmentIcon
            fontSize="small"
            sx={{ mr: 0.5, color: entry.busted ? FLIP7.red : "inherit" }}
          />
          Busted
        </ToggleButton>
      </ToggleButtonGroup>

      {!entry.busted && (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            size="small"
            type="number"
            label="Number cards (sum)"
            value={entry.numberSum}
            onChange={(e) => {
              const raw = e.target.value === "" ? 0 : Number(e.target.value);
              const clamped = Number.isFinite(raw)
                ? Math.max(0, Math.min(78, Math.floor(raw)))
                : 0;
              onChange({ ...entry, numberSum: clamped });
            }}
            inputProps={{ min: 0, max: 78, inputMode: "numeric" }}
            InputProps={{
              endAdornment: entry.doubled ? (
                <InputAdornment position="end">
                  <Typography sx={{ color: FLIP7.red, fontWeight: 800 }}>
                    × 2
                  </Typography>
                </InputAdornment>
              ) : undefined,
            }}
            sx={{
              maxWidth: 220,
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: FLIP7.navy },
                "&:hover fieldset": { borderColor: FLIP7.navy },
                "&.Mui-focused fieldset": { borderColor: FLIP7.navy },
              },
              "& .MuiInputLabel-root": { color: FLIP7.navy },
              input: { color: FLIP7.navy, fontWeight: 700 },
            }}
          />

          <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ rowGap: 1 }}>
            {MODIFIER_BONUSES.map((m) => {
              const selected = entry.modifiers.includes(m);
              return (
                <Chip
                  key={m}
                  clickable
                  label={`+${m}`}
                  onClick={() => toggleMod(m)}
                  sx={{
                    bgcolor: selected ? FLIP7.orange : "transparent",
                    color: selected ? "#fff" : FLIP7.orange,
                    border: `2px solid ${FLIP7.orange}`,
                    fontWeight: 800,
                    "&:hover": {
                      bgcolor: selected ? FLIP7.orange : "rgba(242,160,59,0.15)",
                    },
                  }}
                />
              );
            })}
            <Chip
              clickable
              label="× 2"
              onClick={() => onChange({ ...entry, doubled: !entry.doubled })}
              sx={{
                bgcolor: entry.doubled ? FLIP7.red : "transparent",
                color: entry.doubled ? "#fff" : FLIP7.red,
                border: `2px solid ${FLIP7.red}`,
                fontWeight: 800,
                "&:hover": {
                  bgcolor: entry.doubled ? FLIP7.red : "rgba(232,76,76,0.15)",
                },
              }}
            />
            <Chip
              clickable
              label="FLIP 7  +15"
              onClick={() => onChange({ ...entry, flip7: !entry.flip7 })}
              sx={{
                bgcolor: entry.flip7 ? FLIP7.yellow : "transparent",
                color: entry.flip7 ? FLIP7.navy : FLIP7.navy,
                border: `2px solid ${FLIP7.navy}`,
                fontWeight: 800,
                "&:hover": {
                  bgcolor: entry.flip7 ? FLIP7.yellow : "rgba(244,201,71,0.25)",
                },
              }}
            />
          </Stack>
        </Stack>
      )}
    </Box>
  );
}

// =========================================================================
// Round entry dialog — collects all players' scores for the round
// =========================================================================
function RoundEntryDialog({
  open,
  roundNumber,
  players,
  onClose,
  onSave,
}: {
  open: boolean;
  roundNumber: number;
  players: Flip7Player[];
  onClose: () => void;
  onSave: (entries: Record<string, Flip7RoundEntry>) => void;
}) {
  const [entries, setEntries] = React.useState<
    Record<string, Flip7RoundEntry>
  >({});

  React.useEffect(() => {
    if (open) {
      const blank: Record<string, Flip7RoundEntry> = {};
      players.forEach((p) => (blank[p.id] = makeEmptyEntry()));
      setEntries(blank);
    }
  }, [open, players]);

  const setEntry = (id: string, next: Flip7RoundEntry) =>
    setEntries((prev) => ({ ...prev, [id]: next }));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle
        sx={{
          bgcolor: FLIP7.navy,
          color: FLIP7.yellow,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        ROUND {roundNumber}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: FLIP7.teal, p: 2 }}>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {players.map((p) => (
            <RoundEntryRow
              key={p.id}
              player={p}
              entry={entries[p.id] ?? makeEmptyEntry()}
              onChange={(next) => setEntry(p.id, next)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ bgcolor: FLIP7.teal, p: 2 }}>
        <Button onClick={onClose} sx={{ color: FLIP7.navy, fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(entries)}
          sx={{
            bgcolor: FLIP7.yellow,
            color: FLIP7.navy,
            fontWeight: 800,
            "&:hover": { bgcolor: "#e6bc35" },
          }}
        >
          Save round
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// =========================================================================
// Player card on the in-game board
// =========================================================================
function PlayerCard({
  player,
  total,
  rank,
  lastRound,
  target,
  isWinner,
}: {
  player: Flip7Player;
  total: number;
  rank: number;
  lastRound?: Flip7RoundEntry;
  target: number;
  isWinner: boolean;
}) {
  const lastDelta = lastRound ? entryScore(lastRound) : null;
  const pct = Math.min(100, (total / target) * 100);
  return (
    <Box
      sx={{
        position: "relative",
        bgcolor: FLIP7.cream,
        border: `3px solid ${isWinner ? FLIP7.yellow : FLIP7.navy}`,
        borderRadius: 2,
        p: 2,
        boxShadow: isWinner
          ? `0 0 0 3px ${FLIP7.navy}, 0 0 24px rgba(244,201,71,0.6)`
          : undefined,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: rank === 1 ? FLIP7.yellow : FLIP7.teal,
              color: FLIP7.navy,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${FLIP7.navy}`,
              fontSize: "0.9rem",
            }}
          >
            {rank}
          </Box>
          <Typography
            sx={{
              color: FLIP7.navy,
              fontWeight: 800,
              fontSize: "1.1rem",
            }}
          >
            {player.name}
          </Typography>
          {isWinner && <EmojiEventsIcon sx={{ color: FLIP7.yellow }} />}
        </Stack>
        <Typography
          sx={{
            color: FLIP7.navy,
            fontWeight: 900,
            fontSize: "1.6rem",
            lineHeight: 1,
          }}
        >
          {total}
        </Typography>
      </Stack>

      {/* Progress bar to target */}
      <Box
        sx={{
          mt: 1,
          height: 8,
          borderRadius: 4,
          bgcolor: "rgba(27,58,138,0.15)",
          overflow: "hidden",
          border: `1px solid ${FLIP7.navy}`,
        }}
      >
        <Box
          sx={{
            width: `${pct}%`,
            height: "100%",
            bgcolor: FLIP7.yellow,
            transition: "width 240ms ease",
          }}
        />
      </Box>

      {lastDelta != null && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
          <Typography variant="caption" sx={{ color: FLIP7.navy }}>
            Last round:
          </Typography>
          <Chip
            size="small"
            label={lastRound?.busted ? "BUST" : `+${lastDelta}`}
            sx={{
              bgcolor: lastRound?.busted ? FLIP7.red : FLIP7.teal,
              color: lastRound?.busted ? "#fff" : FLIP7.navy,
              fontWeight: 800,
            }}
          />
          {lastRound?.flip7 && (
            <Chip
              size="small"
              label="FLIP 7"
              sx={{
                bgcolor: FLIP7.yellow,
                color: FLIP7.navy,
                fontWeight: 800,
              }}
            />
          )}
          {lastRound?.doubled && !lastRound?.busted && (
            <Chip
              size="small"
              label="× 2"
              sx={{ bgcolor: FLIP7.red, color: "#fff", fontWeight: 800 }}
            />
          )}
        </Stack>
      )}
    </Box>
  );
}

// =========================================================================
// Main game shell
// =========================================================================
export function Flip7Game({ onExit }: { onExit: () => void }) {
  const [state, setState] = React.useState<Flip7State | null>(null);
  const [showHelp, setShowHelp] = React.useState(false);
  const [roundDialogOpen, setRoundDialogOpen] = React.useState(false);

  const startGame = (players: Flip7Player[]) => {
    setState(newGame(players));
  };

  const saveRound = (entries: Record<string, Flip7RoundEntry>) => {
    if (!state) return;
    setState({ ...state, rounds: [...state.rounds, entries] });
    setRoundDialogOpen(false);
  };

  const undoLastRound = () => {
    if (!state || state.rounds.length === 0) return;
    setState({ ...state, rounds: state.rounds.slice(0, -1) });
  };

  const newGameSamePlayers = () => {
    if (!state) return;
    setState(newGame(state.players));
  };

  const fullReset = () => setState(null);

  const board = state ? leaderboard(state) : [];
  const gameOver = state ? isGameOver(state) : false;
  const winnerSet = new Set(state ? winners(state).map((p) => p.id) : []);
  const lastRound = state?.rounds[state.rounds.length - 1];
  const roundNumber = (state?.rounds.length ?? 0) + 1;

  return (
    <Dialog
      fullScreen
      open
      onClose={onExit}
      TransitionComponent={Transition as any}
      PaperProps={{ sx: { bgcolor: FLIP7.teal } }}
    >
      <AppBar sx={{ background: FLIP7.navy, position: "relative" }}>
        <Toolbar>
          <Flip7Logo size={32} sx={{ marginRight: 8 }} />
          <Typography
            variant="h6"
            sx={{
              flex: 1,
              color: FLIP7.yellow,
              fontWeight: 800,
              letterSpacing: 1.5,
            }}
          >
            FLIP 7
          </Typography>
          {state && (
            <Tooltip title="Restart with same players">
              <IconButton
                color="inherit"
                onClick={newGameSamePlayers}
                sx={{ mr: 0.5 }}
                aria-label="Restart"
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
          <Button
            color="inherit"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setShowHelp(true)}
            sx={{ mr: 1, color: FLIP7.yellow, fontWeight: 700 }}
          >
            Rules
          </Button>
          <IconButton
            edge="end"
            color="inherit"
            onClick={onExit}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ p: 2, bgcolor: FLIP7.teal }}>
        {!state && <SetupScreen onStart={startGame} />}

        {state && (
          <Stack spacing={2} sx={{ maxWidth: 720, mx: "auto" }}>
            {/* Header strip */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              flexWrap="wrap"
              sx={{ rowGap: 1 }}
            >
              <Chip
                label={`Round ${state.rounds.length}`}
                sx={{
                  bgcolor: FLIP7.navy,
                  color: FLIP7.yellow,
                  fontWeight: 800,
                  fontSize: "0.95rem",
                }}
              />
              <Chip
                label={`Target ${state.targetScore}`}
                sx={{
                  bgcolor: FLIP7.cream,
                  color: FLIP7.navy,
                  border: `2px solid ${FLIP7.navy}`,
                  fontWeight: 800,
                }}
              />
              <Chip
                label={`${state.players.length} players`}
                sx={{
                  bgcolor: FLIP7.cream,
                  color: FLIP7.navy,
                  border: `2px solid ${FLIP7.navy}`,
                  fontWeight: 700,
                }}
              />
            </Stack>

            {/* Game-over banner */}
            {gameOver && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: FLIP7.yellow,
                  border: `3px solid ${FLIP7.navy}`,
                  textAlign: "center",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="center"
                >
                  <EmojiEventsIcon sx={{ color: FLIP7.navy }} />
                  <Typography
                    variant="h6"
                    sx={{ color: FLIP7.navy, fontWeight: 800 }}
                  >
                    {winnerSet.size === 1
                      ? `${
                          state.players.find((p) => winnerSet.has(p.id))?.name
                        } wins!`
                      : `Tie: ${state.players
                          .filter((p) => winnerSet.has(p.id))
                          .map((p) => p.name)
                          .join(", ")}`}
                  </Typography>
                </Stack>
              </Box>
            )}

            {/* Player cards */}
            <Stack spacing={1.5}>
              {board.map((row, idx) => (
                <PlayerCard
                  key={row.player.id}
                  player={row.player}
                  total={row.total}
                  rank={idx + 1}
                  lastRound={
                    lastRound ? lastRound[row.player.id] : undefined
                  }
                  target={state.targetScore}
                  isWinner={winnerSet.has(row.player.id)}
                />
              ))}
            </Stack>

            {/* Action buttons */}
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              sx={{ rowGap: 1, mt: 1 }}
            >
              <Button
                variant="contained"
                size="large"
                disabled={gameOver}
                onClick={() => setRoundDialogOpen(true)}
                sx={{
                  bgcolor: FLIP7.yellow,
                  color: FLIP7.navy,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  flexGrow: 1,
                  minWidth: 200,
                  "&:hover": { bgcolor: "#e6bc35" },
                  "&.Mui-disabled": {
                    bgcolor: "rgba(244,201,71,0.4)",
                    color: "rgba(27,58,138,0.5)",
                  },
                }}
              >
                ENTER ROUND {roundNumber}
              </Button>
              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                disabled={state.rounds.length === 0}
                onClick={undoLastRound}
                sx={{
                  color: FLIP7.cream,
                  borderColor: FLIP7.cream,
                  fontWeight: 700,
                  "&:hover": {
                    borderColor: FLIP7.cream,
                    bgcolor: "rgba(248,239,200,0.1)",
                  },
                }}
              >
                Undo round
              </Button>
              <Button
                variant="outlined"
                onClick={fullReset}
                sx={{
                  color: FLIP7.cream,
                  borderColor: FLIP7.cream,
                  fontWeight: 700,
                  "&:hover": {
                    borderColor: FLIP7.cream,
                    bgcolor: "rgba(248,239,200,0.1)",
                  },
                }}
              >
                New game
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>

      {state && (
        <RoundEntryDialog
          open={roundDialogOpen}
          roundNumber={roundNumber}
          players={state.players}
          onClose={() => setRoundDialogOpen(false)}
          onSave={saveRound}
        />
      )}

      <Flip7Help open={showHelp} onClose={() => setShowHelp(false)} />
    </Dialog>
  );
}

// =========================================================================
// Quick rules dialog
// =========================================================================
function Flip7Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <AppBar sx={{ position: "relative", background: FLIP7.navy }}>
        <Toolbar>
          <Flip7Logo size={28} sx={{ marginRight: 8 }} />
          <Typography
            variant="h6"
            sx={{ flex: 1, color: FLIP7.yellow, fontWeight: 800 }}
          >
            FLIP 7 — quick rules
          </Typography>
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <DialogContent sx={{ bgcolor: FLIP7.cream }}>
        <Stack spacing={1.5} sx={{ mt: 1, color: FLIP7.navy }}>
          <Typography variant="body2">
            <strong>Objective.</strong> First player to <strong>200</strong>{" "}
            points wins.
          </Typography>
          <Typography variant="body2">
            <strong>Each round,</strong> players choose to <em>Hit</em>{" "}
            (take a card) or <em>Stay</em> (bank points). Drawing a duplicate
            number busts you for 0 points that round. Collecting{" "}
            <strong>seven different number cards (Flip 7)</strong> ends the
            round and earns +15 bonus points.
          </Typography>
          <Typography variant="body2">
            <strong>Scoring per round:</strong>
            <br />• Add the values of your number cards.
            <br />• If you hold the <strong>×2</strong> card, double that
            sum.
            <br />• Then add any +2 / +4 / +6 / +8 / +10 modifier cards.
            <br />• Add +15 if you flipped 7.
            <br />• Busted players score 0 for the round.
          </Typography>
          <Typography variant="body2">
            <strong>This score keeper.</strong> After each round, tap{" "}
            <em>Enter round</em>, mark each player as{" "}
            <em>Stayed / Flip 7</em> or <em>Busted</em>, fill in their
            number-card sum, and toggle any modifiers they held. Use{" "}
            <em>Undo round</em> to fix mistakes.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default Flip7Game;
