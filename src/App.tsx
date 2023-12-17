import React from "react";
import logo from "./yasa7.png";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { StatsFullScreenDialog } from "./features/stats/StatsDialog";
import { PlayerList } from "./features/players/Players";
import { ScoreEntryDialog } from "./features/rounds/scoreEntryDialog";
import Box from "@mui/material/Box";
import "./App.css";
import { Grid, IconButton, Stack } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Menu from "./features/menu/menu";
import { useSelector } from "react-redux";
import { RootState } from "./app/store";
import ScoresHistoryNew from "./features/rounds/ScoresHistoryNew";
import { SnackbarProvider } from "notistack";
import { ActionCreators } from "redux-undo";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { selectScoreState } from "./features/game/scoreSlice";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {
  const colorMode = React.useContext(ColorModeContext);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const dispatch = useAppDispatch();
  const scoreState = useAppSelector(selectScoreState);

  return (
    <Stack
      direction="column"
      alignItems="center"
      sx={{
        height: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <img src={logo} className="App-logo" alt="logo" />

      {gameStatus === "new" && <PlayerList />}

      {gameStatus === "started" && <ScoresHistoryNew />}

      <Grid item>
        <AppBar
          position="fixed"
          sx={{
            background: "#424242",
            color: "#7df3e1",
            top: "auto",
            bottom: 0,
          }}
        >
          <Toolbar>
            <Menu toggleColorMode={colorMode.toggleColorMode} />

            <ScoreEntryDialog />
            <Box sx={{ flexGrow: 1 }} />
            {gameStatus === "started" && (
              <>
                <IconButton
                  disabled={scoreState.scores.past.length === 1}
                  onClick={() => dispatch(ActionCreators.undo())}
                  color="inherit"
                >
                  <UndoIcon />
                </IconButton>
                <IconButton
                  disabled={scoreState.scores.future.length === 0}
                  onClick={() => dispatch(ActionCreators.redo())}
                  color="inherit"
                >
                  <RedoIcon />
                </IconButton>
                <StatsFullScreenDialog />
              </>
            )}
          </Toolbar>
        </AppBar>
      </Grid>
    </Stack>
  );
}

export default function ToggleColorMode() {
  const [mode, setMode] = React.useState<"light" | "dark">("dark");
  const colorMode = React.useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
      },
    }),
    []
  );

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode]
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
