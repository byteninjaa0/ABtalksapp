/**
 * availability privacy — the opted-in logistics boundary, end to end.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/availability-privacy.test.ts
 *
 * Deterministic and offline: no model, no database, no network. It walks the
 * real path a location requirement takes — criteria → rank → toPublicMatch —
 * and asserts the two promises in docs/legal/hire-availability-privacy-note.md
 * hold at the surface a browser actually receives:
 *
 *   1. Turning `openToWork` off removes a candidate from availability-filtered
 *      results IMMEDIATELY, and removes those fields from their card.
 *   2. Opted-in availability is for approved recruiters only, never for the
 *      public guest surface at /hire.
 *
 * These were both broken, and neither was catchable by a unit test of any one
 * module: `evaluateLocation` read the field it should not have, and
 * `toPublicMatch` rendered it to whoever asked. The test is written against the
 * composed pipeline for that reason.
 */
import { rankCandidates107 } from "@/features/hire/rank";
import { emptySearchSpec, emptyValue } from "@/features/hire/reduce-spec";
import { toPublicMatch } from "@/features/hire/to-public-match";
import {
  activeAvailability,
  visibleAvailability,
} from "@/features/hire/availability-access";
import type { Criterion } from "@/lib/validations/hire";
import type {
  AvailabilitySnapshot,
  CandidateDossier,
  ScoreableMember,
} from "@/features/hire/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean | undefined, msg: string) {
  if (!cond) throw new Error(msg);
}

function suite(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

function avail(
  p: Partial<NonNullable<AvailabilitySnapshot>> = {},
): AvailabilitySnapshot {
  return {
    openToWork: true,
    expectedSalaryMin: null,
    expectedSalaryMax: null,
    salaryCurrency: "INR",
    noticePeriodDays: null,
    preferredWorkMode: "REMOTE",
    preferredCities: ["Pune"],
    openToRelocate: false,
    ...p,
  };
}

/** Just enough dossier for `toPublicMatch` to read availability off it. */
function dossier(a: AvailabilitySnapshot): CandidateDossier {
  const f = <T,>(value: T) => ({ value, provenance: "DECLARED" as const, asOf: null });
  return {
    publicId: "AB-0001",
    source: "PROGRAM",
    candidateRef: "PROGRAM:m1",
    programMemberId: "m1",
    userId: "u1",
    roleFamily: f("BACKEND" as const),
    rawRoleLabel: f("Backend Engineer"),
    yearsExperience: f(3),
    education: f({ level: null, university: null, gradYear: null }),
    declaredSkills: f(["python"]),
    links: f({ linkedin: false, github: true, resume: false }),
    evidence: {
      missionsPassed: f(8),
      missionsAttempted: f(10),
      missionsWaived: f(0),
      cleanPassCount: f(6),
      cleanPassPct: f(75),
      commitDays: f(8),
      activeDaysSpan: f(14),
      lastActiveAt: f(null),
      projectScores: f([]),
      interview: f(null),
      workingLanguages: f(["python"]),
      missionTypesPassed: f([]),
      cohortProgress: f({ day: 14, ofDays: 31 }),
    },
    compensation: { declared: null, estimate: null },
    availability: a,
  };
}

function member(
  id: string,
  a: AvailabilitySnapshot,
): ScoreableMember {
  return {
    id,
    userId: id,
    fullName: id,
    jobRole: "Backend Engineer",
    company: "",
    yearsExperience: 3,
    yearsExperienceKnown: true,
    skills: ["python"],
    missionPoints: 40,
    missionsPassed: 8,
    missionsAttempted: 10,
    cleanPassCount: 6,
    totalScore: 40,
    commitDayCount: 8,
    projectScores: [],
    interview: null,
    cohortPublished: true,
    status: "ENROLLED",
    availability: a,
    cohortDay: 20,
    dossier: dossier(a),
  };
}

function inPune(absolute: boolean): Criterion {
  return {
    id: "location:pune",
    kind: "location",
    label: "Pune",
    weight: "must",
    absolute,
    value: emptyValue({ city: "Pune" }),
  };
}

console.log("availability privacy");

/* ── the gate itself ──────────────────────────────────────────────────────── */

suite("activeAvailability drops a withdrawn row", () => {
  assert(activeAvailability(null) === null, "null stays null");
  assert(activeAvailability(avail()) !== null, "open-to-work survives");
  assert(
    activeAvailability(avail({ openToWork: false })) === null,
    "withdrawn is dropped",
  );
});

suite("visibleAvailability fails closed on an unspecified viewer", () => {
  assert(visibleAvailability(avail()) === null, "default viewer sees nothing");
  assert(visibleAvailability(avail(), "guest") === null, "guest sees nothing");
  assert(
    visibleAvailability(avail(), "recruiter") !== null,
    "an approved recruiter sees it",
  );
  assert(
    visibleAvailability(avail({ openToWork: false }), "recruiter") === null,
    "but never a withdrawn row",
  );
});

/* ── end to end: requirement → rank → rendered card ───────────────────────── */

suite("guest cards carry no city and no work mode", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inPune(false)];
  const { primary } = rankCandidates107([member("a", avail())], spec);
  assert(primary.length === 1, "candidate ranked");

  const guest = toPublicMatch(primary[0]!, { viewer: "guest" });
  assert(guest.locationLabel === null, `guest saw city: ${guest.locationLabel}`);
  assert(
    guest.evidence.workMode == null,
    `guest saw work mode: ${guest.evidence.workMode}`,
  );
  assert(guest.availabilityUnknown === true, "and is told nothing is shared");

  // Belt and braces: no availability string anywhere in the serialized card.
  // Nothing candidate-derived. The recruiter's own requirement may still be
  // echoed back as an unknown gap; a candidate's stated city may not.
  const wire = JSON.stringify({ ...guest, gaps: [] });
  assert(!wire.includes("Pune"), "no city anywhere on the wire");
  assert(!/\bRemote\b/.test(wire), "no work mode anywhere on the wire");
});

