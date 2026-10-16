"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PlatformRole, RoleScopeType } from "@prisma/client";

import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  findIdentity,
  isTestConsoleEnabled,
  testConsoleRefusal,
} from "@/lib/test-env";

/**
 * Plan 195 — Server Actions behind the test console.
 *
 * EVERY action in this file starts with `gate()`. That is not belt-and-braces:
 * these actions sign in as arbitrary accounts, grant platform admin and rewrite
 * credit balances, so an ungated one is a privilege-escalation path with a
 * stable, guessable name. There is no "read-only" action here that could skip
 * it, and a new action added later must call it too.
 *
 * `gate()` refuses unless `NODE_ENV` is not production, `ENABLE_TEST_CONSOLE`
 * is exactly "true", AND `DATABASE_URL` is loopback. The last is the one doing
 * the real work — see `isTestConsoleEnabled` in `src/lib/test-env.ts`.
 *
 * Deliberately NOT guarded by `requireAdmin`. An admin session is what this
 * console is used to obtain, so requiring one would make the admin identity
 * unreachable — and the gate above is a stronger condition than "is an admin"
 * anyway.
 */

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function gate(): { ok: true } | { ok: false; message: string } {
  if (isTestConsoleEnabled()) return { ok: true };
  const why = testConsoleRefusal() ?? "unavailable";
  logger.warn("[test-console] refused an action", { why });
  return { ok: false, message: `Test console is not available: ${why}` };
}

const identityKeySchema = z.object({ key: z.string().min(1).max(64) });

/**
 * The login rate limiters, cleared before every identity switch.
 *
 * `authorizePassword` counts attempts per account and per client address in a
 * sliding window and throws `RateLimitedSignIn` past the cap. Switching
 * identity is the single most common thing anyone does in this environment, and
 * hitting a production rate limit while testing is noise rather than signal —
 * so the events are dropped rather than the limiter being bypassed. The limiter
 * itself is untouched, which means it can still be tested on purpose by
 * signing in through the real form.
 */
async function clearLoginRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimitEvent.deleteMany({
    where: {
      bucket: {
        in: ["LOGIN_PASSWORD_ACCOUNT", "LOGIN_PASSWORD_IP", "EMAIL_CODE_ADDRESS", "EMAIL_CODE_IP"],
      },
    },
  });
  return count;
}

/**
 * Sign this browser in as a test identity.
 *
 * Uses the EXISTING plan-154 `password` provider — no provider is added for the
 * test environment and `auth.ts` is untouched. That works because every test
 * account carries a real scrypt hash (see `scripts/test-env/provision.ts`), so
 * the ordinary credential path accepts it.
 *
 * The session cookie this sets is host-only, so it lands in the cookie jar of
 * whichever host the console was opened on. That is the whole session-collision
 * fix: signing in as a recruiter at `recruiter.localhost` leaves the candidate
 * session at `localhost` exactly as it was.
 *
 * `signIn` throws a redirect on success, so nothing after it runs.
 */
export async function becomeIdentityAction(
  input: unknown,
): Promise<ActionResult<never>> {
  const allowed = gate();
  if (!allowed.ok) return allowed;

  const parsed = identityKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid identity." };

  const identity = findIdentity(parsed.data.key);
  if (!identity) {
    return { ok: false, message: `Unknown identity: ${parsed.data.key}` };
  }

  await clearLoginRateLimits();
  logger.info("[test-console] signing in as a test identity", {
    key: identity.key,
    audience: identity.audience,
  });

  // Throws the redirect that carries the session cookie.
  await signIn("password", {
    email: identity.email,
    password: identity.password,
    audience: identity.audience,
    redirectTo: identity.landing,
  });

  return { ok: false, message: "unreachable" };
}

/** Drop the session on THIS host only. The other hosts keep theirs. */
export async function clearSessionAction(): Promise<ActionResult<null>> {
  const allowed = gate();
  if (!allowed.ok) return allowed;
  await signOut({ redirectTo: "/dev/test-console" });
  return { ok: true, data: null };
}

export async function clearRateLimitsAction(): Promise<
  ActionResult<{ cleared: number }>
> {
  const allowed = gate();
  if (!allowed.ok) return allowed;
  const cleared = await clearLoginRateLimits();
  revalidatePath("/dev/test-console");
  return { ok: true, data: { cleared } };
}

/**
 * Move a challenge candidate to a given day.
 *
 * Writes the streak snapshot on `ProgramEnrollment` and the cached counters on
 * `EnrollmentProgress`, and back-dates `startedAt` so the IST day maths in
 * `lib/date-utils.ts` agrees with the number. `getCurrentDayNumber` derives the
 * day from the elapsed time since `startedAt`, so setting counters without
 * moving the anchor produces a candidate whose dashboard and whose progress row
 * disagree — which looks like a bug in the product rather than in the fixture.
 *
 * Does NOT fabricate `ActivityAttempt` rows. Attempts are evidence of work, and
 * a day number is not; `npm run test:env:fixture` is where richer states are
 * built from the real seeds.
 */
const setDaySchema = z.object({
  key: z.string().min(1).max(64),
  day: z.number().int().min(1).max(60),
});

