import React from "react";
import logo from "./yasa7.png";
import logolight from "./yasa7_light.png";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { StatsFullScreenDialog } from "./features/stats/StatsDialog";
import { ScoreEntryDialog } from "./features/rounds/scoreEntryDialog";
import Box from "@mui/material/Box";
import "./App.css";
import {
  IconButton,
  Stack,
  styled,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Menu from "./features/menu/menu";
import { PlayerRanking } from "./features/players/Ranking";
import { GameCreator } from "./features/game/GameCreator";
import { HomePage } from "./features/game/HomePage";
import { PlayCreator } from "./features/play/PlayCreator";
import { PlayTable } from "./features/play/PlayTable";
import { PlayPlayerRanking } from "./features/play/PlayPlayerRanking";
import { useSelector } from "react-redux";
import { RootState } from "./app/store";
import ScoresHistoryNew from "./features/rounds/ScoresHistoryNew";
import {
  SnackbarProvider,
  MaterialDesignContent,
} from "notistack";
import { ActionCreators } from "redux-undo";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { selectScoreState } from "./features/game/scoreSlice";
import { selectGameLength } from "./features/game/gameSlice";
import { isGameLengthMet } from "./features/game/gameLength";
import { selectPlayers } from "./features/players/playersSlice";
import { selectStatsWeight } from "./features/stats/statsSlice";
import { computeGameResults } from "./features/game/gameResults";
import { enqueueSnackbar } from "notistack";
import { useTheme } from "@mui/system";
import ServiceWorkerWrapper from "./serviceworkerWrapper";
import { ErrorBoundary } from "react-error-boundary";
import { RegicideProvider, useRegicide } from "./features/regicide/RegicideContext";
import { RegicideGame } from "./features/regicide/RegicideGame";
import { Flip7Provider, useFlip7 } from "./features/flip7/Flip7Context";
import { Flip7Game } from "./features/flip7/Flip7Game";
import {
  ActiveGame,
  GAMES,
  GameSelectionProvider,
  useGameSelection,
} from "./features/gameSelection/gameSelectionContext";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {
  const regicide = useRegicide();
  const flip7 = useFlip7();
  const { setActiveGame } = useGameSelection();
  const colorMode = React.useContext(ColorModeContext);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const gameView = useSelector((state: RootState) => state.game.view);
  const gameType = useSelector((state: RootState) => state.game.type);
  const dispatch = useAppDispatch();
  const scoreState = useAppSelector(selectScoreState);
  const gameLength = useAppSelector(selectGameLength);
  const trackerPlayers = useAppSelector(selectPlayers);
  const statsWeights = useAppSelector(selectStatsWeight);
  const theme = useTheme();

  // Score tracker: when the configured game length is reached, show
  // a one-time toast when the threshold transitions from not-met to met.
  const isScoreTracker =
    gameStatus === "started" && gameType !== "play" && gameView !== "play";
  const trackerRoundsPlayed = Math.max(0, scoreState.past.length - 1);
  const trackerHighestWeighted = React.useMemo(() => {
    if (!isScoreTracker) return 0;
    const rounds = [
      ...scoreState.past,
      { playerscores: [...scoreState.present.playerscores] },
    ];
    const results = computeGameResults(
      trackerPlayers,
      rounds,
      statsWeights,
    );
    return results.reduce(
      (best, r) => Math.max(best, r.weightedScore),
      0,
    );
  }, [
    isScoreTracker,
    scoreState.past,
    scoreState.present,
    trackerPlayers,
    statsWeights,
  ]);
  const trackerGameOver =
    isScoreTracker &&
    isGameLengthMet(gameLength, trackerRoundsPlayed, trackerHighestWeighted);
  const trackerNotifiedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isScoreTracker) {
      trackerNotifiedRef.current = false;
      return;
    }
    if (trackerGameOver && !trackerNotifiedRef.current) {
      trackerNotifiedRef.current = true;
      enqueueSnackbar(
        "Game length reached. Score entry disabled — review stats.",
        { variant: "info", autoHideDuration: 6000 },
      );
    }
    if (!trackerGameOver) {
      trackerNotifiedRef.current = false;
    }
  }, [isScoreTracker, trackerGameOver]);

  // Safety net: if the persisted state somehow lands in a combination that
  // renders nothing (e.g. after a data-shape change that our migration missed),
  // clear local storage and reload so the user sees the fresh home screen.
  const validRender =
    gameStatus === "home" ||
    (gameStatus === "new" &&
      (gameType === "unranked" || gameType === "play")) ||
    (gameStatus === "started" &&
      (gameView === "classic" || gameView === "new" || gameView === "play"));

  React.useEffect(() => {
    if (!validRender) {
      try {
        localStorage.removeItem("persist:root");
      } catch {
        /* ignore */
      }
      window.location.reload();
    }
  }, [validRender]);

  return (
    <Stack
      direction="column"
      alignItems="center"
      sx={{
        height: "100vh",
        overflowY: "auto",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <ServiceWorkerWrapper />
      {regicide.open && (
        <RegicideGame
          onExit={() => {
            regicide.setOpen(false);
            setActiveGame("yasat");
          }}
        />
      )}
      {flip7.open && (
        <Flip7Game
          onExit={() => {
            flip7.setOpen(false);
            setActiveGame("yasat");
          }}
        />
      )}
      {gameStatus === "started" && gameView === "classic" && (
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo"
          alt="logo"
        />
      )}

      {gameStatus === "home" && <HomePage />}

      {gameStatus === "new" && gameType === "unranked" && <GameCreator />}
      {gameStatus === "new" && gameType === "play" && <PlayCreator />}

      {gameStatus === "started" && gameView === "classic" && (
        <ScoresHistoryNew />
      )}

      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        {gameStatus === "started" && gameView === "new" && gameType !== "play" && <PlayerRanking />}
        {gameStatus === "started" && gameView === "new" && gameType === "play" && <PlayPlayerRanking />}
        {gameStatus === "started" && gameView === "play" && <PlayTable />}
      </ErrorBoundary>

      <AppBar
        position="fixed"
        sx={{
          background: "#424242",
          color: "primary",
          top: "auto",
          bottom: 0,
        }}
      >
        <Toolbar>
          <Menu toggleColorMode={colorMode.toggleColorMode} />
          
          {gameView !== "play" && gameType !== "play" && (
            <ScoreEntryDialog disabled={trackerGameOver} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {gameStatus === "started" && gameView !== "play" && gameType !== "play" && (
            <>
              <IconButton
                disabled={scoreState.past.length < 2}
                onClick={() => dispatch(ActionCreators.undo())}
                color="secondary"
                sx={{
                  ":disabled": {
                    bgcolor: "#585858",
                  },
                  ":hover": {
                    bgcolor: "#585858",
                  },
                  ":active": {
                    bgcolor: "#585858",
                  },
                  ":focus": {
                    bgcolor: "#585858",
                  },
                  bgcolor: "#585858",
                  width: 45,
                  height: 45,
                  position: "absolute",
                  zIndex: 2,
                  top: -15,
                  left: -110,
                  right: 0,
                  margin: "0 auto",
                }}
              >
                <UndoIcon />
              </IconButton>

              <IconButton
                disabled={scoreState.future.length === 0}
                onClick={() => dispatch(ActionCreators.redo())}
                color="secondary"
                sx={{
                  ":disabled": {
                    bgcolor: "#585858",
                  },
                  ":hover": {
                    bgcolor: "#585858",
                  },
                  ":active": {
                    bgcolor: "#585858",
                  },
                  ":focus": {
                    bgcolor: "#585858",
                  },
                  bgcolor: "#585858",
                  width: 45,
                  height: 45,
                  position: "absolute",
                  zIndex: 2,
                  top: -15,
                  left: 0,
                  right: -110,
                  margin: "0 auto",
                }}
              >
                <RedoIcon />
              </IconButton>

              {gameView === "classic" && <StatsFullScreenDialog />}
            </>
          )}
        </Toolbar>
      </AppBar>
    </Stack>
  );
}

export default function ToggleColorMode() {
  const [mode, setMode] = React.useState<"light" | "dark">("dark");
  const [activeGame, setActiveGame] = React.useState<ActiveGame>("yasat");
  const colorMode = React.useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
      },
    }),
    []
  );
  const gameSelection = React.useMemo(
    () => ({ activeGame, setActiveGame }),
    [activeGame]
  );
  // Different colors for light and dark mode
  const theme = React.useMemo(() => {
    const def = GAMES[activeGame];
    const primaryMain = mode === "light" ? def.lightColor : def.darkColor;
    return createTheme({
      palette: {
        mode,
        primary: { main: primaryMain },
        secondary: { main: "#f50057" },
      },
    });
  }, [mode, activeGame]);

  // Customized Material Design Snackbar

  const snackbarColor =
    mode === "light"
      ? GAMES[activeGame].lightColor
      : GAMES[activeGame].darkColor;
  const StyledMaterialDesignContent = styled(MaterialDesignContent)(() => ({
    "&.notistack-MuiContent-info": {
      backgroundColor: snackbarColor,
      color: "#424242",
    },
  }));

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <SnackbarProvider
          maxSnack={3}
          Components={{
            info: StyledMaterialDesignContent,
          }}
        >
          <GameSelectionProvider value={gameSelection}>
            <RegicideProvider>
              <Flip7Provider>
                <App />
              </Flip7Provider>
            </RegicideProvider>
          </GameSelectionProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

