"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DirtyFormContextValue = { isDirty: boolean; setDirty: () => void; clearDirty: () => void; confirmNavigation: (message?: string) => boolean };
const DirtyFormContext = createContext<DirtyFormContextValue | null>(null);

export function DirtyFormProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
  const value = useMemo(() => ({ isDirty, setDirty: () => setIsDirty(true), clearDirty: () => setIsDirty(false), confirmNavigation: (message = "You have unsaved changes. Leave this page?") => !isDirty || window.confirm(message) }), [isDirty]);
  return <DirtyFormContext.Provider value={value}>{children}</DirtyFormContext.Provider>;
}

export function useDirtyForm() {
  const context = useContext(DirtyFormContext);
  if (!context) throw new Error("useDirtyForm must be used within DirtyFormProvider");
  return context;
}

export default DirtyFormProvider;