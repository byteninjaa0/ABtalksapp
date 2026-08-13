import type { MatchCardData } from "@/components/hire/match-card";

export const GUEST_MATCHES_KEY = "abtalks-hire-guest-matches";

export type GuestMatchStore = {
  matches: MatchCardData[];
  overallGap: string;
  title: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function writeGuestMatches(store: GuestMatchStore): void {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(GUEST_MATCHES_KEY, JSON.stringify(store));
}

export function readGuestMatches(): GuestMatchStore | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(GUEST_MATCHES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const store = parsed as GuestMatchStore;
    if (!Array.isArray(store.matches)) return null;
    return {
      matches: store.matches,
      overallGap: typeof store.overallGap === "string" ? store.overallGap : "",
      title: typeof store.title === "string" ? store.title : "",
    };
  } catch {
    return null;
  }
}
