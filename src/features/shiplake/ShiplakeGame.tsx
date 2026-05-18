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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slide,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import Alert from "@mui/material/Alert";
import CloseIcon from "@mui/icons-material/Close";
import CasinoIcon from "@mui/icons-material/Casino";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import { TransitionProps } from "notistack";
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CategoryGroupId,
  CategoryId,
  DiceRoll,
  FillRecord,
  MODIFIERS,
  ModifierAssignment,
  ModifierId,
  ScoreSheet,
  bonus,
  botPickHold,
  botPickTarget,
  computeCreditsWithRules,
  isSheetComplete,
  lowerSubtotal,
  rerollMask,
  resolveRuleset,
  rollDice,
  rollDie,
  scoreCategory,
  sheetsFromFills,
  totalCells,
  totalCredits,
  totalScore,
  upperSubtotal,
} from "./shiplakeEngine";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface Player {
  name: string;
  isBot: boolean;
}

type Phase = "setup" | "modifiers" | "playing" | "finished";

const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function Die({
  value,
  held,
  onClick,
  big = false,
}: {
  value: number;
  held: boolean;
  onClick?: () => void;
  big?: boolean;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        width: big ? 56 : 44,
        height: big ? 56 : 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 1.5,
        border: held ? "3px solid" : "2px solid #555",
        borderColor: held ? "primary.main" : undefined,
        backgroundColor: held ? "rgba(125,243,225,0.18)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        fontSize: big ? 38 : 30,
        userSelect: "none",
        transition: "all 0.15s ease",
      }}
    >
      {DIE_FACES[value - 1]}
    </Box>
  );
}

