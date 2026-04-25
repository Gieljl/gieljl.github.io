import React from "react";
import logo from "./yasa7.png";
import logolight from "./yasa7_light.png";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { StatsFullScreenDialog } from "./features/stats/StatsDialog";
import { ScoreEntryDialog } from "./features/rounds/scoreEntryDialog";
import Box from "@mui/material/Box";
import "./App.css";
import {
  Button,
  IconButton,
  Stack,
  styled,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Menu from "./features/menu/menu";
import { PlayerRanking } from "./features/players/Ranking";
import { GameCreator } from "./features/game/GameCreator";
import { RankedGameCreator } from "./features/game/RankedGameCreator";
import { HomePage } from "./features/game/HomePage";
import { PlayCreator } from "./features/play/PlayCreator";
import { PlayTable } from "./features/play/PlayTable";
import { PlayPlayerRanking } from "./features/play/PlayPlayerRanking";
import { FriendsLobby } from "./features/playFriends/FriendsLobby";
import { usePlayFriendsHostSync } from "./features/playFriends/usePlayFriendsHostSync";
import { useActionRequestProcessor } from "./features/playFriends/useActionRequestProcessor";
import { usePlayFriendsSession } from "./features/playFriends/usePlayFriendsSession";
import {
  clearFriendsSession,
  selectPlayFriendsCode,
} from "./features/playFriends/playFriendsSlice";
import { setGameType } from "./features/game/gameSlice";
import { useSelector } from "react-redux";
import { RootState, store } from "./app/store";
import ScoresHistoryNew from "./features/rounds/ScoresHistoryNew";
import {
  SnackbarProvider,
  MaterialDesignContent,
} from "notistack";
import { ActionCreators } from "redux-undo";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ShareIcon from "@mui/icons-material/Share";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { selectScoreState } from "./features/game/scoreSlice";
import { selectGameLength } from "./features/game/gameSlice";
import { isGameLengthMet } from "./features/game/gameLength";
import { selectPlayers } from "./features/players/playersSlice";
import { selectStatsWeight } from "./features/stats/statsSlice";
import { computeRankedGameResults } from "./features/game/rankedStats";
import { enqueueSnackbar } from "notistack";
import { useTheme } from "@mui/system";
import ServiceWorkerWrapper from "./serviceworkerWrapper";
import { ErrorBoundary } from "react-error-boundary";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import { useEndRankedGame } from "./features/game/useEndRankedGame";
import { useSessionSync } from "./features/session/useSessionSync";
import { useSessionSubscription } from "./features/session/useSessionSubscription";
import {
  selectSessionRole,
  selectIsSharing,
  selectSessionCode,
  setRole,
  setSessionCode,
  setSharing,
} from "./features/session/sessionSlice";
import {
  generateSessionCode,
  createSession,
} from "./features/session/sessionService";
import { ShareGameDialog } from "./features/session/ShareGameDialog";
import { JoinGameDialog } from "./features/session/JoinGameDialog";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {
  const colorMode = React.useContext(ColorModeContext);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const gameView = useSelector((state: RootState) => state.game.view);
  const gameType = useSelector((state: RootState) => state.game.type);
  const dispatch = useAppDispatch();
  const scoreState = useAppSelector(selectScoreState);
  const gameLength = useAppSelector(selectGameLength);
  const rankedPlayers = useAppSelector(selectPlayers);
  const statsWeights = useAppSelector(selectStatsWeight);
  const theme = useTheme();
  const endRankedGame = useEndRankedGame();

  // Session state
  const sessionRole = useAppSelector(selectSessionRole);
  const isSharing = useAppSelector(selectIsSharing);
  const sessionCode = useAppSelector(selectSessionCode);
  const isViewer = sessionRole === "viewer";
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = React.useState(false);
  const [joinInitialCode, setJoinInitialCode] = React.useState("");

  // Mount session hooks
  useSessionSync();
  useSessionSubscription();
  // Mount Play vs Friends sync hooks (no-op when role is null).
  usePlayFriendsSession();
  usePlayFriendsHostSync();
  useActionRequestProcessor();

  const [friendsInitialJoinCode, setFriendsInitialJoinCode] =
    React.useState<string | null>(null);
  const friendsCode = useAppSelector(selectPlayFriendsCode);

  // Auto-clear stale friends session when we go fully home with no code-relevant
  // status. (Does nothing for active sessions because the slice has been
  // explicitly cleared by the leave/cancel flows.)
  React.useEffect(() => {
    if (gameStatus === "home" && friendsCode === null) {
      // already clean
      return;
    }
    if (gameStatus === "home" && gameType !== "play-friends") {
      dispatch(clearFriendsSession());
    }
  }, [gameStatus, gameType, friendsCode, dispatch]);

  // Handle ?join=XXXXXX URL parameter
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    const playCode = params.get("play");
    if (joinCode && joinCode.length === 6) {
      setJoinInitialCode(joinCode.toUpperCase());
      setJoinDialogOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (playCode && playCode.length === 6) {
      setFriendsInitialJoinCode(playCode.toUpperCase());
      dispatch(setGameType("play-friends"));
      dispatch({ type: "game/startNewGame" });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ranked / unranked game-length end detection. Compute on every change; show
  // a one-time toast when the threshold transitions from not-met to met.
  const isRankedOrUnranked =
    gameStatus === "started" && gameType !== "play" && gameType !== "play-friends" && gameView !== "play";
  const rankedRoundsPlayed = Math.max(0, scoreState.past.length - 1);
  const rankedHighestWeighted = React.useMemo(() => {
    if (!isRankedOrUnranked) return 0;
    const rounds = [
      ...scoreState.past,
      { playerscores: [...scoreState.present.playerscores] },
    ];
    const results = computeRankedGameResults(
      rankedPlayers,
      rounds,
      statsWeights,
    );
    return results.reduce(
      (best, r) => Math.max(best, r.weightedScore),
      0,
    );
  }, [
    isRankedOrUnranked,
    scoreState.past,
    scoreState.present,
    rankedPlayers,
    statsWeights,
  ]);
  const rankedGameOver =
    isRankedOrUnranked &&
    isGameLengthMet(gameLength, rankedRoundsPlayed, rankedHighestWeighted);
  const rankedNotifiedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isRankedOrUnranked) {
      rankedNotifiedRef.current = false;
      return;
    }
    if (rankedGameOver && !rankedNotifiedRef.current) {
      rankedNotifiedRef.current = true;
      enqueueSnackbar(
        "Game length reached. Score entry disabled — review stats.",
        { variant: "info", autoHideDuration: 6000 },
      );
    }
    if (!rankedGameOver) {
      rankedNotifiedRef.current = false;
    }
  }, [isRankedOrUnranked, rankedGameOver]);

  const handleShareGame = async () => {
    if (isSharing && sessionCode) {
      // Already sharing — just open the dialog
      setShareDialogOpen(true);
      return;
    }
    // Generate code and create session
    const code = generateSessionCode();
    try {
      const players = (store.getState() as RootState).players;
      const scores = (store.getState() as RootState).scores;
      const stats = (store.getState() as RootState).stats;
      const game = (store.getState() as RootState).game;
      await createSession(code, {
        players,
        scores: { present: scores.present, past: scores.past },
        stats,
        game,
      });
      dispatch(setSessionCode(code));
      dispatch(setRole("host"));
      dispatch(setSharing(true));
      setShareDialogOpen(true);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  // Safety net: if the persisted state somehow lands in a combination that
  // renders nothing (e.g. after a data-shape change that our migration missed),
  // clear local storage and reload so the user sees the fresh home screen.
  const validRender =
    gameStatus === "home" ||
    (gameStatus === "new" &&
      (gameType === "unranked" || gameType === "ranked" || gameType === "play" || gameType === "play-friends")) ||
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
      {gameStatus === "started" && gameView === "classic" && (
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo"
          alt="logo"
        />
      )}

      {gameStatus === "home" && <HomePage />}

      {gameStatus === "new" && gameType === "unranked" && <GameCreator />}
      {gameStatus === "new" && gameType === "ranked" && <RankedGameCreator />}
      {gameStatus === "new" && gameType === "play" && <PlayCreator />}
      {gameStatus === "new" && gameType === "play-friends" && (
        <FriendsLobby
          initialJoinCode={friendsInitialJoinCode ?? undefined}
        />
      )}

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
          
          {!isViewer && gameView !== "play" && gameType !== "play" && gameType !== "play-friends" && (
            <ScoreEntryDialog disabled={rankedGameOver} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {gameStatus === "started" && !isViewer && gameView !== "play" && gameType !== "play" && gameType !== "play-friends" && (
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
              {gameView === "new" && gameType === "ranked" && (
                <IconButton
                  onClick={endRankedGame}
                  color="primary"
                  aria-label="End ranked game"
                  title="End ranked game"
                  sx={{
                    bgcolor: "#585858",
                    ":hover": { bgcolor: "#6a6a6a" },
                    width: 40,
                    height: 40,
                    ml: 1,
                  }}
                >
                  <SportsScoreIcon />
                </IconButton>
              )}
            </>
          )}
          {gameStatus === "started" && !isViewer && gameView !== "play" && gameType !== "play" && gameType !== "play-friends" && (
            <IconButton
              onClick={handleShareGame}
              color="primary"
              aria-label="Share game"
              title="Share game"
              sx={{
                bgcolor: "#585858",
                ":hover": { bgcolor: "#6a6a6a" },
                width: 40,
                height: 40,
                ml: 1,
              }}
            >
              <ShareIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>
      <ShareGameDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />
      <JoinGameDialog
        open={joinDialogOpen}
        onClose={() => { setJoinDialogOpen(false); setJoinInitialCode(""); }}
        initialCode={joinInitialCode}
      />
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
  // Different colors for light and dark mode
  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === "light"
            ? {
                primary: {
                  main: "#4BCDB9",
                },
                secondary: {
                  main: "#f50057",
                },
              }
            : {
                primary: {
                  main: "#7df3e1",
                },
                secondary: {
                  main: "#f50057",
                },
              }),
        },
      }),
    [mode]
  );

  // Customized Material Design Snackbar

  const StyledMaterialDesignContent = styled(MaterialDesignContent)(() => ({
    "&.notistack-MuiContent-info": {
      backgroundColor: "#7df3e1",
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
          <App />
        </SnackbarProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
