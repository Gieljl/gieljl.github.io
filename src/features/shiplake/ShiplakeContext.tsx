import * as React from "react";

interface ShiplakeContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const ShiplakeContext = React.createContext<ShiplakeContextValue>({
  open: false,
  setOpen: () => {},
});

export function ShiplakeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <ShiplakeContext.Provider value={{ open, setOpen }}>
      {children}
    </ShiplakeContext.Provider>
  );
}

export function useShiplake() {
  return React.useContext(ShiplakeContext);
}
