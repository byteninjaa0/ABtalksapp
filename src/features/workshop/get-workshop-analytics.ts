import "server-only";
import { prisma } from "@/lib/db";

export interface WorkshopEventStats {
  eventId: string;
  total: number;
  /** First-ever workshop registration for this person — no earlier signup. */
  newRegistrants: number;
  /** Had already registered for an earlier workshop. */
  returning: number;
  /** Rows linked to a User account (legacy pre-auth rows are not). */
  linked: number;
  firstSignupAt: Date | null;
  lastSignupAt: Date | null;
}

export interface WorkshopAnalytics {
  /** Master totals across every workshop. */
  totalRegistrations: number;
  /** Distinct people by email — headcount, NOT a measure of newness. */
  uniqueAttendees: number;
  /** People who registered for more than one workshop. */
  repeatPeople: number;
  /** Registrations from people who also hold a full Klymb AI profile. */
  memberRegistrations: number;
  /**
   * People with no Klymb AI account at all, or whose account was created at the
   * moment they signed in for their first workshop — i.e. the workshop funnel
   * acquired them.
   */
  newToKlymb: number;
  /** People who already had an Klymb AI account before their first workshop. */
  existingMembers: number;
  /** Attendees who went on to enroll in a challenge — workshop → programme. */
  convertedToChallenge: number;
  workshopCount: number;
  perEvent: WorkshopEventStats[];
}

/**
 * Google sign-in happens seconds before the registration row is written, so a
 * genuinely new account's createdAt sits slightly BEFORE its first registration.
 * Anything created more than an hour earlier is treated as a pre-existing member.
 */
const NEW_ACCOUNT_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * New vs returning per workshop, plus master totals.
 *
 * "New" is decided by each person's EARLIEST registration across all workshops:
 * the event holding that earliest row counts them as new, every later event
 * counts them as returning. Identity is the email so that a person is tracked
 * consistently even if their account is recreated.
 *
 * Computed in memory from a 4-column scan. At ~500 rows today and a few thousand
 * after a year of weekly workshops that is comfortably cheap; if this ever grows
 * past ~100k rows, move the new/returning split into SQL with a window function.
 */
export async function getWorkshopAnalytics(): Promise<WorkshopAnalytics> {
  const rows = await prisma.workshopRegistration.findMany({
    select: { eventId: true, email: true, userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Earliest registration per person decides which event "owns" them as new.
  const firstEventByEmail = new Map<string, string>();
  const firstSeenAtByEmail = new Map<string, Date>();
  const timesSeen = new Map<string, number>();
  for (const r of rows) {
    if (!firstEventByEmail.has(r.email)) {
      firstEventByEmail.set(r.email, r.eventId);
      firstSeenAtByEmail.set(r.email, r.createdAt);
    }
    timesSeen.set(r.email, (timesSeen.get(r.email) ?? 0) + 1);
  }

  // Every registration has a userId now, so the interesting question is not
  // "do they have an account" but "did the workshop create it, and did they go
  // on to join a challenge".
  const accounts = await prisma.user.findMany({
    where: { email: { in: [...timesSeen.keys()], mode: "insensitive" } },
    select: {
      email: true,
      createdAt: true,
      candidateProfile: { select: { id: true } },
      programEnrollments: {
        where: { id: { startsWith: "pe_enr_" } },
        select: { id: true },
        take: 1,
      },
    },
  });
  const accountByEmail = new Map(
    accounts.map((a) => [a.email.toLowerCase(), a]),
  );

  let newToKlymb = 0;
  let existingMembers = 0;
  let convertedToChallenge = 0;
  for (const email of timesSeen.keys()) {
    const account = accountByEmail.get(email);
    if (!account) {
      // No account at all — never joined Klymb AI beyond the workshop form.
      newToKlymb += 1;
      continue;
    }
    const firstSeen = firstSeenAtByEmail.get(email);
    const preExisting =
      firstSeen !== undefined &&
      account.createdAt.getTime() < firstSeen.getTime() - NEW_ACCOUNT_TOLERANCE_MS;
    if (preExisting) existingMembers += 1;
    else newToKlymb += 1;
    if (account.programEnrollments.length > 0) convertedToChallenge += 1;
  }

  const byEvent = new Map<string, WorkshopEventStats>();
  for (const r of rows) {
    let s = byEvent.get(r.eventId);
    if (!s) {
      s = {
        eventId: r.eventId,
        total: 0,
        newRegistrants: 0,
        returning: 0,
        linked: 0,
        firstSignupAt: null,
        lastSignupAt: null,
      };
      byEvent.set(r.eventId, s);
    }
    s.total += 1;
    if (firstEventByEmail.get(r.email) === r.eventId) s.newRegistrants += 1;
    else s.returning += 1;
    if (r.userId) s.linked += 1;
    if (!s.firstSignupAt || r.createdAt < s.firstSignupAt) s.firstSignupAt = r.createdAt;
    if (!s.lastSignupAt || r.createdAt > s.lastSignupAt) s.lastSignupAt = r.createdAt;
  }

  const perEvent = [...byEvent.values()].sort(
    (a, b) => (b.lastSignupAt?.getTime() ?? 0) - (a.lastSignupAt?.getTime() ?? 0),
  );

  let repeatPeople = 0;
  for (const n of timesSeen.values()) if (n > 1) repeatPeople += 1;

  return {
    totalRegistrations: rows.length,
    uniqueAttendees: timesSeen.size,
    repeatPeople,
    memberRegistrations: rows.filter((r) => {
      const a = accountByEmail.get(r.email);
      return a?.candidateProfile != null;
    }).length,
    newToKlymb,
    existingMembers,
    convertedToChallenge,
    workshopCount: byEvent.size,
    perEvent,
  };
}
