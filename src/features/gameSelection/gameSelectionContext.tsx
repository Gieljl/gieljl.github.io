import * as React from "react";

export type ActiveGame = "yasat";

export interface GameDefinition {
  id: ActiveGame;
  label: string;
  /** Primary palette color in dark mode. */
  darkColor: string;
  /** Primary palette color in light mode. */
  lightColor: string;
  /** Short marketing tagline shown in the switcher. */
  tagline: string;
}

export const GAMES: Record<ActiveGame, GameDefinition> = {
  yasat: {
    id: "yasat",
    label: "Yasat",
    darkColor: "#7df3e1",
    lightColor: "#4BCDB9",
    tagline: "The original card-game score tracker.",
  },
};

interface GameSelectionContextValue {
  activeGame: ActiveGame;
  setActiveGame: (game: ActiveGame) => void;
}

export const GameSelectionContext =
  React.createContext<GameSelectionContextValue>({
    activeGame: "yasat",
    setActiveGame: () => {},
  });

export function GameSelectionProvider({
  value,
  children,
}: {
  value: GameSelectionContextValue;
  children: React.ReactNode;
}) {
  return (
    <GameSelectionContext.Provider value={value}>
      {children}
    </GameSelectionContext.Provider>
  );
}

export function useGameSelection() {
  return React.useContext(GameSelectionContext);
}
