import React, { useState } from 'react';
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
} from '@mui/material';
import Circle from '@uiw/react-color-circle';
import Wheel from '@uiw/react-color-wheel';
import { hsvaToHex } from '@uiw/color-convert';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  checkUsernameExists,
  getSecurityQuestion,
} from './playerService';
import {
  verifyIdentity,
  registerIdentity,
  selectIdentityStatus,
  selectIdentityError,
  clearError,
} from './identitySlice';

type Step = 'username' | 'register' | 'verify';

interface IdentityDialogProps {
  open: boolean;
  onClose: () => void;
}

const SECURITY_QUESTIONS = [
  'What is your favourite food?',
  'What is the name of your first pet?',
  'What city were you born in?',
  'What is your favourite movie?',
  'What is your nickname among friends?',
];

const DEFAULT_COLORS = [
  '#F44E3B',
  '#FE9200',
  '#FCDC00',
  '#6495ED',
  '#673AB7',
  '#F60AF2',
  '#37D67A',
  '#F47373',
  '#B3E1D8',
];

export const IdentityDialog: React.FC<IdentityDialogProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectIdentityStatus);
  const error = useAppSelector(selectIdentityError);

  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [returnQuestion, setReturnQuestion] = useState('');
  const [localError, setLocalError] = useState('');
  const [checking, setChecking] = useState(false);
  const [color, setColor] = useState('#7df3e1');
  const [hsva, setHsva] = useState({ h: 171, s: 48, v: 95, a: 1 });

  const resetForm = () => {
    setStep('username');
    setUsername('');
    setDisplayName('');
    setSecurityQuestion(SECURITY_QUESTIONS[0]);
    setSecurityAnswer('');
    setReturnQuestion('');
    setLocalError('');
    setColor('#7df3e1');
    setHsva({ h: 171, s: 48, v: 95, a: 1 });
    dispatch(clearError());
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCheckUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setLocalError('Please enter a username');
      return;
    }
    if (trimmed.length < 2) {
      setLocalError('Username must be at least 2 characters');
      return;
    }

    setLocalError('');
    setChecking(true);
    try {
      const exists = await checkUsernameExists(trimmed);
      if (exists) {
        // Returning player — fetch their security question
        const question = await getSecurityQuestion(trimmed);
        setReturnQuestion(question);
        setStep('verify');
      } else {
        // New player — go to registration
        setDisplayName(trimmed);
        setStep('register');
      }
    } catch {
      setLocalError('Could not connect to server. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim()) {
      setLocalError('Please enter a display name');
      return;
    }
    if (!securityAnswer.trim()) {
      setLocalError('Please answer the security question');
      return;
    }

    setLocalError('');
    const result = await dispatch(
      registerIdentity({
        username: username.trim(),
        displayName: displayName.trim(),
        securityQuestion,
        securityAnswer: securityAnswer.trim(),
        color,
      })
    );

    if (registerIdentity.fulfilled.match(result)) {
      handleClose();
    }
  };

  const handleVerify = async () => {
    if (!securityAnswer.trim()) {
      setLocalError('Please enter your answer');
      return;
    }

    setLocalError('');
    const result = await dispatch(
      verifyIdentity({
        username: username.trim(),
        answer: securityAnswer.trim(),
      })
    );

    if (verifyIdentity.fulfilled.match(result)) {
      handleClose();
    }
  };

  const isLoading = status === 'loading' || checking;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      {step === 'username' && (
        <>
          <DialogTitle sx={{ color: '#7df3e1' }}>Enter username</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              <Typography variant="body2" color="text.secondary">
                Enter your username to continue. If you're new, you'll be asked to set up a security question.
              </Typography>
              <TextField
                autoFocus
                label="Username"
                fullWidth
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckUsername()}
                disabled={isLoading}
                inputProps={{ maxLength: 30 }}
              />
              {(localError || error) && (
                <Alert severity="error">{localError || error}</Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleCheckUsername}
              variant="contained"
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
            >
              Continue
            </Button>
          </DialogActions>
        </>
      )}

      {step === 'register' && (
        <>
          <DialogTitle sx={{ color: '#7df3e1' }}>Welcome, new player!</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              <Typography variant="body2" color="text.secondary">
                Username <strong>{username}</strong> is available. Set up your profile:
              </Typography>
              <TextField
                label="Display Name"
                fullWidth
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
                inputProps={{ maxLength: 30 }}
              />
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  variant="circular"
                  sx={{
                    width: 55,
                    height: 55,
                    fontSize: '22px',
                    bgcolor: color,
                  }}
                >
                  {displayName.slice(0, 2).toUpperCase()}
                </Avatar>
                <Typography variant="body2" color="text.secondary">
                  Pick your colour
                </Typography>
              </Stack>
              <Box>
                <Circle
                  colors={DEFAULT_COLORS}
                  color={color}
                  onChange={(c) => {
                    setColor(c.hex);
                  }}
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
                disabled={isLoading}
                SelectProps={{ native: true }}
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </TextField>
              <TextField
                label="Your Answer"
                fullWidth
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                disabled={isLoading}
                helperText="Remember this — you'll need it to verify your identity later"
                inputProps={{ maxLength: 100 }}
              />
              {(localError || error) && (
                <Alert severity="error">{localError || error}</Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setStep('username'); setSecurityAnswer(''); }}>Back</Button>
            <Button
              onClick={handleRegister}
              variant="contained"
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
            >
              Register
            </Button>
          </DialogActions>
        </>
      )}

      {step === 'verify' && (
        <>
          <DialogTitle sx={{ color: '#7df3e1' }}>Welcome back!</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              <Typography variant="body2" color="text.secondary">
                To verify you are <strong>{username}</strong>, please answer your security question:
              </Typography>
              <Typography variant="subtitle1" fontWeight="bold">
                {returnQuestion}
              </Typography>
              <TextField
                autoFocus
                label="Your Answer"
                fullWidth
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                disabled={isLoading}
                inputProps={{ maxLength: 100 }}
              />
              {(localError || error) && (
                <Alert severity="error">{localError || error}</Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setStep('username'); setSecurityAnswer(''); dispatch(clearError()); }}>Back</Button>
            <Button
              onClick={handleVerify}
              variant="contained"
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
            >
              Verify
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