export async function setChallengeDayAction(
  input: unknown,
): Promise<ActionResult<{ day: number }>> {
  const allowed = gate();
  if (!allowed.ok) return allowed;

  const parsed = setDaySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Day must be a whole number from 1 to 60." };
  }
  const { key, day } = parsed.data;

  const identity = findIdentity(key);
  if (!identity) return { ok: false, message: `Unknown identity: ${key}` };

  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (!user) return { ok: false, message: `${identity.email} does not exist.` };

  const enrollment = await prisma.programEnrollment.findFirst({
    where: { userId: user.id, id: { startsWith: "pe_enr_" } },
    orderBy: { startedAt: "asc" },
    select: { id: true, cohortId: true },
  });
  if (!enrollment) {
    return { ok: false, message: `${identity.name} has no challenge enrollment.` };
  }

  // Noon UTC, matching the seeds' own `utcNoon` convention: it is unambiguously
  // the same IST calendar day whichever way the offset is applied.
  const startedAt = new Date();
  startedAt.setUTCHours(12, 0, 0, 0);
  startedAt.setUTCDate(startedAt.getUTCDate() - (day - 1));

  await prisma.$transaction(async (tx) => {
    await tx.programEnrollment.update({
      where: { id: enrollment.id },
      data: {
        startedAt,
        trackCurrentStreak: day,
        trackLongestStreak: day,
        status: day >= 60 ? "COMPLETED" : "ACTIVE",
        completedAt: day >= 60 ? new Date() : null,
      },
      select: { id: true },
    });

    await tx.enrollmentProgress.upsert({
      where: { enrollmentId: enrollment.id },
      create: {
        enrollmentId: enrollment.id,
        cohortId: enrollment.cohortId,
        completedActivities: day,
        totalActivities: 60,
        percentCompleteBp: Math.round((day / 60) * 10000),
        currentStreak: day,
        longestStreak: day,
        lastActivityAt: new Date(),
        unlockedThroughPosition: day,
      },
      update: {
        completedActivities: day,
        percentCompleteBp: Math.round((day / 60) * 10000),
        currentStreak: day,
        longestStreak: day,
        lastActivityAt: new Date(),
        unlockedThroughPosition: day,
      },
      select: { id: true },
    });
  });

  logger.info("[test-console] moved a candidate to a day", { key, day });
  revalidatePath("/dev/test-console");
  return { ok: true, data: { day } };
}

/**
 * Set a recruiter organization's credit balance, in whole dollars.
 *
 * `CreditAccount.balance` is USD minor units — 20000 is $200.00, which is the
 * onboarding grant. Writes the balance only, and deliberately leaves
 * `lifetimeEarned` / `lifetimeSpent` and the `CreditTransaction` ledger alone:
 * inventing ledger rows to match a hand-set balance would make the ledger lie,
 * and reconciliation between the two is a thing worth being able to test.
 * Setting 0 is the point — an empty desk is a state that is otherwise tedious
 * to reach.
 */
const setCreditsSchema = z.object({
  key: z.string().min(1).max(64),
  dollars: z.number().int().min(0).max(1_000_000),
});

export async function setCreditBalanceAction(
  input: unknown,
): Promise<ActionResult<{ dollars: number }>> {
  const allowed = gate();
  if (!allowed.ok) return allowed;

  const parsed = setCreditsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Balance must be a whole number of dollars." };
  }
  const { key, dollars } = parsed.data;

  const identity = findIdentity(key);
  if (!identity || identity.track !== "recruiter") {
    return { ok: false, message: `${key} is not a recruiter identity.` };
  }

  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (!user) return { ok: false, message: `${identity.email} does not exist.` };

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    select: { organizationId: true },
  });
  if (!membership) {
    return { ok: false, message: `${identity.name} has no organization.` };
  }

  await prisma.creditAccount.upsert({
    where: { organizationId: membership.organizationId },
    create: { organizationId: membership.organizationId, balance: dollars * 100 },
    update: { balance: dollars * 100 },
    select: { id: true },
  });

  logger.info("[test-console] set a credit balance", { key, dollars });
  revalidatePath("/dev/test-console");
  return { ok: true, data: { dollars } };
}

/**
 * Grant or revoke platform admin.
 *
 * A live, global, unrevoked `UserRoleAssignment` is the only authority for
 * admin access (plan 169), so that row is what moves. Revoking stamps
 * `revokedAt` rather than deleting, which is what the product does and what
 * `sessionInvalidatedAt` handling expects — never edit `role` to revoke.
 */
const toggleAdminSchema = z.object({
  key: z.string().min(1).max(64),
  grant: z.boolean(),
});

export async function toggleAdminAction(
  input: unknown,
): Promise<ActionResult<{ isAdmin: boolean }>> {
  const allowed = gate();
  if (!allowed.ok) return allowed;

  const parsed = toggleAdminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { key, grant } = parsed.data;

  const identity = findIdentity(key);
  if (!identity) return { ok: false, message: `Unknown identity: ${key}` };

  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (!user) return { ok: false, message: `${identity.email} does not exist.` };

  const live = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: user.id,
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
      revokedAt: null,
    },
    select: { id: true },
  });

  if (grant && !live) {
    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        role: PlatformRole.ADMIN,
        scopeType: RoleScopeType.GLOBAL,
      },
      select: { id: true },
    });
  } else if (!grant && live) {
    await prisma.userRoleAssignment.update({
      where: { id: live.id },
      data: { revokedAt: new Date(), revokedReason: "test console" },
      select: { id: true },
    });
  }

  logger.info("[test-console] changed a platform-admin grant", { key, grant });
  revalidatePath("/dev/test-console");
  return { ok: true, data: { isAdmin: grant } };
}

/** Who this host is currently signed in as, for the console header. */
export async function currentSessionAction(): Promise<
  ActionResult<{ email: string | null; isAdmin: boolean }>
> {
  const allowed = gate();
  if (!allowed.ok) return allowed;
  const session = await auth();
  return {
    ok: true,
    data: {
      email: session?.user?.email ?? null,
      isAdmin: session?.user?.isAdmin === true,
    },
  };
}
