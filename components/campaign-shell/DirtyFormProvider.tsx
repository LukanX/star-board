"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type DirtyFormContextValue = {
  isDirty: boolean;
  setDirty: (source?: string) => void;
  clearDirty: (source?: string) => void;
  confirmNavigation: (message?: string, source?: string) => boolean;
  registerLeaveGuard: (source: string, guard: () => Promise<boolean>) => () => void;
  hasLeaveGuards: () => boolean;
  prepareNavigation: () => Promise<boolean>;
};
const DirtyFormContext = createContext<DirtyFormContextValue | null>(null);

export function DirtyFormProvider({ children }: { children: ReactNode }) {
  const [dirtySources, setDirtySources] = useState<Set<string>>(() => new Set());
  const leaveGuards = useRef(new Map<string, () => Promise<boolean>>());
  const registerLeaveGuard = useCallback((source: string, guard: () => Promise<boolean>) => {
    leaveGuards.current.set(source, guard);
    return () => { if (leaveGuards.current.get(source) === guard) leaveGuards.current.delete(source); };
  }, []);
  const isDirty = dirtySources.size > 0;
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
  const value = useMemo(() => ({
    isDirty,
    registerLeaveGuard,
    hasLeaveGuards: () => leaveGuards.current.size > 0,
    prepareNavigation: async () => {
      const guards = [...leaveGuards.current.entries()];
      const guardedSources = new Set(guards.map(([source]) => source));
      if ([...dirtySources].some((source) => !guardedSources.has(source)) && !window.confirm("You have unsaved changes. Leave this page?")) return false;
      for (const [, guard] of guards) if (!await guard()) return false;
      return true;
    },
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
  }), [dirtySources, isDirty, registerLeaveGuard]);
  return <DirtyFormContext.Provider value={value}>{children}</DirtyFormContext.Provider>;
}

export function useDirtyForm() {
  const context = useContext(DirtyFormContext);
  if (!context) throw new Error("useDirtyForm must be used within DirtyFormProvider");
  return context;
}

export function useOptionalDirtyForm() {
  return useContext(DirtyFormContext);
}

export default DirtyFormProvider;