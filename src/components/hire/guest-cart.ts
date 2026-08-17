import {
  decodeCandidateRef,
  encodeCandidateRef,
} from "@/features/hire/candidate-ref";

export const GUEST_CART_KEY = "abtalks-hire-cart";

export type GuestCartItem = {
  candidateRef: string;
  jobRole: string;
  totalScore: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

/**
 * Accept the current shape and the pre-challenge `{ memberId }` rows so a
 * cart that was sitting in localStorage before this change is not dropped.
 * A bare memberId is always a ProgramMember id — never a Claude user id.
 */
export function normalizeGuestCartItem(raw: unknown): GuestCartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    candidateRef?: unknown;
    memberId?: unknown;
    jobRole?: unknown;
    totalScore?: unknown;
  };
  const jobRole = typeof row.jobRole === "string" ? row.jobRole : "Candidate";
  const totalScore = typeof row.totalScore === "number" ? row.totalScore : 0;
  if (typeof row.candidateRef === "string") {
    if (!decodeCandidateRef(row.candidateRef)) return null;
    return { candidateRef: row.candidateRef, jobRole, totalScore };
  }
  if (typeof row.memberId === "string" && row.memberId.trim()) {
    return {
      candidateRef: encodeCandidateRef("PROGRAM", row.memberId),
      jobRole,
      totalScore,
    };
  }
  return null;
}

export function readGuestCart(): GuestCartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeGuestCartItem)
      .filter((row): row is GuestCartItem => row !== null);
  } catch {
    return [];
  }
}

export function writeGuestCart(items: GuestCartItem[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("abtalks-hire-cart"));
}

export function guestCartHas(candidateRef: string): boolean {
  return readGuestCart().some((i) => i.candidateRef === candidateRef);
}

export function toggleGuestCart(item: GuestCartItem): boolean {
  const current = readGuestCart();
  const exists = current.some((i) => i.candidateRef === item.candidateRef);
  const next = exists
    ? current.filter((i) => i.candidateRef !== item.candidateRef)
    : [...current, item].slice(0, 25);
  writeGuestCart(next);
  return !exists;
}

export function clearGuestCart(): void {
  writeGuestCart([]);
}

export function guestCartProgramIds(items: GuestCartItem[] = readGuestCart()): string[] {
  return items
    .map((i) => decodeCandidateRef(i.candidateRef))
    .filter((ref): ref is NonNullable<typeof ref> => ref?.source === "PROGRAM")
    .map((ref) => ref.id);
}

export function guestCartNonProgram(items: GuestCartItem[] = readGuestCart()): GuestCartItem[] {
  return items.filter((i) => decodeCandidateRef(i.candidateRef)?.source !== "PROGRAM");
}
