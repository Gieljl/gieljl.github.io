import React from 'react';
import logo from './yasa7.png';
import { useTheme, ThemeProvider, createTheme } from '@mui/material/styles';
import { StatsFullScreenDialog } from './features/stats/StatsDialog'

import { ScoreHistory } from './features/rounds/ScoreHistory';
import { ScoreEntryDialog } from './features/rounds/scoreEntryDialog';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Box from '@mui/material/Box';
import './App.css';
import { Avatar, AvatarGroup, Badge, Grid, Stack, styled } from '@mui/material';
import { deepOrange, deepPurple, indigo, yellow, teal } from '@mui/material/colors';
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Menu from './features/menu/menu';



const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {

  const theme = useTheme();
  const colorMode = React.useContext(ColorModeContext);
  
  return (
    <Stack
      direction="column"
      alignItems="center"
      sx={{
        height: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
        color: 'text.primary',
      }}
    >
      <img src={logo} className="App-logo" alt="logo" />

      <Stack direction="row" spacing={4} mt={2} mb={3}>
        <Badge badgeContent={22} color="primary">
          <Avatar sx={{ bgcolor: teal[500] }}>P1</Avatar>
        </Badge>
        <Badge badgeContent={22} color="primary">
          <Avatar sx={{ bgcolor: deepOrange[500] }}>P2</Avatar>
        </Badge>
        <Badge badgeContent={22} color="primary">
          <Avatar sx={{ bgcolor: yellow[500] }}>P3</Avatar>
        </Badge>
        <Badge badgeContent={65} color="success">
          <Avatar sx={{ bgcolor: deepPurple[500] }}>P4</Avatar>
        </Badge>
        <Badge badgeContent={99} color="error">
        < Avatar sx={{ bgcolor: indigo[500] }}>P5</Avatar>
        </Badge>
      </Stack>

      <ScoreHistory/>

      <Grid item>
        <AppBar  position="fixed" color="default" sx={{background:"#424242", color:"#7df3e1", top: "auto", bottom: 0 }}>
          <Toolbar>
            <Menu/>
            <ScoreEntryDialog/>
            <Box sx={{ flexGrow: 1 }} />
            <StatsFullScreenDialog/>
            <IconButton sx={{ ml: 1 }} onClick={colorMode.toggleColorMode} color="inherit">
            {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Toolbar>
        </AppBar>
      </Grid>
      
    </Stack>
    
  );
}

export default function ToggleColorMode() {
  const [mode, setMode] = React.useState<'light' | 'dark'>('light');
  const colorMode = React.useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
      },
    }),
    [],
  );

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
