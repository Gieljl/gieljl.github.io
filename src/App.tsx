import React from 'react';
import logo from './yasa7.png';
import { Counter } from './features/counter/Counter';
import { useTheme, ThemeProvider, createTheme } from '@mui/material/styles';
import { DataGridDemo } from './features/stats/Stats'
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import './App.css';

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });






function App() {

  const theme = useTheme();
  const colorMode = React.useContext(ColorModeContext);

  return (
    <Box
      sx={{
        
        width: '100%',
        bgcolor: 'background.default',
        color: 'text.primary',
        borderRadius: 1,
        
      }}
        >
      <div className="App">  
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
        </header>
        <body className="App-body">
        <DataGridDemo />
        </body>
        <footer>
        {theme.palette.mode} mode
            <IconButton sx={{ ml: 1 }} onClick={colorMode.toggleColorMode} color="inherit">
              {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
        </footer>
      </div>
    </Box>
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
