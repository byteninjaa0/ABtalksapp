export const GUEST_CART_KEY = "abtalks-hire-cart";

export type GuestCartItem = {
  memberId: string;
  jobRole: string;
  totalScore: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readGuestCart(): GuestCartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is GuestCartItem =>
        !!row &&
        typeof row === "object" &&
        typeof (row as GuestCartItem).memberId === "string" &&
        typeof (row as GuestCartItem).jobRole === "string" &&
        typeof (row as GuestCartItem).totalScore === "number",
    );
  } catch {
    return [];
  }
}

export function writeGuestCart(items: GuestCartItem[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("abtalks-hire-cart"));
}

export function guestCartHas(memberId: string): boolean {
  return readGuestCart().some((i) => i.memberId === memberId);
}

export function toggleGuestCart(item: GuestCartItem): boolean {
  const current = readGuestCart();
  const exists = current.some((i) => i.memberId === item.memberId);
  const next = exists
    ? current.filter((i) => i.memberId !== item.memberId)
    : [...current, item].slice(0, 25);
  writeGuestCart(next);
  return !exists;
}

export function clearGuestCart(): void {
  writeGuestCart([]);
}
