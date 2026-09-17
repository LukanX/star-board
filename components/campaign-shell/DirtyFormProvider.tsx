"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type DirtyFormContextValue = {
  isDirty: boolean;
  setDirty: (source?: string) => void;
  clearDirty: (source?: string) => void;
  confirmNavigation: (message?: string, source?: string) => boolean;
};
const DirtyFormContext = createContext<DirtyFormContextValue | null>(null);

export function DirtyFormProvider({ children }: { children: ReactNode }) {
  const [dirtySources, setDirtySources] = useState<Set<string>>(() => new Set());
  const isDirty = dirtySources.size > 0;
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
  const value = useMemo(() => ({
    isDirty,
    setDirty: (source = "manual") => setDirtySources((current) => {
      if (current.has(source)) return current;
      const next = new Set(current);
      next.add(source);
      return next;
    }),
    clearDirty: (source?: string) => setDirtySources((current) => {
      if (!source) return new Set();
      if (!current.has(source)) return current;
      const next = new Set(current);
      next.delete(source);
      return next;
    }),
    confirmNavigation: (message = "You have unsaved changes. Leave this page?", source?: string) => {
      const shouldConfirm = source ? dirtySources.has(source) : isDirty;
      return !shouldConfirm || window.confirm(message);
    },
  }), [dirtySources, isDirty]);
  return <DirtyFormContext.Provider value={value}>{children}</DirtyFormContext.Provider>;
}

export function useDirtyForm() {
  const context = useContext(DirtyFormContext);
  if (!context) throw new Error("useDirtyForm must be used within DirtyFormProvider");
  return context;
}

export default DirtyFormProvider;