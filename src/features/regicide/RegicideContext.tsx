import * as React from "react";

interface RegicideContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const RegicideContext = React.createContext<RegicideContextValue>({
  open: false,
  setOpen: () => {},
});

export function RegicideProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <RegicideContext.Provider value={{ open, setOpen }}>
      {children}
    </RegicideContext.Provider>
  );
}

export function useRegicide() {
  return React.useContext(RegicideContext);
}
