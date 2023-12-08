import React from 'react';
import logo from './yasa7.png';
import { Counter } from './features/counter/Counter';
import { useTheme, ThemeProvider, createTheme } from '@mui/material/styles';
import { StatsFullScreenDialog } from './features/stats/StatsDialog'
// import { ScoreHistory, } from './features/rounds/ScoreHistory';
import { PlayerList } from './features/players/Players';
import { ScoreEntryDialog } from './features/rounds/scoreEntryDialog';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Box from '@mui/material/Box';
import './App.css';
import { Grid, Stack} from '@mui/material';
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Menu from './features/menu/menu';
import { NewGameStepper } from './features/game/newgame';
import { useSelector } from 'react-redux';
import { RootState } from './app/store';
import { ScoreHistory } from './features/rounds/ScoreHistory';
import ScoresHistoryNew from './features/rounds/ScoresHistoryNew';
import { SnackbarProvider } from 'notistack';
const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {

  const theme = useTheme();
  const colorMode = React.useContext(ColorModeContext);
  const gameStatus = useSelector((state: RootState) => state.game.status)
  
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

      {gameStatus === 'new' && 
      <PlayerList/>
      }
           
      {gameStatus === 'started' && 
      <ScoresHistoryNew/>
      }
      {/* <Counter/> */}

      <Grid item>
        <AppBar  position="fixed" color="default" sx={{background:"#424242", color:"#7df3e1", top: "auto", bottom: 0 }}>
          <Toolbar>
            <Menu/>
            <ScoreEntryDialog/>
            <Box sx={{ flexGrow: 1 }} />
            {gameStatus === "started" &&
            <StatsFullScreenDialog/>
            }
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
  const [mode, setMode] = React.useState<'dark' | 'light'>('dark');
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
        <SnackbarProvider maxSnack={3}>
          <App />
        </SnackbarProvider>
      </ThemeProvider>
        
    </ColorModeContext.Provider>


  );
}
