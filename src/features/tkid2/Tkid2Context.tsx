import * as React from "react";

interface Tkid2ContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const Tkid2Context = React.createContext<Tkid2ContextValue>({
  open: false,
  setOpen: () => {},
});

export function Tkid2Provider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Tkid2Context.Provider value={{ open, setOpen }}>
      {children}
    </Tkid2Context.Provider>
  );
}

export function useTkid2() {
  return React.useContext(Tkid2Context);
}
