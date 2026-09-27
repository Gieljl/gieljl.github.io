import * as React from "react";

interface ScheetContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Fart to show first (from a share link), consumed by ScheetGame. */
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}

export const ScheetContext = React.createContext<ScheetContextValue>({
  open: false,
  setOpen: () => {},
  focusId: null,
  setFocusId: () => {},
});

export function ScheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({ open, setOpen, focusId, setFocusId }),
    [open, focusId],
  );
  return (
    <ScheetContext.Provider value={value}>{children}</ScheetContext.Provider>
  );
}

export function useScheet() {
  return React.useContext(ScheetContext);
}
