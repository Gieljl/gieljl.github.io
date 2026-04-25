import React from 'react';
import {
  AppBar,
  Button,
  Dialog,
  IconButton,
  Slide,
  Stack,
  Toolbar,
  Typography,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { TransitionProps } from '@mui/material/transitions';
import { QRCodeSVG } from 'qrcode.react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectSessionCode, clearSession, setSharing } from './sessionSlice';
import { deleteSession } from './sessionService';
import { enqueueSnackbar } from 'notistack';

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface ShareGameDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ShareGameDialog: React.FC<ShareGameDialogProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch();
  const sessionCode = useAppSelector(selectSessionCode);
  const joinUrl = `https://yasat.nl?join=${sessionCode}`;

  const handleCopyCode = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode).then(() => {
        enqueueSnackbar('Code copied!', { variant: 'success', autoHideDuration: 1500 });
      });
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      enqueueSnackbar('Link copied!', { variant: 'success', autoHideDuration: 1500 });
    });
  };

  const handleStopSharing = async () => {
    if (sessionCode) {
      try {
        await deleteSession(sessionCode);
      } catch {
        // best effort
      }
    }
    dispatch(setSharing(false));
    dispatch(clearSession());
    onClose();
    enqueueSnackbar('Stopped sharing.', { variant: 'info', autoHideDuration: 2000 });
  };

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      TransitionComponent={Transition}
    >
      <AppBar sx={{ background: '#424242', color: '#7df3e1', position: 'relative' }}>
        <Toolbar>
          <IconButton edge="start" color="primary" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Share game
          </Typography>
        </Toolbar>
      </AppBar>

      <Stack
        direction="column"
        alignItems="center"
        spacing={3}
        sx={{ pt: 4, px: 2 }}
      >
        <Typography variant="body1" color="text.secondary" textAlign="center">
          Share this code or QR with others so they can watch the game live.
        </Typography>

        <Typography
          variant="h2"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 'bold',
            letterSpacing: 8,
            userSelect: 'all',
          }}
        >
          {sessionCode}
        </Typography>

        <Box sx={{ bgcolor: 'white', p: 2, borderRadius: 2 }}>
          <QRCodeSVG value={joinUrl} size={200} />
        </Box>

        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyCode}
          >
            Copy Code
          </Button>
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={handleCopyLink}
          >
            Copy Link
          </Button>
        </Stack>

        <Button
          variant="contained"
          color="error"
          startIcon={<StopCircleIcon />}
          onClick={handleStopSharing}
          sx={{ mt: 2 }}
        >
          Stop Sharing
        </Button>
      </Stack>
    </Dialog>
  );
};
