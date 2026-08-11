import "server-only";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8-char uppercase join code (no 0/O/1/I). */
export function generateProgramJoinCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length]!;
  }
  return out;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function getCohortByJoinCode(code: string) {
  const joinCode = normalizeJoinCode(code);
  if (joinCode.length < 4) return null;

  return prisma.programCohort.findUnique({
    where: { joinCode },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      resultsPublishedAt: true,
      joinCode: true,
    },
  });
}

/**
 * Newest ENROLLING cohort that does not require a join code.
 * When several open cohorts are ENROLLING, the most recently created one wins.
 */
export async function getOpenEnrollmentCohort() {
  return prisma.programCohort.findFirst({
    where: { status: "ENROLLING", requiresJoinCode: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, joinCode: true },
  });
}

/**
 * Resolve the caller's program membership without redirecting.
 * Prefers ENROLLED over COMPLETED; among ties, newest enrolledAt.
 */
export async function resolveProgramMemberForUser(userId: string) {
  const memberships = await prisma.programMember.findMany({
    where: { userId, status: { in: ["ENROLLED", "COMPLETED"] } },
    select: {
      id: true,
      status: true,
      fullName: true,
      highestUnlockedDay: true,
      cohortId: true,
      enrolledAt: true,
      cohort: {
        select: {
          id: true,
          name: true,
          status: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          resultsPublishedAt: true,
          joinCode: true,
        },
      },
    },
  });

  if (memberships.length === 0) return null;

  memberships.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "ENROLLED" ? -1 : 1;
    }
    const at = a.enrolledAt?.getTime() ?? 0;
    const bt = b.enrolledAt?.getTime() ?? 0;
    return bt - at;
  });

  const member = memberships[0]!;
  return {
    member: {
      id: member.id,
      status: member.status,
      fullName: member.fullName,
      highestUnlockedDay: member.highestUnlockedDay,
      cohortId: member.cohortId,
    },
    cohort: member.cohort,
  };
}

/**
 * Require an enrolled/completed program member for their cohort.
 * DB-checked (the JWT can be stale). Redirects to the public landing otherwise.
 */
export async function requireProgramMember() {
  const session = await auth();
  if (!session?.user?.id) redirect("/program");

  const resolved = await resolveProgramMemberForUser(session.user.id);
  if (!resolved) redirect("/program");

  return {
    member: resolved.member,
    cohort: resolved.cohort,
    userId: session.user.id,
  };
}

/**
 * Require an approved recruiter. DB-checked (approval flips aren't in the JWT).
 * Redirects to the pending page otherwise.
 */
/**
 * Local testing only: lets any signed-in user act as an approved recruiter, so
 * /hire and /talent can be exercised without an admin approving a
 * RecruiterProfile first.
 *
 * The NODE_ENV guard is load-bearing, not belt-and-braces. Without it a stray
 * ENABLE_DEV_AUTH=true in a deployed environment would turn every signed-in
 * user into an approved recruiter and expose the talent pool — members consent
 * to being seen by *approved recruiters*, so that is a consent boundary, not
 * merely an auth convenience.
 *
 * Exported so every recruiter gate shares one rule. The page gate and the
 * Server Action gate used to check approval separately, which let the layout
 * render while every action still answered "Recruiter access not approved yet."
 */
export function recruiterDevBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_AUTH === "true"
  );
}

export async function requireRecruiter() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=/hire");

  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, approved: true, company: true, fullName: true },
  });

  if (recruiterDevBypassEnabled()) {
    return {
      profile: profile ?? {
        id: "dev-bypass",
        approved: true,
        company: "Dev",
        fullName: session.user.name ?? "Dev user",
      },
      userId: session.user.id,
    };
  }

  if (!profile || !profile.approved) redirect("/talent/pending");

  return { profile, userId: session.user.id };
}
