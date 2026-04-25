import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  Avatar,
  Box,
} from "@mui/material";
import Circle from "@uiw/react-color-circle";
import Wheel from "@uiw/react-color-wheel";
import { hsvaToHex } from "@uiw/color-convert";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  checkUsernameExists,
  getSecurityQuestion,
  verifyPlayer,
  registerPlayer,
  PlayerProfile,
} from "../identity/playerService";
import { addPlayer, selectPlayers } from "./playersSlice";

type Step = "username" | "register" | "verify";

const SECURITY_QUESTIONS = [
  "What is your favourite food?",
  "What is the name of your first pet?",
  "What city were you born in?",
  "What is your favourite movie?",
  "What is your nickname among friends?",
];

const DEFAULT_COLORS = [
  "#F44E3B",
  "#FE9200",
  "#FCDC00",
  "#6495ED",
  "#673AB7",
  "#F60AF2",
  "#37D67A",
  "#F47373",
  "#B3E1D8",
];

export const RankedAddPlayerDialog: React.FC = () => {
  const dispatch = useAppDispatch();
  const players = useAppSelector(selectPlayers);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(
    SECURITY_QUESTIONS[0]
  );
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [returnQuestion, setReturnQuestion] = useState("");
  const [color, setColor] = useState("#7df3e1");
  const [hsva, setHsva] = useState({ h: 171, s: 48, v: 95, a: 1 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("username");
    setUsername("");
    setDisplayName("");
    setSecurityQuestion(SECURITY_QUESTIONS[0]);
    setSecurityAnswer("");
    setReturnQuestion("");
    setColor("#7df3e1");
    setHsva({ h: 171, s: 48, v: 95, a: 1 });
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    setOpen(false);
  };

  const addAndClose = (profile: PlayerProfile, chosenColor: string) => {
    if (players.some((p) => p.username === profile.username)) {
      setError("That player is already in the game.");
      return;
    }
    dispatch(
      addPlayer(
        profile.displayName,
        profile.color || chosenColor,
        profile.username
      )
    );
    handleClose();
  };

  const handleCheckUsername = async () => {
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError("Username must be at least 2 characters");
      return;
    }
    if (players.some((p) => p.username === trimmed.toLowerCase())) {
      setError("That player is already in the game.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const exists = await checkUsernameExists(trimmed);
      if (exists) {
        const question = await getSecurityQuestion(trimmed);
        setReturnQuestion(question);
        setStep("verify");
      } else {
        setDisplayName(trimmed);
        setStep("register");
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      setError("Please enter a display name");
      return;
    }
    if (!securityAnswer.trim()) {
      setError("Please answer the security question");
      return;
    }
    if (players.some((p) => p.color === color)) {
      setError("Color has to be unique! Use another color.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const profile = await registerPlayer(
        username.trim(),
        displayName.trim(),
        securityQuestion,
        securityAnswer.trim(),
        color
      );
      addAndClose(profile, color);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!securityAnswer.trim()) {
      setError("Please enter your answer");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const profile = await verifyPlayer(
        username.trim(),
        securityAnswer.trim()
      );
      if (!profile) {
        setError("Wrong answer. Please try again.");
        setLoading(false);
        return;
      }
      if (players.some((p) => p.color === (profile.color || ""))) {
        setError(
          `${profile.displayName}'s color matches another player. Please change one of their colors first.`
        );
        setLoading(false);
        return;
      }
      addAndClose(profile, profile.color || "#7df3e1");
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="contained"
        sx={{ height: 50, width: 180 }}
      >
        Add player
      </Button>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
        {step === "username" && (
          <>
            <DialogTitle sx={{ color: '#7df3e1' }}>Add player — enter username</DialogTitle>
            <DialogContent>
              <Stack spacing={2} mt={1}>
                <Typography variant="body2" color="text.secondary">
                  Enter this player's username. New players will register; returning players confirm with their security answer.
                </Typography>
                <TextField
                  autoFocus
                  label="Username"
                  fullWidth
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckUsername()}
                  disabled={loading}
                  inputProps={{ maxLength: 30 }}
                />
                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleCheckUsername}
                variant="contained"
                disabled={loading}
                startIcon={
                  loading ? <CircularProgress size={16} /> : undefined
                }
              >
                Continue
              </Button>
            </DialogActions>
          </>
        )}

        {step === "register" && (
          <>
            <DialogTitle sx={{ color: '#7df3e1' }}>New player — register</DialogTitle>
            <DialogContent>
              <Stack spacing={2} mt={1}>
                <Typography variant="body2" color="text.secondary">
                  Username <strong>{username}</strong> is available. Set up this player's profile:
                </Typography>
                <TextField
                  label="Display Name"
                  fullWidth
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                  inputProps={{ maxLength: 30 }}
                />
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar
                    variant="circular"
                    sx={{
                      width: 55,
                      height: 55,
                      fontSize: "22px",
                      bgcolor: color,
                    }}
                  >
                    {displayName.slice(0, 2).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" color="text.secondary">
                    Pick a color
                  </Typography>
                </Stack>
                <Box>
                  <Circle
                    colors={DEFAULT_COLORS}
                    color={color}
                    onChange={(c) => setColor(c.hex)}
                  />
                </Box>
                <Stack direction="row" justifyContent="center">
                  <Wheel
                    color={hsva}
                    onChange={(c) => {
                      setHsva(c.hsva);
                      setColor(hsvaToHex(c.hsva));
                    }}
                    width={140}
                    height={140}
                  />
                </Stack>
                <TextField
                  select
                  label="Security Question"
                  fullWidth
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                  disabled={loading}
                  SelectProps={{ native: true }}
                >
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </TextField>
                <TextField
                  label="Answer"
                  fullWidth
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  disabled={loading}
                  helperText="They'll need this to verify their identity later"
                  inputProps={{ maxLength: 100 }}
                />
                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setStep("username");
                  setSecurityAnswer("");
                  setError("");
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleRegister}
                variant="contained"
                disabled={loading}
                startIcon={
                  loading ? <CircularProgress size={16} /> : undefined
                }
              >
                Register & Add
              </Button>
            </DialogActions>
          </>
        )}

        {step === "verify" && (
          <>
            <DialogTitle sx={{ color: '#7df3e1' }}>Returning player — verify</DialogTitle>
            <DialogContent>
              <Stack spacing={2} mt={1}>
                <Typography variant="body2" color="text.secondary">
                  To add <strong>{username}</strong>, please answer their security question:
                </Typography>
                <Typography variant="subtitle1" fontWeight="bold">
                  {returnQuestion}
                </Typography>
                <TextField
                  autoFocus
                  label="Answer"
                  fullWidth
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  disabled={loading}
                  inputProps={{ maxLength: 100 }}
                />
                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setStep("username");
                  setSecurityAnswer("");
                  setError("");
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleVerify}
                variant="contained"
                disabled={loading}
                startIcon={
                  loading ? <CircularProgress size={16} /> : undefined
                }
              >
                Verify & Add
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
};

export default RankedAddPlayerDialog;
