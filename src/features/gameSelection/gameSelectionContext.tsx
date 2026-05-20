import * as React from "react";

export type ActiveGame = "yasat" | "shiplake" | "regicide" | "flip7";

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
  shiplake: {
    id: "shiplake",
    label: "Shiplake",
    darkColor: "#f3c87d",
    lightColor: "#CD8C4B",
    tagline: "Dice. Categories. Modifiers. Glory.",
  },
  regicide: {
    id: "regicide",
    label: "Regicide",
    darkColor: "#f37d83",
    lightColor: "#CD4B53",
    tagline: "Co-op royal slayer (solo mode).",
  },
  flip7: {
    id: "flip7",
    label: "Flip 7",
    darkColor: "#5fc4c1",
    lightColor: "#1B3A8A",
    tagline: "Press your luck — first to 200.",
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
