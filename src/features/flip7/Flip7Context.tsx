import * as React from "react";

interface Flip7ContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const Flip7Context = React.createContext<Flip7ContextValue>({
  open: false,
  setOpen: () => {},
});

export function Flip7Provider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Flip7Context.Provider value={{ open, setOpen }}>
      {children}
    </Flip7Context.Provider>
  );
}

export function useFlip7() {
  return React.useContext(Flip7Context);
}
