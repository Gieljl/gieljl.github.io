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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  IconButton,
  Slide,
  Stack,
  Typography,
  styled,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Menu from "./features/menu/menu";
import { PlayerRanking } from "./features/players/Ranking";
import { GameCreator } from "./features/game/GameCreator";
import { RankedGameCreator } from "./features/game/RankedGameCreator";
import { HomePage } from "./features/game/HomePage";
import { useSelector } from "react-redux";
import { RootState } from "./app/store";
import ScoresHistoryNew from "./features/rounds/ScoresHistoryNew";
import {
  SnackbarProvider,
  MaterialDesignContent,
  TransitionProps,
} from "notistack";
import { ActionCreators } from "redux-undo";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { selectScoreState } from "./features/game/scoreSlice";
import { useTheme } from "@mui/system";
import ServiceWorkerWrapper from "./serviceworkerWrapper";
import { ErrorBoundary } from "react-error-boundary";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import RulesPopUp from "./features/game/RulesText";
import { useEndRankedGame } from "./features/game/useEndRankedGame";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

function App() {
  const colorMode = React.useContext(ColorModeContext);
  const gameStatus = useSelector((state: RootState) => state.game.status);
  const gameType = useSelector((state: RootState) => state.game.type);
  const gameMode = useSelector((state: RootState) => state.game.mode);
  const dispatch = useAppDispatch();
  const scoreState = useAppSelector(selectScoreState);
  const theme = useTheme();
  const [openRules, setOpenRules] = React.useState(false);
  const endRankedGame = useEndRankedGame();

  // Safety net: if the persisted state somehow lands in a combination that
  // renders nothing (e.g. after a data-shape change that our migration missed),
  // clear local storage and reload so the user sees the fresh home screen.
  const validRender =
    gameStatus === "home" ||
    (gameStatus === "new" &&
      (gameMode === "unranked" || gameMode === "ranked")) ||
    (gameStatus === "started" &&
      (gameType === "classic" || gameType === "ranked"));

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

  const handleClickOpenRules = () => {
    setOpenRules(true);
  };
  const handleCloseRules = () => {
    setOpenRules(false);
  };

  const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
      children: React.ReactElement;
    },
    ref: React.Ref<unknown>
  ) {
    return <Slide direction="up" ref={ref} {...props} />;
  });

  const RulesDialogContent: React.FC = () => (
    <Dialog
      fullScreen
      open={openRules}
      onClose={handleCloseRules}
      TransitionComponent={Transition}
    >
      <AppBar
        sx={{ background: "#424242", color: "#7df3e1", position: "relative" }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="primary"
            onClick={handleCloseRules}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Yasat Rules Explained
          </Typography>
        </Toolbar>
      </AppBar>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          <Stack direction={"row"} alignContent={"center"}>
            <img
              src={theme.palette.mode === "light" ? logolight : logo}
              className="App-logo-big"
              alt="logo"
            />
          </Stack>
          <RulesPopUp />
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          sx={{ margin: 1 }}
          onClick={handleCloseRules}
          variant="contained"
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

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
      {gameStatus === "started" && gameType === "classic" && (
        <img
          src={theme.palette.mode === "light" ? logolight : logo}
          className="App-logo"
          alt="logo"
        />
      )}

      {gameStatus === "home" && <HomePage />}

      {gameStatus === "new" && gameMode === "unranked" && <GameCreator />}
      {gameStatus === "new" && gameMode === "ranked" && <RankedGameCreator />}

      {gameStatus === "started" && gameType === "classic" && (
        <ScoresHistoryNew />
      )}

      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        {gameStatus === "started" && gameType === "ranked" && <PlayerRanking />}
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
          
          {gameStatus === "new" && (
            <>
              <Button
                onClick={handleClickOpenRules}
                variant="text"
                size="large"
                color="primary"
                startIcon={<HelpOutlineIcon fontSize="inherit" />}
                sx={{
                  width: 45,
                  height: 45,
                  position: "absolute",
                  zIndex: 2,
                  top: -80,
                  left: 0,
                  right: 0,
                  margin: "0 auto",
                }}
              >
                Rules
              </Button>
              <RulesDialogContent />
            </>
          )}
          <ScoreEntryDialog />
          <Box sx={{ flexGrow: 1 }} />
          {gameStatus === "started" && (
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

              {gameType === "classic" && <StatsFullScreenDialog />}
              {gameType === "ranked" && gameMode === "ranked" && (
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
        </Toolbar>
      </AppBar>
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
