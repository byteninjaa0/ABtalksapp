export const DESK_SHORTLIST_KEY = "abtalks-hire-star";
export const DESK_SHORTLIST_EVENT = "abtalks-hire-star";

export type DeskShortlistItem = {
  candidateRef: string;
  jobRole: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readDeskShortlist(): DeskShortlistItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DESK_SHORTLIST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is DeskShortlistItem =>
        !!row &&
        typeof row === "object" &&
        typeof (row as DeskShortlistItem).candidateRef === "string" &&
        typeof (row as DeskShortlistItem).jobRole === "string",
    );
  } catch {
    return [];
  }
}

function write(items: DeskShortlistItem[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DESK_SHORTLIST_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(DESK_SHORTLIST_EVENT));
}

export function deskShortlistHas(candidateRef: string): boolean {
  return readDeskShortlist().some((i) => i.candidateRef === candidateRef);
}

export function toggleDeskShortlist(item: DeskShortlistItem): boolean {
  const current = readDeskShortlist();
  const exists = current.some((i) => i.candidateRef === item.candidateRef);
  write(
    exists
      ? current.filter((i) => i.candidateRef !== item.candidateRef)
      : [...current, item].slice(0, 40),
  );
  return !exists;
}
