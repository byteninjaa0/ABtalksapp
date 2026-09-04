/**
 * standing — platform standing, and the guarantee that it never overturns a match.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/standing.test.ts
 *
 * Deterministic: `now` is injected, so the recency curve is pinned rather than
 * drifting with the wall clock.
 */
import {
  DEFAULT_STANDING_WEIGHTS,
  recencyScore,
  standingForAll,
  trackCoverage,
} from "@/features/hire/standing";
import { rankCandidates107 } from "@/features/hire/rank";
import { emptySearchSpec, emptyValue } from "@/features/hire/reduce-spec";
import type { Criterion } from "@/lib/validations/hire";
import type {
  CandidateDossier,
  CandidateSource,
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

const NOW = new Date("2026-09-03T00:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const f = <T,>(value: T) => ({
  value,
  provenance: "VERIFIED" as const,
  asOf: null,
});

type Ev = {
  lastActiveAt?: string | null;
  certificateIssued?: boolean;
  /** omit entirely to model a track that does not issue certificates */
  noCertificateField?: boolean;
  projectScores?: number[];
  missionTypesPassed?: string[];
  cohortDay?: number;
  ofDays?: number;
  workingLanguages?: string[];
};

function dossier(e: Ev): CandidateDossier {
  const evidence: CandidateDossier["evidence"] = {
    missionsPassed: f(0),
    missionsAttempted: f(0),
    missionsWaived: f(0),
    cleanPassCount: f(0),
    cleanPassPct: f(0),
    commitDays: f(0),
    activeDaysSpan: f(0),
    lastActiveAt: f(e.lastActiveAt ?? null),
    projectScores: f(e.projectScores ?? []),
    interview: f(null),
    workingLanguages: f(e.workingLanguages ?? []),
    missionTypesPassed: f(e.missionTypesPassed ?? []),
    cohortProgress: f({ day: e.cohortDay ?? 31, ofDays: e.ofDays ?? 31 }),
  };
  if (!e.noCertificateField) {
    evidence.certificateIssued = f(e.certificateIssued ?? false);
  }
  return {
    publicId: "AB-0001",
    source: "PROGRAM",
    candidateRef: "PROGRAM:x",
    programMemberId: null,
    userId: "u",
    roleFamily: f("BACKEND" as const),
    rawRoleLabel: f("Backend Engineer"),
    yearsExperience: f(3),
    education: f({ level: null, university: null, gradYear: null }),
    declaredSkills: f<string[]>([]),
    links: f({ linkedin: false, github: false, resume: false }),
    evidence,
    compensation: { declared: null, estimate: null },
    availability: null,
  };
}

function member(
  id: string,
  p: {
    source?: CandidateSource;
    missionsPassed?: number;
    commitDayCount?: number;
    status?: string;
    skills?: string[];
    ev?: Ev;
  } = {},
): ScoreableMember {
  return {
    id,
    candidateRef: `${p.source ?? "PROGRAM"}:${id}`,
    source: p.source ?? "PROGRAM",
    userId: id,
    fullName: id,
    jobRole: "Backend Engineer",
    company: "",
    yearsExperience: 3,
    yearsExperienceKnown: true,
    skills: p.skills ?? [],
    missionPoints: 0,
    missionsPassed: p.missionsPassed ?? 0,
    missionsAttempted: p.missionsPassed ?? 0,
    cleanPassCount: 0,
    totalScore: 0,
    commitDayCount: p.commitDayCount ?? 0,
    projectScores: p.ev?.projectScores ?? [],
    interview: null,
    cohortPublished: true,
    status: p.status ?? "COMPLETED",
    availability: null,
    cohortDay: p.ev?.cohortDay ?? 31,
    dossier: dossier(p.ev ?? {}),
  };
}

console.log("standing");

/* ── the recency curve ────────────────────────────────────────────────────── */

