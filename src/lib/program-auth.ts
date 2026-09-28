import "server-only";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isRevokedSession } from "@/lib/account-status";
import { PROGRAM_AI_COHORT_BASE } from "@/features/program/constants";
import { ensureRecruiterWorkspace } from "@/features/hire/provision-recruiter";
import {
  findActiveMembership,
  getCohortByJoinCode as getCohortByJoinCodeFromRepo,
  getOpenEnrollmentCohort as getOpenEnrollmentCohortFromRepo,
} from "@/repositories/learning";

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
  return getCohortByJoinCodeFromRepo(joinCode);
}

/**
 * Newest ENROLLING cohort that does not require a join code.
 * When several open cohorts are ENROLLING, the most recently created one wins.
 */
export async function getOpenEnrollmentCohort() {
  return getOpenEnrollmentCohortFromRepo();
}

/**
 * Resolve the caller's program membership without redirecting.
 * Prefers ENROLLED over COMPLETED; among ties, newest enrolledAt, then id.
 */
export async function resolveProgramMemberForUser(userId: string) {
  return findActiveMembership(userId);
}

/**
 * Require an enrolled/completed program member for their cohort.
 * DB-checked (the JWT can be stale). Redirects to the public landing otherwise.
 */
export async function requireProgramMember() {
  const session = await auth();
  if (isRevokedSession(session)) {
    redirect(`/api/auth/signout?callbackUrl=${encodeURIComponent("/login")}`);
  }
  if (!session?.user?.id) redirect(PROGRAM_AI_COHORT_BASE);

  const resolved = await resolveProgramMemberForUser(session.user.id);
  if (!resolved) redirect(PROGRAM_AI_COHORT_BASE);

  return {
    member: resolved.member,
    cohort: resolved.cohort,
    userId: session.user.id,
  };
}

/**
 * Require a registered recruiter, and hand them a workspace.
 *
 * DB-checked rather than JWT-checked: the role in the token can be stale, and
 * a `RecruiterProfile` is what actually makes someone a recruiter. There is no
 * approval step — this used to redirect an unapproved account to
 * /talent/pending, which is the "Application received" screen that has been
 * removed. A signed-out visitor gets the recruiter door; a signed-in account
 * with no recruiter profile gets the registration form.
 */
export async function requireRecruiter() {
  const session = await auth();
  // A secured or disabled recruiter keeps a valid-looking JWT, and Auth.js
  // renews it on every read. Signout is what actually drops it; without this
  // they bounce between the desk and the login page holding a dead session.
  if (isRevokedSession(session)) {
    redirect(
      `/api/auth/signout?callbackUrl=${encodeURIComponent("/talent/login")}`,
    );
  }
  if (!session?.user?.id) redirect("/talent/login");

  const workspace = await ensureRecruiterWorkspace(session.user.id);
  if (!workspace) redirect("/talent/register");

  return {
    profile: {
      id: workspace.recruiterProfileId,
      company: workspace.company,
      fullName: workspace.fullName,
    },
    userId: session.user.id,
  };
}
