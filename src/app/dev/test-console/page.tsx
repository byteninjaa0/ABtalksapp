import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PlatformRole, RoleScopeType } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  TEST_IDENTITIES,
  TEST_PORT,
  isTestConsoleEnabled,
  testConsoleRefusal,
} from "@/lib/test-env";

import { TestConsole, type ConsoleIdentity } from "./console-client";

/**
 * Plan 195 — the test console. SERVER COMPONENT.
 *
 * Reads the gate, resolves the live state of every test identity, and hands
 * plain serialisable rows to the client half. Nothing but strings, numbers and
 * booleans crosses the boundary — no Prisma objects, no Dates, no functions.
 *
 * NOT behind `requireAdmin`, deliberately: an admin session is one of the
 * things this console exists to hand you, so requiring one would make the admin
 * identity unreachable. Its gate is `isTestConsoleEnabled()`, which is a
 * stricter condition than "is an admin" — it cannot be satisfied at all unless
 * the database is on this machine.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Test console",
  robots: { index: false, follow: false },
};

export default async function TestConsolePage() {
  if (!isTestConsoleEnabled()) {
    // 404, not a 403: a surface that is not supposed to exist here should not
    // confirm that it exists anywhere.
    logger.warn("[test-console] refused to render", {
      why: testConsoleRefusal(),
    });
    notFound();
  }

  const session = await auth();

  /**
   * Which cookie jar this request arrived in.
   *
   * Read from the Host header rather than from `window.location` on the
   * client. The host decides which identities are grouped as "for this host",
   * so a client-only value renders the groups empty on the server and then
   * refills them after hydration — which React resolves by rendering BOTH
   * arrangements into the DOM. Resolving it here makes the first paint correct
   * and the mismatch impossible.
   */
  const hostHeader = (await headers()).get("host") ?? "";
  const host = hostHeader.split(":")[0] || "localhost";

  // One query per concern across the whole cast, rather than per identity.
  const emails = TEST_IDENTITIES.map((i) => i.email);

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      role: true,
      candidateProfile: { select: { id: true } },
      recruiterProfile: { select: { company: true } },
    },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const userIds = users.map((u) => u.id);

  const adminGrants = await prisma.userRoleAssignment.findMany({
    where: {
      userId: { in: userIds },
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
      revokedAt: null,
    },
    select: { userId: true },
  });
  const admins = new Set(adminGrants.map((g) => g.userId));

  /**
   * Challenge progress.
   *
   * Selected by COHORT, not by the `pe_enr_` / `pe_pm_` id prefix. Those
   * prefixes only exist on rows the 078 migration minted; CLAUDE.md says new
   * surfaces write `ProgramEnrollment` with plain cuids, so anything created
   * since — including this environment's own program member — has no prefix at
   * all and a prefix filter silently misses it. The cohort slug is the durable
   * discriminator: `legacy-<domain>` is the challenge, `legacy-program-*` is
   * the AI cohort.
   */
  const enrollments = await prisma.programEnrollment.findMany({
    where: {
      userId: { in: userIds },
      cohort: {
        slug: { startsWith: "legacy-" },
        NOT: { slug: { startsWith: "legacy-program-" } },
      },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      trackCurrentStreak: true,
      progress: { select: { completedActivities: true } },
      cohort: { select: { slug: true } },
      // The real evidence of work. `EnrollmentProgress.completedActivities` is
      // a cache that the seeds do not populate, so reading only that reports
      // "day 0" for a candidate who has 30 passed attempts.
      _count: { select: { attempts: true } },
    },
  });
  const enrollmentByUser = new Map(enrollments.map((e) => [e.userId, e]));

  const programEnrollments = await prisma.programEnrollment.findMany({
    where: {
      userId: { in: userIds },
      cohort: { slug: { startsWith: "legacy-program-" } },
    },
    select: {
      userId: true,
      totalScore: true,
      status: true,
      cohort: { select: { name: true } },
    },
  });
  const programByUser = new Map(programEnrollments.map((e) => [e.userId, e]));

  const hackathonEntries = await prisma.hackathonParticipant.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      team: { select: { teamCode: true, entryType: true } },
    },
  });
  const hackathonByUser = new Map(hackathonEntries.map((h) => [h.userId, h]));

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: { in: userIds }, status: "ACTIVE" },
    select: {
      userId: true,
      organization: {
        select: { name: true, creditAccount: { select: { balance: true } } },
      },
    },
  });
  const orgByUser = new Map(memberships.map((m) => [m.userId, m]));

  const rateLimitEvents = await prisma.rateLimitEvent.count({
    where: {
      bucket: { in: ["LOGIN_PASSWORD_ACCOUNT", "LOGIN_PASSWORD_IP"] },
    },
  });

  const identities: ConsoleIdentity[] = TEST_IDENTITIES.map((identity) => {
    const user = byEmail.get(identity.email);
    const enrollment = user ? enrollmentByUser.get(user.id) : undefined;
    const program = user ? programByUser.get(user.id) : undefined;
    const org = user ? orgByUser.get(user.id) : undefined;

    const state: string[] = [];
    if (!user) {
      state.push("MISSING — re-run the bootstrap");
    } else {
      if (!user.candidateProfile && identity.track !== "recruiter") {
        state.push("no candidate profile");
      }
      if (enrollment) {
        // Prefer the cached counter when it has been computed, fall back to
        // the attempt count, which is what the seeds actually write.
        const day =
          enrollment.progress?.completedActivities || enrollment._count.attempts;
        state.push(
          `${enrollment.cohort.slug.replace("legacy-", "").toUpperCase()} day ${day}, streak ${enrollment.trackCurrentStreak}, ${enrollment.status}`,
        );
      }
      if (program) {
        state.push(
          `${program.cohort.name} — score ${program.totalScore}, ${program.status}`,
        );
      }
      const hackathon = user ? hackathonByUser.get(user.id) : undefined;
      if (hackathon) {
        state.push(
          `hackathon team ${hackathon.team.teamCode} (${hackathon.team.entryType})`,
        );
      }
      if (org) {
        const balance = org.organization.creditAccount?.balance ?? 0;
        state.push(
          `${org.organization.name} — $${(balance / 100).toFixed(2)}`,
        );
      }
      if (admins.has(user.id)) state.push("PLATFORM ADMIN");
    }

    return {
      key: identity.key,
      email: identity.email,
      name: identity.name,
      password: identity.password,
      track: identity.track,
      host: identity.host,
      landing: identity.landing,
      note: identity.note,
      exists: Boolean(user),
      isAdmin: user ? admins.has(user.id) : false,
      hasEnrollment: Boolean(enrollment),
      isRecruiter: Boolean(org),
      state: state.join(" · ") || "—",
    };
  });

  return (
    <TestConsole
      identities={identities}
      sessionEmail={session?.user?.email ?? null}
      sessionIsAdmin={session?.user?.isAdmin === true}
      host={host}
      port={TEST_PORT}
      rateLimitEvents={rateLimitEvents}
    />
  );
}