suite("recency decays on a curve, and absence is null not zero", () => {
  assert(recencyScore(daysAgo(3), NOW) === 1, "3 days");
  assert(recencyScore(daysAgo(20), NOW) === 0.8, "20 days");
  assert(recencyScore(daysAgo(60), NOW) === 0.5, "60 days");
  assert(recencyScore(daysAgo(120), NOW) === 0.25, "120 days");
  assert(recencyScore(daysAgo(400), NOW) === 0.1, "400 days");
  assert(recencyScore(null, NOW) === null, "null is not a zero");
  assert(recencyScore("not a date", NOW) === null, "garbage is not a zero");
  // Clock skew must not read as "active in the future then heavily decayed".
  assert(recencyScore(daysAgo(-2), NOW) === 1, "future timestamp");
});

/* ── coverage: a track's data gap is not a candidate's fault ──────────────── */

suite("a signal no track member can produce is dropped, not scored zero", () => {
  // The real hackathon shape: no lastActiveAt, no certificate, nothing graded.
  const hack = [
    member("h1", {
      source: "HACKATHON",
      missionsPassed: 1,
      commitDayCount: 1,
      ev: { lastActiveAt: null, certificateIssued: false, missionTypesPassed: ["HACKATHON"] },
    }),
    member("h2", {
      source: "HACKATHON",
      missionsPassed: 1,
      commitDayCount: 1,
      ev: { lastActiveAt: null, certificateIssued: false, missionTypesPassed: ["HACKATHON"] },
    }),
  ];
  const cover = trackCoverage(hack, NOW);
  const covered = cover.get("HACKATHON")!;
  assert(!covered.has("recentlyActive"), "recency dropped for the track");
  assert(!covered.has("certified"), "certification dropped for the track");
  assert(covered.has("shipped"), "shipping is what this track does record");
  assert(covered.has("verifiedWork"), "and it records work volume");

  const out = standingForAll(hack, { now: NOW });
  const h1 = out.get("HACKATHON:h1")!;
  assert(
    h1.uncovered.includes("recentlyActive") && h1.uncovered.includes("certified"),
    "reported as uncovered",
  );
  // Redistributed, not floored: with shipped=1 and verifiedWork=1 and the other
  // three dropped, standing must be full marks rather than 2-of-5.
  assert(h1.score === 100, `expected 100, got ${h1.score}`);
});

suite("a track that DOES record a signal scores a real zero on it", () => {
  const cohort = [
    member("c1", {
      missionsPassed: 20,
      commitDayCount: 20,
      ev: { lastActiveAt: daysAgo(3), certificateIssued: true },
    }),
    member("c2", {
      missionsPassed: 20,
      commitDayCount: 20,
      ev: { lastActiveAt: daysAgo(3), certificateIssued: false },
    }),
  ];
  const out = standingForAll(cohort, { now: NOW });
  const withCert = out.get("PROGRAM:c1")!;
  const without = out.get("PROGRAM:c2")!;
  assert(withCert.used.includes("certified"), "certification counts here");
  assert(
    without.values.certified === 0,
    "and a member without one scores zero, not dropped",
  );
  assert(withCert.score > without.score, "so the certified member ranks above");
});

suite("standing never divides by zero when nothing is covered", () => {
  const barren = [
    member("b1", { ev: { noCertificateField: true, cohortDay: 31, ofDays: 31 } }),
  ];
  const out = standingForAll(barren, { now: NOW });
  assert(Number.isFinite(out.get("PROGRAM:b1")!.score), "finite");
});

/* ── the guarantee: standing never overturns a match ──────────────────────── */

function skillCriterion(token: string): Criterion {
  return {
    id: "skill:1",
    kind: "skill",
    label: token,
    weight: "must",
    absolute: false,
    value: emptyValue({ token }),
  };
}

