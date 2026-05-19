import * as React from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Slide,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ShieldIcon from "@mui/icons-material/Shield";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import StyleIcon from "@mui/icons-material/Style";
import RefreshIcon from "@mui/icons-material/Refresh";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { RegicideLogo } from "./RegicideLogo";
import HeartBrokenIcon from "@mui/icons-material/HeartBroken";
import { TransitionProps } from "@mui/material/transitions";
import { PlayingCard } from "../play/PlayingCard";
import type { Card, Suit } from "../play/engine/cards";
import {
  RegicideState,
  applyJesterFlip,
  applyPlay,
  applyYield,
  attackValue,
  classifyPlay,
  damageRequired,
  handTotalValue,
  newSoloGame,
  playAttackValue,
  playSuits,
  resolveDamage,
  suitSymbol,
} from "./regicideEngine";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const SUIT_HEX: Record<Suit, string> = {
  hearts: "#c62828",
  diamonds: "#c62828",
  spades: "#212121",
  clubs: "#212121",
};

interface SuitReminderProps {
  enemyImmune: Suit;
}

const SUIT_BLURB: Record<Suit, { title: string; text: string }> = {
  hearts: { title: "Hearts — Heal", text: "Return N discarded cards to bottom of Tavern." },
  diamonds: { title: "Diamonds — Draw", text: "Draw N cards (up to hand limit of 8)." },
  clubs: { title: "Clubs — Double", text: "Damage dealt counts double." },
  spades: { title: "Spades — Shield", text: "Reduce enemy attack by N (sticky)." },
};

