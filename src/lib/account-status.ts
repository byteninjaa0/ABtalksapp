export const ACCOUNT_DISABLED_MESSAGE =
  "This account has been disabled. Contact ABTalks support.";

export function isAccountFrozen(user: {
  deletedAt?: Date | null;
  disabledAt?: Date | null;
}): boolean {
  return Boolean(user.deletedAt || user.disabledAt);
}

/**
 * This browser holds a session we have revoked — disabled, deleted, or secured
 * by an admin.
 *
 * `auth()` returns null when there is no cookie at all: `@auth/core`'s session
 * action bails with an empty body before the session callback ever runs. When a
 * cookie IS present and our callback rejects it, the object survives with
 * `user` stripped. So a truthy session with no user means exactly one thing.
 *
 * It needs no database read, which is what lets the auth guards act on a
 * revoked session without dragging Prisma into the edge-safe middleware path.
 * `account-ops.test.ts` pins both halves of this contract.
 */
export function isRevokedSession(
  session: { user?: unknown } | null | undefined,
): boolean {
  return Boolean(session) && !session?.user;
}

export function isJwtInvalidated(
  tokenIat: number | undefined,
  sessionInvalidatedAt: Date | null | undefined,
): boolean {
  if (!sessionInvalidatedAt) return false;
  const iat = tokenIat ?? 0;
  return iat < Math.floor(sessionInvalidatedAt.getTime() / 1000);
}
