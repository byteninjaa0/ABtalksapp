"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MatchCardData } from "@/components/hire/match-card";

export type HireDeskView = "scout" | "pod";

export type HireDeskState = {
  step: 1 | 2 | 3;
  matchCount: number | null;
  gap: string | null;
  view: HireDeskView;
  inspect: MatchCardData | null;
};

type HireDeskValue = HireDeskState & {
  setDesk: (next: Partial<HireDeskState>) => void;
  openPod: () => void;
  closePod: () => void;
  openInspect: (match: MatchCardData) => void;
  clearInspect: () => void;
};

const HireDeskContext = createContext<HireDeskValue | null>(null);

export function HireDeskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HireDeskState>({
    step: 1,
    matchCount: null,
    gap: null,
    view: "scout",
    inspect: null,
  });
  const setDesk = useCallback((next: Partial<HireDeskState>) => {
    setState((s) => ({ ...s, ...next }));
  }, []);
  const openPod = useCallback(() => {
    setState((s) => ({ ...s, view: "pod", step: 3 }));
  }, []);
  const closePod = useCallback(() => {
    setState((s) => ({
      ...s,
      view: "scout",
      step: s.matchCount != null ? 2 : 1,
    }));
  }, []);
  const openInspect = useCallback((match: MatchCardData) => {
    setState((s) => ({
      ...s,
      view: "scout",
      inspect: match,
      step: s.matchCount != null ? 2 : 1,
    }));
  }, []);
  const clearInspect = useCallback(() => {
    setState((s) => ({ ...s, inspect: null }));
  }, []);
  const value = useMemo(
    () => ({
      ...state,
      setDesk,
      openPod,
      closePod,
      openInspect,
      clearInspect,
    }),
    [state, setDesk, openPod, closePod, openInspect, clearInspect],
  );
  return (
    <HireDeskContext.Provider value={value}>{children}</HireDeskContext.Provider>
  );
}

export function useHireDesk(): HireDeskValue {
  const ctx = useContext(HireDeskContext);
  if (!ctx) {
    return {
      step: 1,
      matchCount: null,
      gap: null,
      view: "scout",
      inspect: null,
      setDesk: () => {},
      openPod: () => {},
      closePod: () => {},
      openInspect: () => {},
      clearInspect: () => {},
    };
  }
  return ctx;
}