function SuitReminder({ enemyImmune }: SuitReminderProps) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
      {(["hearts", "diamonds", "clubs", "spades"] as Suit[]).map((suit) => {
        const immune = suit === enemyImmune;
        const blurb = SUIT_BLURB[suit];
        return (
          <Tooltip key={suit} title={`${blurb.title} — ${blurb.text}${immune ? " (immune)" : ""}`}>
            <Chip
              size="small"
              label={`${suitSymbol(suit)} ${blurb.title.split(" — ")[1]}`}
              sx={{
                bgcolor: immune ? "rgba(120,120,120,0.25)" : "rgba(255,255,255,0.06)",
                color: immune ? "text.disabled" : SUIT_HEX[suit] === "#c62828" ? "#ff8a8a" : "text.primary",
                textDecoration: immune ? "line-through" : "none",
                fontWeight: 600,
              }}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
}

function EnemyDisplay({ state }: { state: RegicideState }) {
  const { enemy } = state;
  const reqDamage = damageRequired(state);
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "primary.main",
        bgcolor: "rgba(243,125,131,0.06)",
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <PlayingCard
          card={{ id: `${enemy.suit}-${enemy.rank}`, suit: enemy.suit, rank: enemy.rank }}
          size="lg"
        />
      </Box>
      <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h6" sx={{ color: "primary.main", fontWeight: 700 }}>
          {enemy.rank}{suitSymbol(enemy.suit)} — {enemy.rank === "J" ? "Jack" : enemy.rank === "Q" ? "Queen" : "King"}
        </Typography>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ rowGap: 0.5 }}>
          <Chip
            size="small"
            icon={<FavoriteIcon />}
            label={`HP ${enemy.currentHealth}/${enemy.maxHealth}`}
            sx={{ bgcolor: "rgba(198,40,40,0.18)", color: "#ffb3b3", fontWeight: 700 }}
          />
          <Chip
            size="small"
            icon={<LocalFireDepartmentIcon />}
            label={`Attack ${enemy.baseAttack}`}
            sx={{ bgcolor: "rgba(255,140,0,0.18)", color: "#ffd599", fontWeight: 700 }}
          />
          <Chip
            size="small"
            icon={<ShieldIcon />}
            label={`Shield ${state.shield}`}
            sx={{ bgcolor: "rgba(120,170,255,0.18)", color: "#cfe0ff", fontWeight: 700 }}
          />
          <Chip
            size="small"
            label={`Incoming ${reqDamage}`}
            sx={{
              bgcolor: reqDamage === 0 ? "rgba(80,200,120,0.18)" : "rgba(255,80,80,0.22)",
              color: reqDamage === 0 ? "#a8e6c0" : "#ffb3b3",
              fontWeight: 700,
            }}
          />
          <Chip
            size="small"
            label={`Immune ${suitSymbol(enemy.suit)}`}
            sx={{ bgcolor: "rgba(255,255,255,0.08)", fontWeight: 600 }}
          />
        </Stack>
        {/* HP bar */}
        <Box sx={{ mt: 0.5, height: 8, borderRadius: 4, bgcolor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <Box
            sx={{
              width: `${Math.max(0, (enemy.currentHealth / enemy.maxHealth) * 100)}%`,
              height: "100%",
              bgcolor: "primary.main",
              transition: "width 240ms ease",
            }}
          />
        </Box>
      </Stack>
    </Stack>
  );
}

export function RegicideGame({ onExit }: { onExit: () => void }) {
  const theme = useTheme();
  const [state, setState] = React.useState<RegicideState>(() => newSoloGame());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const selectedCards: Card[] = React.useMemo(
    () => state.hand.filter((c) => selected.has(c.id)),
    [state.hand, selected],
  );

  const toggle = (id: string) => {
    setError(undefined);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const playPreview = React.useMemo(() => {
    if (selectedCards.length === 0) return null;
    const cls = classifyPlay(selectedCards);
    if ("error" in cls) return { error: cls.error };
    return {
      attack: playAttackValue(cls),
      suits: playSuits(cls),
    };
  }, [selectedCards]);

  const doPlay = () => {
    const res = applyPlay(state, selectedCards);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setState(res);
    clearSelection();
  };

  const doYield = () => {
    setState(applyYield(state));
    clearSelection();
  };

  const doJester = () => {
    const res = applyJesterFlip(state);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setState(res);
    clearSelection();
  };

  const doSuffer = () => {
    const res = resolveDamage(state, selectedCards);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setState(res);
    clearSelection();
  };

  const resetGame = () => {
    setState(newSoloGame());
    clearSelection();
    setError(undefined);
  };

  const isPlayPhase = state.phase === "play";
  const isDamagePhase = state.phase === "damage";
  const gameOver = state.phase === "won" || state.phase === "lost";

  const sumSelected = selectedCards.reduce((acc, c) => acc + attackValue(c), 0);
  const reqDamage = damageRequired(state);

  return (
    <Dialog
      fullScreen
      open
      onClose={onExit}
      TransitionComponent={Transition as any}
    >
      <AppBar
        sx={{
          background: theme.palette.mode === "dark" ? "#4a1a1f" : "#8a0d12",
          position: "relative",
        }}
      >
        <Toolbar>
          <RegicideLogo size={32} sx={{ marginRight: 8 }} />
          <Typography variant="h6" sx={{ flex: 1, color: "primary.main", fontWeight: 600 }}>
            Regicide — solo
          </Typography>
          <Button color="inherit" startIcon={<HelpOutlineIcon />} onClick={() => setShowHelp(true)} sx={{ mr: 1 }}>
            Rules
          </Button>
          <IconButton edge="end" color="inherit" onClick={onExit} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ p: 2 }}>
        <Stack spacing={2}>
          {/* Status row */}
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
            <Chip
              size="small"
              icon={<StyleIcon />}
              label={`Tavern ${state.tavern.length}`}
              sx={{ fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`Discard ${state.discard.length}`}
              sx={{ fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`Castle ${state.castle.length} left`}
              sx={{ fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`Jesters ${state.jesterFlipsRemaining}`}
              sx={{ fontWeight: 600 }}
            />
          </Stack>

          <EnemyDisplay state={state} />

          <SuitReminder enemyImmune={state.enemy.suit} />

          {/* Field — cards played against the enemy */}
          {state.field.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Played this fight
              </Typography>
              <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 1 }}>
                {state.field.map((c) => (
                  <PlayingCard key={c.id} card={c} size="sm" />
                ))}
              </Stack>
            </Box>
          )}

          {/* Phase banner */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: isDamagePhase ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.05)",
              border: "1px solid",
              borderColor: isDamagePhase ? "rgba(255,80,80,0.4)" : "rgba(255,255,255,0.12)",
            }}
          >
            {state.phase === "won" && (
              <Stack direction="row" spacing={1} alignItems="center">
                <EmojiEventsIcon color="primary" />
                <Typography variant="body1" sx={{ color: "primary.main", fontWeight: 700 }}>
                  Victory! All Kings defeated.
                </Typography>
              </Stack>
            )}
            {state.phase === "lost" && (
              <Stack direction="row" spacing={1} alignItems="center">
                <HeartBrokenIcon sx={{ color: "#ffb3b3" }} />
                <Typography variant="body1" sx={{ color: "#ffb3b3", fontWeight: 700 }}>
                  {state.message || "Defeated."}
                </Typography>
              </Stack>
            )}
            {isPlayPhase && (
              <Typography variant="body2" color="text.secondary">
                <strong>Step 1.</strong> Tap cards to select, then Play. Combos = same rank, total ≤ 10. Aces (Animals) pair with one card.
              </Typography>
            )}
            {isDamagePhase && (
              <Typography variant="body2" sx={{ color: "#ffb3b3" }}>
                <strong>Step 4.</strong> Discard cards totalling ≥ {reqDamage} to survive ({state.enemy.rank}{suitSymbol(state.enemy.suit)} attacks). Hand total: {handTotalValue(state)}.
              </Typography>
            )}
            {state.message && !gameOver && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {state.message}
              </Typography>
            )}
            {error && (
              <Typography variant="caption" sx={{ color: "#ffb3b3", display: "block", mt: 0.5 }}>
                {error}
              </Typography>
            )}
            {isPlayPhase && playPreview && !("error" in playPreview) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Selected attack: <strong>{playPreview.attack}</strong>
                {playPreview.suits.includes("clubs") && state.enemy.suit !== "clubs" && (
                  <> (clubs → {playPreview.attack * 2} damage)</>
                )}
                {" · suits: "}
                {playPreview.suits.map((s) => suitSymbol(s)).join(" ")}
              </Typography>
            )}
            {isPlayPhase && playPreview && "error" in playPreview && (
              <Typography variant="caption" sx={{ color: "#ffb3b3", display: "block", mt: 0.5 }}>
                {playPreview.error}
              </Typography>
            )}
            {isDamagePhase && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Selected total: <strong>{sumSelected}</strong> / {reqDamage} required.
              </Typography>
            )}
          </Box>

          {/* Hand */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Your hand ({state.hand.length}/8)
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                overflowX: "auto",
                pb: 1,
                pt: 1.5, // room for selected lift
              }}
            >
              {state.hand.map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  size="md"
                  selected={selected.has(c.id)}
                  onClick={gameOver ? undefined : () => toggle(c.id)}
                />
              ))}
              {state.hand.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Hand is empty.
                </Typography>
              )}
            </Stack>
          </Box>

          {/* Action buttons */}
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
            {isPlayPhase && (
              <>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={selectedCards.length === 0 || (playPreview != null && "error" in playPreview)}
                  onClick={doPlay}
                >
                  Play
                </Button>
                <Button variant="outlined" color="primary" onClick={doYield}>
                  Yield
                </Button>
                <Button
                  variant="outlined"
                  disabled={state.jesterFlipsRemaining <= 0}
                  onClick={doJester}
                >
                  Use Jester ({state.jesterFlipsRemaining})
                </Button>
              </>
            )}
            {isDamagePhase && (
              <Button
                variant="contained"
                color="primary"
                disabled={sumSelected < reqDamage}
                onClick={doSuffer}
              >
                Suffer {reqDamage} damage
              </Button>
            )}
            {selectedCards.length > 0 && !gameOver && (
              <Button variant="text" onClick={clearSelection}>
                Clear selection
              </Button>
            )}
            {gameOver && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={resetGame}
              >
                New game
              </Button>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <RegicideHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </Dialog>
  );
}

function RegicideHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <AppBar sx={{ position: "relative", background: "#4a1a1f" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1, color: "primary.main" }}>
            Regicide — quick rules
          </Typography>
          <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Typography variant="body2">
            Defeat the 12 royals (J → Q → K of each suit) in turn. On your turn:
          </Typography>
          <Typography variant="body2">
            <strong>Step 1.</strong> Play one card, an Ace (Animal) paired with one other card, or a combo of 2-4 cards of the same rank totalling ≤ 10. Or yield, or burn a Jester to discard hand + refill to 8.
          </Typography>
          <Typography variant="body2">
            <strong>Step 2.</strong> Suit powers (skipped if matching enemy suit):
            <br />♥ Heal — return N discarded cards to bottom of Tavern.
            <br />♦ Draw — draw up to N cards (hand cap 8).
            <br />♣ Double — damage dealt counts double.
            <br />♠ Shield — reduce enemy attack by N (sticky vs this enemy).
          </Typography>
          <Typography variant="body2">
            <strong>Step 3.</strong> Deal damage to the enemy. Card values:
            <br />A = 1, 2-10 = face, J = 10, Q = 15, K = 20.
          </Typography>
          <Typography variant="body2">
            <strong>Step 4.</strong> Enemy strikes. Discard cards totalling ≥ remaining attack. If you can't, you lose.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Solo mode: 2 Jester credits available (not in the deck). Each lets you discard hand and refill to 8. Win with 2 used = Bronze, 1 = Silver, 0 = Gold.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default RegicideGame;