export function ShiplakeGame({ onExit }: { onExit: () => void }) {
  const theme = useTheme();
  const [phase, setPhase] = React.useState<Phase>("setup");
  const [numBots, setNumBots] = React.useState(1);
  const [numSets, setNumSets] = React.useState(3);
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [ruleset, setRuleset] = React.useState<ModifierAssignment[]>([]);

  // Game state
  const [fills, setFills] = React.useState<FillRecord[]>([]);
  const [turn, setTurn] = React.useState(0);
  const [currentPlayer, setCurrentPlayer] = React.useState(0);
  const [dice, setDice] = React.useState<DiceRoll>([1, 1, 1, 1, 1] as DiceRoll);
  const [hold, setHold] = React.useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [rollsLeft, setRollsLeft] = React.useState(3);
  const [hasRolled, setHasRolled] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);
  const [gambleNotice, setGambleNotice] = React.useState<string | null>(null);

  const sheets = React.useMemo(
    () => sheetsFromFills(fills, numSets, players.length),
    [fills, numSets, players.length],
  );

  const goToModifiers = () => {
    const ps: Player[] = [{ name: "You", isBot: false }];
    for (let i = 0; i < numBots; i++) {
      ps.push({ name: `Bot ${i + 1}`, isBot: true });
    }
    setPlayers(ps);
    setPhase("modifiers");
  };

  const startGame = () => {
    setFills([]);
    setTurn(0);
    setCurrentPlayer(0);
    setDice([1, 1, 1, 1, 1] as DiceRoll);
    setHold([false, false, false, false, false]);
    setRollsLeft(3);
    setHasRolled(false);
    setPhase("playing");
  };

  const isBotTurn = players[currentPlayer]?.isBot ?? false;

  const advanceTurn = React.useCallback(
    (newFills: FillRecord[]) => {
      // Game over: every cell across all sets filled.
      if (newFills.length >= totalCells(numSets, players.length)) {
        setPhase("finished");
        return;
      }
      const next = (currentPlayer + 1) % players.length;
      setCurrentPlayer(next);
      setTurn((t) => t + 1);
      setDice([1, 1, 1, 1, 1] as DiceRoll);
      setHold([false, false, false, false, false]);
      setRollsLeft(3);
      setHasRolled(false);
    },
    [currentPlayer, players.length, numSets],
  );

  const fillCell = React.useCallback(
    (
      setIndex: number,
      cat: CategoryId,
      crossOut: boolean,
      diceUsed: DiceRoll,
      playerIdx: number,
      turnIdx: number,
    ) => {
      const value = crossOut ? null : scoreCategory(diceUsed, cat);
      const mods = resolveRuleset(ruleset)[cat];
      const hasFullCG = mods.includes("fullCaptainsGamble");
      const hasSmallCG = mods.includes("smallCaptainsGamble");
      let gambleEyes: number | undefined;
      if (hasFullCG || hasSmallCG) {
        gambleEyes = rollDie();
        const parts: string[] = [];
        if (hasFullCG) parts.push(`Full CG +${gambleEyes}`);
        if (hasSmallCG) parts.push(`Small CG +${gambleEyes > 3 ? 1 : 0}`);
        setGambleNotice(
          `🎲 Captain's Gamble rolled ${gambleEyes} — ${parts.join(", ")}`,
        );
      }
      const newFills: FillRecord[] = [
        ...fills,
        {
          setIndex,
          category: cat,
          player: playerIdx,
          turn: turnIdx,
          value,
          gambleEyes,
        },
      ];
      setFills(newFills);
      advanceTurn(newFills);
    },
    [fills, advanceTurn, ruleset],
  );

  const handleHumanScore = (setIndex: number, cat: CategoryId) => {
    if (isBotTurn || !hasRolled) return;
    const sheet = sheets[setIndex][currentPlayer];
    if (sheet[cat] !== undefined) return;
    const preview = scoreCategory(dice, cat);
    if (preview === 0) {
      if (
        !window.confirm(
          `Cross out ${CATEGORIES.find((c) => c.id === cat)?.label} in Set ${
            setIndex + 1
          }? (0 points)`,
        )
      )
        return;
      fillCell(setIndex, cat, true, dice, currentPlayer, turn);
    } else {
      fillCell(setIndex, cat, false, dice, currentPlayer, turn);
    }
  };

  const rollNow = () => {
    if (rollsLeft <= 0) return;
    if (!hasRolled) {
      setDice(rollDice(5) as DiceRoll);
      setHasRolled(true);
    } else {
      setDice(rerollMask(dice, hold));
    }
    setRollsLeft(rollsLeft - 1);
  };

  // Bot driver
  React.useEffect(() => {
    if (phase !== "playing") return;
    if (!isBotTurn) return;

    let cancelled = false;
    const run = async () => {
      let curDice: DiceRoll = rollDice(5) as DiceRoll;
      if (cancelled) return;
      setDice(curDice);
      setHasRolled(true);
      setRollsLeft(2);
      await wait(700);

      for (let r = 0; r < 2; r++) {
        if (cancelled) return;
        const holdMask = botPickHold(curDice, currentPlayer, sheets);
        setHold(holdMask);
        await wait(450);
        if (holdMask.every((h) => h)) break;
        curDice = rerollMask(curDice, holdMask);
        setDice(curDice);
        setRollsLeft(1 - r);
        await wait(700);
      }

      if (cancelled) return;
      const target = botPickTarget(curDice, currentPlayer, sheets);
      const val = scoreCategory(curDice, target.cat);
      const mods = resolveRuleset(ruleset)[target.cat];
      const hasFullCG = mods.includes("fullCaptainsGamble");
      const hasSmallCG = mods.includes("smallCaptainsGamble");
      let gambleEyes: number | undefined;
      if (hasFullCG || hasSmallCG) {
        gambleEyes = rollDie();
        setGambleNotice(
          `🎲 ${players[currentPlayer].name}'s Captain's Gamble: ${gambleEyes}`,
        );
      }
      const newFills: FillRecord[] = [
        ...fills,
        {
          setIndex: target.setIndex,
          category: target.cat,
          player: currentPlayer,
          turn,
          value: val === 0 ? null : val,
          gambleEyes,
        },
      ];
      await wait(450);
      if (cancelled) return;
      setFills(newFills);
      advanceTurn(newFills);
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentPlayer, isBotTurn]);

  const credits = React.useMemo(() => {
    if (phase !== "finished") return null;
    const awards = computeCreditsWithRules({
      fills,
      numSets,
      numPlayers: players.length,
      ruleset,
    });
    const totals = totalCredits(awards, players.length);
    return { awards, totals };
  }, [phase, fills, numSets, players.length, ruleset]);

  return (
    <Dialog
      fullScreen
      open
      onClose={onExit}
      TransitionComponent={Transition as any}
    >
      <AppBar
        sx={{
          background: theme.palette.mode === "dark" ? "#1a3a4a" : "#0d6e8a",
          position: "relative",
        }}
      >
        <Toolbar>
          <CasinoIcon sx={{ mr: 1 }} />
          <Typography
            variant="h6"
            sx={{ flex: 1, color: "primary.main", fontWeight: 600 }}
          >
            Shiplake — the game of ship masters
          </Typography>
          <Button
            color="inherit"
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
        {phase === "setup" && (
          <SetupView
            numBots={numBots}
            setNumBots={setNumBots}
            numSets={numSets}
            setNumSets={setNumSets}
            onNext={goToModifiers}
          />
        )}

        {phase === "modifiers" && (
          <ModifiersView
            numSets={numSets}
            ruleset={ruleset}
            setRuleset={setRuleset}
            onBack={() => setPhase("setup")}
            onStart={startGame}
          />
        )}

        {phase === "playing" && (
          <PlayingView
            players={players}
            sheets={sheets}
            numSets={numSets}
            currentPlayer={currentPlayer}
            dice={dice}
            hold={hold}
            setHold={setHold}
            rollsLeft={rollsLeft}
            hasRolled={hasRolled}
            isBotTurn={isBotTurn}
            ruleset={ruleset}
            onRoll={rollNow}
            onScore={handleHumanScore}
          />
        )}

        {phase === "finished" && credits && (
          <FinishedView
            players={players}
            sheets={sheets}
            awards={credits.awards}
            totals={credits.totals}
            onRestart={() => setPhase("setup")}
            onExit={onExit}
          />
        )}
      </DialogContent>

      <RulesDialog open={showHelp} onClose={() => setShowHelp(false)} />
      <Snackbar
        open={!!gambleNotice}
        autoHideDuration={3500}
        onClose={() => setGambleNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="info" onClose={() => setGambleNotice(null)}>
          {gambleNotice}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Setup ----------

function SetupView({
  numBots,
  setNumBots,
  numSets,
  setNumSets,
  onNext,
}: {
  numBots: number;
  setNumBots: (n: number) => void;
  numSets: number;
  setNumSets: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 420, mx: "auto", mt: 3 }}>
      <Typography variant="h5" sx={{ color: "primary.main" }}>
        Welcome aboard, ship master!
      </Typography>
      <Typography variant="body2">
        Shiplake is a Yahtzee-like dice game with a credit-based scoring system
        across multiple sets. Sets are played simultaneously — on each turn you
        choose which set's row to fill.
      </Typography>
      <FormControl fullWidth>
        <InputLabel>Bots</InputLabel>
        <Select
          value={numBots}
          label="Bots"
          onChange={(e) => setNumBots(Number(e.target.value))}
        >
          {[1, 2, 3].map((n) => (
            <MenuItem key={n} value={n}>
              {n} bot{n > 1 ? "s" : ""}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth>
        <InputLabel>Sets</InputLabel>
        <Select
          value={numSets}
          label="Sets"
          onChange={(e) => setNumSets(Number(e.target.value))}
        >
          {[1, 2, 3, 5].map((n) => (
            <MenuItem key={n} value={n}>
              {n} set{n > 1 ? "s" : ""}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button variant="contained" size="large" onClick={onNext}>
        Next: Choose Modifiers
      </Button>
    </Stack>
  );
}

// ---------- Modifiers ----------

type TargetKey = string; // `cat:<id>` | `grp:<id>`

function targetKeyToObj(key: TargetKey): ModifierAssignment["target"] {
  const [k, id] = key.split(":");
  if (k === "cat") return { kind: "category", id: id as CategoryId };
  return { kind: "group", id: id as CategoryGroupId };
}

function ModifiersView({
  numSets,
  ruleset,
  setRuleset,
  onBack,
  onStart,
}: {
  numSets: number;
  ruleset: ModifierAssignment[];
  setRuleset: (r: ModifierAssignment[]) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const [targetKey, setTargetKey] = React.useState<TargetKey>("cat:fullHouse");
  const [modifier, setModifier] = React.useState<ModifierId>("running");

  const addRule = () => {
    setRuleset([
      ...ruleset,
      { target: targetKeyToObj(targetKey), modifier },
    ]);
  };
  const removeRule = (idx: number) => {
    setRuleset(ruleset.filter((_, i) => i !== idx));
  };

  // Resolved per-category modifier list for the preview.
  const resolved = resolveRuleset(ruleset);

  const targetLabel = (t: ModifierAssignment["target"]) =>
    t.kind === "category"
      ? CATEGORIES.find((c) => c.id === t.id)?.label
      : CATEGORY_GROUPS[t.id].label;

  const modLabel = (id: ModifierId) =>
    MODIFIERS.find((m) => m.id === id)?.label ?? id;

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto", mt: 2 }}>
      <Typography variant="h5" sx={{ color: "primary.main" }}>
        Apply Rule Modifiers
      </Typography>
      <Typography variant="body2">
        The basic skeleton (1 credit per category, ±4 on total, +5 per Perfect
        set, +1 per Simple set) is always in place. You may add modifiers to a
        single category or a category group ({Object.values(CATEGORY_GROUPS)
          .map((g) => g.label)
          .join(", ")}
        ). Modifiers stack and are applied in order.
      </Typography>

      <Paper sx={{ p: 2 }} elevation={2}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Add a modifier
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Target</InputLabel>
            <Select
              label="Target"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value as string)}
            >
              <MenuItem disabled value="">
                <em>— Groups —</em>
              </MenuItem>
              {(Object.entries(CATEGORY_GROUPS) as [
                CategoryGroupId,
                { label: string; ids: CategoryId[] },
              ][]).map(([id, g]) => (
                <MenuItem key={`grp:${id}`} value={`grp:${id}`}>
                  Group: {g.label}
                </MenuItem>
              ))}
              <MenuItem disabled value="">
                <em>— Categories —</em>
              </MenuItem>
              {CATEGORIES.map((c) => (
                <MenuItem key={`cat:${c.id}`} value={`cat:${c.id}`}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Modifier</InputLabel>
            <Select
              label="Modifier"
              value={modifier}
              onChange={(e) => setModifier(e.target.value as ModifierId)}
            >
              <MenuItem disabled value="">
                <em>— Credit modifiers —</em>
              </MenuItem>
              {MODIFIERS.filter((m) => m.kind === "credit").map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
              <MenuItem disabled value="">
                <em>— Condition modifiers —</em>
              </MenuItem>
              {MODIFIERS.filter((m) => m.kind === "condition").map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={<AddCircleIcon />}
            onClick={addRule}
          >
            Add
          </Button>
        </Stack>
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1, opacity: 0.7 }}
        >
          {MODIFIERS.find((m) => m.id === modifier)?.description}
        </Typography>
      </Paper>

      <Paper sx={{ p: 2 }} elevation={2}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Active rules ({ruleset.length})
        </Typography>
        {ruleset.length === 0 ? (
          <Typography variant="body2" sx={{ opacity: 0.6 }}>
            No additional rules — playing the basic skeleton.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {ruleset.map((r, i) => (
              <Stack
                key={i}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ p: 0.5, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Typography variant="body2">
                  <b>{modLabel(r.modifier)}</b> on{" "}
                  {r.target.kind === "group" ? "group: " : ""}
                  {targetLabel(r.target)}
                </Typography>
                <IconButton size="small" onClick={() => removeRule(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 2 }} elevation={1}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Preview per category
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {CATEGORIES.map((c) => {
            const mods = resolved[c.id];
            return (
              <Chip
                key={c.id}
                size="small"
                label={`${c.label}${mods.length ? ": " + mods.join("+") : ""}`}
                color={mods.length ? "primary" : "default"}
                variant={mods.length ? "filled" : "outlined"}
              />
            );
          })}
        </Box>
      </Paper>

      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button onClick={onBack}>Back</Button>
        <Button variant="contained" size="large" onClick={onStart}>
          Set Sail ({numSets} set{numSets > 1 ? "s" : ""})
        </Button>
      </Stack>
    </Stack>
  );
}

// ---------- Playing ----------

function PlayingView({
  players,
  sheets,
  numSets,
  currentPlayer,
  dice,
  hold,
  setHold,
  rollsLeft,
  hasRolled,
  isBotTurn,
  ruleset,
  onRoll,
  onScore,
}: {
  players: Player[];
  sheets: ScoreSheet[][];
  numSets: number;
  currentPlayer: number;
  dice: DiceRoll;
  hold: boolean[];
  setHold: (h: boolean[]) => void;
  rollsLeft: number;
  hasRolled: boolean;
  isBotTurn: boolean;
  ruleset: ModifierAssignment[];
  onRoll: () => void;
  onScore: (setIndex: number, cat: CategoryId) => void;
}) {
  const toggleHold = (i: number) => {
    if (isBotTurn || !hasRolled) return;
    const h = hold.slice();
    h[i] = !h[i];
    setHold(h);
  };

  const resolved = resolveRuleset(ruleset);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap">
        <Typography variant="subtitle1" sx={{ color: "primary.main" }}>
          {players[currentPlayer].name}
          {isBotTurn ? " (thinking…)" : "'s turn"}
        </Typography>
        <Typography variant="subtitle2">Rolls left: {rollsLeft}</Typography>
      </Stack>

      <Paper sx={{ p: 2 }} elevation={2}>
        <Stack direction="row" spacing={1.5} justifyContent="center">
          {dice.map((d, i) => (
            <Die
              key={i}
              value={d}
              held={hasRolled && hold[i]}
              onClick={() => toggleHold(i)}
              big
            />
          ))}
        </Stack>
        <Stack direction="row" justifyContent="center" mt={2}>
          <Button
            variant="contained"
            disabled={isBotTurn || rollsLeft <= 0}
            onClick={onRoll}
            size="large"
          >
            {hasRolled ? `Reroll (${rollsLeft})` : "Roll"}
          </Button>
        </Stack>
        {hasRolled && !isBotTurn && (
          <Typography
            variant="caption"
            sx={{ display: "block", textAlign: "center", mt: 1 }}
          >
            Tap dice to hold. Click any open cell — in any set — to score.
          </Typography>
        )}
      </Paper>

      <BigScoreTable
        players={players}
        sheets={sheets}
        numSets={numSets}
        currentPlayer={currentPlayer}
        dice={dice}
        canScore={!isBotTurn && hasRolled}
        catModifiers={resolved}
        onScore={onScore}
      />
    </Stack>
  );
}

function BigScoreTable({
  players,
  sheets,
  numSets,
  currentPlayer,
  dice,
  canScore,
  catModifiers,
  onScore,
}: {
  players: Player[];
  sheets: ScoreSheet[][];
  numSets: number;
  currentPlayer: number;
  dice: DiceRoll;
  canScore: boolean;
  catModifiers: Record<CategoryId, ModifierId[]>;
  onScore: (setIndex: number, cat: CategoryId) => void;
}) {
  const cellSx = {
    border: "1px solid rgba(255,255,255,0.12)",
    p: 0.5,
    textAlign: "center" as const,
    fontSize: 12,
    minWidth: 36,
  };
  const headerSx = {
    ...cellSx,
    fontWeight: 600,
    background: "rgba(125,243,225,0.08)",
  };
  const labelSx = {
    ...cellSx,
    textAlign: "left" as const,
    fontWeight: 500,
    minWidth: 130,
  };

  return (
    <Paper sx={{ overflowX: "auto" }} elevation={2}>
      <Box component="table" sx={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <Box component="th" sx={labelSx}>
              Category
            </Box>
            <Box component="th" sx={headerSx}>
              Set
            </Box>
            {players.map((p, i) => (
              <Box
                key={i}
                component="th"
                sx={{
                  ...headerSx,
                  color: i === currentPlayer ? "primary.main" : undefined,
                }}
              >
                {p.name}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((c) => {
            const mods = catModifiers[c.id];
            const isUpperEnd = c.id === "sixes";
            return (
              <React.Fragment key={c.id}>
                {Array.from({ length: numSets }).map((_, si) => (
                  <tr key={`${c.id}-${si}`}>
                    {si === 0 && (
                      <Box
                        component="td"
                        rowSpan={numSets}
                        sx={{
                          ...labelSx,
                          verticalAlign: "middle",
                          background: si === 0 ? "rgba(255,255,255,0.02)" : undefined,
                        }}
                      >
                        <Stack spacing={0.25}>
                          <span>{c.label}</span>
                          {mods.length > 0 && (
                            <Box
                              sx={{
                                display: "flex",
                                gap: 0.25,
                                flexWrap: "wrap",
                              }}
                            >
                              {mods.map((m, mi) => (
                                <Chip
                                  key={mi}
                                  size="small"
                                  label={m}
                                  sx={{ fontSize: 9, height: 16 }}
                                />
                              ))}
                            </Box>
                          )}
                        </Stack>
                      </Box>
                    )}
                    <Box
                      component="td"
                      sx={{ ...cellSx, opacity: 0.6, fontSize: 11 }}
                    >
                      {si + 1}
                    </Box>
                    {players.map((_, pi) => {
                      const sheet = sheets[si][pi];
                      const v = sheet[c.id];
                      const isMe = pi === currentPlayer;
                      const open = v === undefined;
                      const preview =
                        isMe && canScore && open ? scoreCategory(dice, c.id) : null;
                      return (
                        <Box
                          key={pi}
                          component="td"
                          sx={{
                            ...cellSx,
                            cursor: isMe && canScore && open ? "pointer" : "default",
                            color:
                              v === null
                                ? "rgba(255,255,255,0.3)"
                                : preview !== null && preview > 0
                                ? "primary.main"
                                : undefined,
                            fontWeight:
                              preview !== null && preview > 0 ? 600 : 400,
                            background:
                              isMe && canScore && open
                                ? "rgba(125,243,225,0.05)"
                                : undefined,
                            "&:hover":
                              isMe && canScore && open
                                ? { background: "rgba(125,243,225,0.18)" }
                                : undefined,
                          }}
                          onClick={() => {
                            if (isMe && canScore && open) onScore(si, c.id);
                          }}
                        >
                          {v === null
                            ? "✗"
                            : v ?? (preview !== null ? preview : "")}
                        </Box>
                      );
                    })}
                  </tr>
                ))}
                {isUpperEnd && (
                  <tr>
                    <Box component="td" sx={{ ...labelSx, fontStyle: "italic" }}>
                      Upper subtotal / bonus
                    </Box>
                    <Box component="td" sx={cellSx} />
                    {players.map((_, pi) => {
                      const subs = sheets.map((s) => upperSubtotal(s[pi]));
                      const bons = sheets.map((s) => bonus(s[pi]));
                      return (
                        <Box
                          key={pi}
                          component="td"
                          sx={{ ...cellSx, fontStyle: "italic", fontSize: 11 }}
                        >
                          {subs.join("/")} (+{bons.reduce((a, b) => a + b, 0)})
                        </Box>
                      );
                    })}
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          <tr>
            <Box component="td" sx={{ ...labelSx, fontWeight: 600 }}>
              Lower subtotal
            </Box>
            <Box component="td" sx={cellSx} />
            {players.map((_, pi) => (
              <Box
                key={pi}
                component="td"
                sx={{ ...cellSx, fontWeight: 600, fontSize: 11 }}
              >
                {sheets.map((s) => lowerSubtotal(s[pi])).join("/")}
              </Box>
            ))}
          </tr>
          <tr>
            <Box
              component="td"
              sx={{ ...labelSx, fontWeight: 700, color: "primary.main" }}
            >
              TOTAL
            </Box>
            <Box component="td" sx={cellSx} />
            {players.map((_, pi) => (
              <Box
                key={pi}
                component="td"
                sx={{
                  ...cellSx,
                  fontWeight: 700,
                  color: "primary.main",
                  fontSize: 11,
                }}
              >
                {sheets
                  .map((s) => totalScore(s[pi]))
                  .join("/")}{" "}
                ={" "}
                <b>
                  {sheets.reduce(
                    (acc, s) => acc + totalScore(s[pi]),
                    0,
                  )}
                </b>
              </Box>
            ))}
          </tr>
        </tbody>
      </Box>
    </Paper>
  );
}

// ---------- Finished ----------

function FinishedView({
  players,
  sheets,
  awards,
  totals,
  onRestart,
  onExit,
}: {
  players: Player[];
  sheets: ScoreSheet[][];
  awards: ReturnType<typeof computeCreditsWithRules>;
  totals: number[];
  onRestart: () => void;
  onExit: () => void;
}) {
  const max = Math.max(...totals);
  const winners = players
    .map((p, i) => ({ p, i, t: totals[i] }))
    .filter((x) => x.t === max);

  const cellSx = {
    border: "1px solid rgba(255,255,255,0.12)",
    p: 0.75,
    textAlign: "center" as const,
    fontSize: 13,
  };
  const headerSx = {
    ...cellSx,
    fontWeight: 600,
    background: "rgba(125,243,225,0.08)",
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 760, mx: "auto", mt: 2 }}>
      <Typography variant="h4" sx={{ color: "primary.main", textAlign: "center" }}>
        🏆 {winners.map((w) => w.p.name).join(" & ")}{" "}
        win{winners.length > 1 ? "" : "s"}!
      </Typography>

      <Paper sx={{ overflowX: "auto" }} elevation={2}>
        <Box
          component="table"
          sx={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <Box component="th" sx={headerSx}>
                Category
              </Box>
              {players.map((p, i) => (
                <Box key={i} component="th" sx={headerSx}>
                  {p.name}
                </Box>
              ))}
              <Box component="th" sx={headerSx}>
                Detail
              </Box>
            </tr>
          </thead>
          <tbody>
            {awards.map((a, ai) => (
              <tr key={ai}>
                <Box component="td" sx={cellSx}>
                  {a.category}
                </Box>
                {a.perPlayer.map((c, i) => (
                  <Box
                    key={i}
                    component="td"
                    sx={{
                      ...cellSx,
                      color:
                        c > 0 ? "primary.main" : c < 0 ? "#f47373" : undefined,
                      fontWeight: c !== 0 ? 600 : 400,
                    }}
                  >
                    {c > 0 ? `+${c}` : c || ""}
                  </Box>
                ))}
                <Box
                  component="td"
                  sx={{ ...cellSx, fontStyle: "italic", fontSize: 11 }}
                >
                  {a.detail}
                </Box>
              </tr>
            ))}
            <tr>
              <Box
                component="td"
                sx={{ ...cellSx, fontWeight: 700, color: "primary.main" }}
              >
                TOTAL CREDITS
              </Box>
              {totals.map((t, i) => (
                <Box
                  key={i}
                  component="td"
                  sx={{
                    ...cellSx,
                    fontWeight: 700,
                    color: t === max ? "primary.main" : undefined,
                  }}
                >
                  {t}
                </Box>
              ))}
              <Box component="td" sx={cellSx} />
            </tr>
          </tbody>
        </Box>
      </Paper>

      <Typography variant="caption" sx={{ textAlign: "center", opacity: 0.6 }}>
        {sheets.length} set{sheets.length > 1 ? "s" : ""} played ·{" "}
        {sheets.every((s) => s.every((sh) => isSheetComplete(sh)))
          ? "all sheets complete"
          : "incomplete"}
      </Typography>

      <Stack direction="row" spacing={2} justifyContent="center">
        <Button variant="outlined" onClick={onRestart}>
          Play Again
        </Button>
        <Button variant="contained" onClick={onExit}>
          Return to Yasat
        </Button>
      </Stack>
    </Stack>
  );
}

// ---------- Rules popup ----------

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: "primary.main" }}>Shiplake — quick rules</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" component="div">
          <p>
            Each turn, roll 5 dice up to 3 times. Tap dice to hold them between
            rolls. After your final roll, click an open cell <b>in any set</b>{" "}
            to score (sets are played simultaneously).
          </p>
          <p>
            <b>Categories</b>:
          </p>
          <ul>
            <li>Ones–Sixes: sum of matching dice. Bonus 35 if upper ≥ 63.</li>
            <li>Three / Four of a Kind: sum of all dice if N alike.</li>
            <li>Full House: 25 (3+2 alike).</li>
            <li>Small / Large Straight: 30 / 40.</li>
            <li>Shiplake (5 alike): 50.</li>
            <li>Chance: sum of all dice.</li>
          </ul>
          <p>
            <b>Skeleton credits</b>: +1 to category leader, ±4 on Total, +5
            per Perfect set, +1 per Simple (burgerlijk) set.
          </p>
          <p>
            <b>Special end-of-game scoring</b>:
          </p>
          <ul>
            <li>
              <b>Perfect</b>: a set with 4+ of each upper number, 3-of-a-kind ≥
              27, 4-of-a-kind ≥ 29, full house, both straights, Shiplake, and
              chance ≥ 26 → +5 credits.
            </li>
            <li>
              <b>Simple (burgerlijk)</b>: a set where each upper number scores
              exactly 3-of-a-kind (3, 6, 9, 12, 15, 18) → +1 credit.
            </li>
          </ul>
          <p>
            <b>Modifiers</b> applied at game start to a category or group
            (Numbers, Specials, Standards, Odds, Evens). Credit modifiers
            (Casual / Double / Triple / Ultra / King / Nullify / Symmetric /
            Inverse) and Condition modifiers (Running, Lord, Longbow Running,
            Nuke, Streetwise, Strictly Streetwise, Full / Small Captain's
            Gamble) stack and apply in order.
          </p>
          <p>The ship master with the most credits wins!</p>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Got it</Button>
      </DialogActions>
    </Dialog>
  );
}

function _unused() {
  // Keep Tooltip import in case; suppresses unused warning if removed elsewhere.
  return Tooltip;
}
