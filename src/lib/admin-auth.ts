import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PlatformRole, RoleScopeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isRevokedSession } from "@/lib/account-status";
import { logger } from "@/lib/logger";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Env list is bootstrap-only. Live access is UserRoleAssignment. */
export async function isAdminEmail(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export async function hasPlatformAdmin(userId: string): Promise<boolean> {
  const row = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (row !== null) return true;

  // Only somebody who has NO live grant pays for the bootstrap, so an admin
  // who already has their row costs one query, not three.
  return bootstrapAdminFromEnv(userId);
}

/**
 * Chicken-and-egg bootstrap: copy ADMIN_EMAILS onto the matching User row,
 * **per email**.
 *
 * This used to be a one-shot platform-wide bootstrap — it counted every active
 * GLOBAL ADMIN row and returned early if there were any. That silently ignored
 * every email added to ADMIN_EMAILS after the first admin existed: the account
 * was listed in env, `auth.config.ts` set `token.isAdmin` from that same list
 * so the header rendered the Admin button, and then `requireAdmin` found no
 * assignment and redirected to /dashboard. Two authorities, one of them
 * unreachable. The scope is now the person, not the platform.
 *
 * A revoked admin is still never re-granted from env — that is why the count
 * below includes revoked rows. Once an account has ever held a GLOBAL ADMIN
 * assignment, env has had its say and the decision belongs to
 * `admin-platform-actions.ts`.
 */
async function bootstrapAdminFromEnv(userId: string): Promise<boolean> {
  const emails = getAdminEmails();
  if (emails.length === 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const email = user?.email?.trim().toLowerCase();
  if (!email || !emails.includes(email)) return false;

  // Revoked rows count. A grant that was taken away must not come back.
  const everGranted = await prisma.userRoleAssignment.count({
    where: {
      userId,
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
    },
  });
  if (everGranted > 0) return false;

  try {
    await prisma.userRoleAssignment.create({
      data: {
        userId,
        role: PlatformRole.ADMIN,
        scopeType: RoleScopeType.GLOBAL,
      },
      select: { id: true },
    });
    return true;
  } catch (error) {
    // A concurrent request that won the race is not a failure: the grant this
    // call wanted now exists either way.
    logger.error("[admin-auth] bootstrapAdminFromEnv", {
      userId,
      error: String(error),
    });
    const row = await prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        role: PlatformRole.ADMIN,
        scopeType: RoleScopeType.GLOBAL,
        revokedAt: null,
      },
      select: { id: true },
    });
    return row !== null;
  }
}

export async function requireAdmin() {
  const session = await auth();
  // Signed out on the server but the browser still holds the cookie, and
  // Auth.js re-signs it on every read — so redirecting straight to /login
  // would leave a revoked session renewing itself forever. Route through
  // signout, which is the one path that actually drops the cookie.
  if (isRevokedSession(session)) {
    redirect(`/api/auth/signout?callbackUrl=${encodeURIComponent("/login")}`);
  }
  if (!session?.user?.id || !session.user.email) redirect("/login");

  const isAdmin = await hasPlatformAdmin(session.user.id);
  if (!isAdmin) redirect("/dashboard");

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function getAdminContext() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  const isAdmin = await hasPlatformAdmin(session.user.id);
  if (!isAdmin) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