suite("approved recruiters do see an active city and work mode", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inPune(false)];
  const { primary } = rankCandidates107([member("a", avail())], spec);
  const card = toPublicMatch(primary[0]!, { viewer: "recruiter" });
  assert(card.locationLabel === "Pune", `got ${card.locationLabel}`);
  assert(card.evidence.workMode === "Remote", `got ${card.evidence.workMode}`);
  assert(card.availabilityUnknown === false, "availability is known");
});

suite("a withdrawn candidate's card is blank even for a recruiter", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inPune(false)];
  const withdrawn = member("a", avail({ openToWork: false }));
  const { primary } = rankCandidates107([withdrawn], spec);
  const card = toPublicMatch(primary[0]!, { viewer: "recruiter" });
  assert(card.locationLabel === null, `recruiter saw city: ${card.locationLabel}`);
  assert(card.evidence.workMode == null, "recruiter saw work mode");
  assert(card.availabilityUnknown === true, "reported as unknown");
  // The only "Pune" allowed on this card is the recruiter's OWN requirement,
  // reported as unknown. That is truthful and must survive; what must not
  // survive is any assertion about where this candidate will work.
  assert(
    card.gaps.some((g) => /Pune not recorded/.test(g)),
    `gap should report the unknown, got ${JSON.stringify(card.gaps)}`,
  );
  assert(
    !card.gaps.some((g) => /willing|preferred|relocat/i.test(g)),
    "no claim about the candidate's own location",
  );
});

suite("a strict city requirement never renders a known mismatch as a match", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inPune(true)];
  const pool = [
    member("bengaluru", avail({ preferredCities: ["Bengaluru"] })),
    member("withdrawn-pune", avail({ openToWork: false })),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);

  // The provable mismatch is a near-miss, not a match, and it says why.
  assert(primary.length === 1, `one primary, got ${primary.length}`);
  assert(primary[0]!.fullName === "withdrawn-pune", "the unknown stays primary");
  assert(excluded.length === 1, `one excluded, got ${excluded.length}`);
  assert(excluded[0]!.fullName === "bengaluru", "the mismatch is the excluded one");
  assert(
    /Pune/.test(excluded[0]!.excludedReason ?? ""),
    `reason names the requirement: ${excluded[0]!.excludedReason}`,
  );

  // And the near-miss card still does not leak the city it was judged on to a
  // guest — an excluded candidate is still a candidate.
  const guestCard = toPublicMatch(excluded[0]!, { viewer: "guest" });
  assert(guestCard.locationLabel === null, "guest sees no city on a near-miss");
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