suite("a high-standing poor match never outranks a low-standing good match", () => {
  const spec = emptySearchSpec();
  spec.criteria = [skillCriterion("python")];
  const pool = [
    // Everything going for them except the requirement.
    member("busy-wrong-skill", {
      missionsPassed: 30,
      commitDayCount: 30,
      skills: ["java"],
      ev: { lastActiveAt: daysAgo(1), certificateIssued: true, projectScores: [90] },
    }),
    // Meets the requirement, dormant, nothing else.
    member("quiet-right-skill", {
      missionsPassed: 1,
      commitDayCount: 1,
      skills: ["python"],
      ev: { lastActiveAt: daysAgo(300) },
    }),
  ];
  const { primary } = rankCandidates107(pool, spec, { now: NOW });
  assert(
    primary[0]!.fullName === "quiet-right-skill",
    `match must win: got ${primary.map((p) => p.fullName).join(" > ")}`,
  );
});

suite("inside one band, verified evidence beats a self-declared claim", () => {
  const spec = emptySearchSpec();
  spec.criteria = [skillCriterion("python")];
  // Same requirement, same verdict, same fit — only provenance differs.
  const declaredOnly = member("declared", {
    missionsPassed: 10,
    commitDayCount: 10,
    skills: ["python"],
    ev: { lastActiveAt: daysAgo(10), workingLanguages: [] },
  });
  const provenByMissions = member("verified", {
    missionsPassed: 10,
    commitDayCount: 10,
    skills: [],
    ev: { lastActiveAt: daysAgo(10), workingLanguages: ["python"] },
  });
  const { primary } = rankCandidates107([declaredOnly, provenByMissions], spec, {
    now: NOW,
  });
  assert(
    primary[0]!.fullName === "verified",
    `got ${primary.map((p) => p.fullName).join(" > ")}`,
  );
  assert(
    primary[0]!.evidenceStrength > primary[1]!.evidenceStrength,
    "and it is evidence strength that separated them",
  );
  assert(
    Math.round(primary[0]!.match) === Math.round(primary[1]!.match),
    "match itself is identical — the tie-break did the work",
  );
});

suite("inside one band and equal evidence, the active candidate wins", () => {
  const spec = emptySearchSpec();
  spec.criteria = [skillCriterion("python")];
  const base = {
    missionsPassed: 10,
    commitDayCount: 10,
    skills: ["python"],
  };
  const pool = [
    member("dormant", { ...base, ev: { lastActiveAt: daysAgo(300) } }),
    member("active", { ...base, ev: { lastActiveAt: daysAgo(2) } }),
  ];
  const { primary } = rankCandidates107(pool, spec, { now: NOW });
  assert(
    primary[0]!.fullName === "active",
    `got ${primary.map((p) => p.fullName).join(" > ")}`,
  );
  assert(primary[0]!.standing > primary[1]!.standing, "standing separated them");
});

suite("weights are configurable without touching the signals", () => {
  const pool = [
    member("a", {
      missionsPassed: 10,
      commitDayCount: 10,
      ev: { lastActiveAt: daysAgo(2), certificateIssued: false },
    }),
    member("b", {
      missionsPassed: 10,
      commitDayCount: 10,
      ev: { lastActiveAt: daysAgo(300), certificateIssued: true },
    }),
  ];
  const recencyHeavy = standingForAll(pool, {
    now: NOW,
    weights: { ...DEFAULT_STANDING_WEIGHTS, recentlyActive: 10, certified: 1 },
  });
  const certHeavy = standingForAll(pool, {
    now: NOW,
    weights: { ...DEFAULT_STANDING_WEIGHTS, recentlyActive: 1, certified: 10 },
  });
  assert(
    recencyHeavy.get("PROGRAM:a")!.score > recencyHeavy.get("PROGRAM:b")!.score,
    "recency-weighted favours the active one",
  );
  assert(
    certHeavy.get("PROGRAM:b")!.score > certHeavy.get("PROGRAM:a")!.score,
    "certificate-weighted favours the certified one",
  );
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
