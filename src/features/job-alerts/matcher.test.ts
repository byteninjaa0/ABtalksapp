/**
 * Unit tests for the T-250 rule-based matcher.
 *   npx tsx src/features/job-alerts/matcher.test.ts
 */
import { matches } from "./matcher";
import type { JobAlertCriteria, MatchableJob } from "./types";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): asserts cond {
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

function job(overrides: Partial<MatchableJob> = {}): MatchableJob {
  return {
    id: "job_1",
    title: "Senior React Engineer",
    company: "Acme",
    location: "Bengaluru, KA",
    workMode: "HYBRID",
    type: "FULL_TIME",
    skills: ["React", "TypeScript"],
    ...overrides,
  };
}

function criteria(overrides: Partial<JobAlertCriteria> = {}): JobAlertCriteria {
  return {
    enabled: true,
    skills: [],
    role: null,
    location: null,
    workMode: null,
    opportunityType: null,
    ...overrides,
  };
}

console.log("matcher.test.ts");

suite("disabled alert never matches", () => {
  assert(!matches(job(), criteria({ enabled: false })), "should reject");
});

suite("empty enabled criteria matches every job (documented wildcard)", () => {
  assert(matches(job(), criteria()), "empty criteria should match");
});

suite("skills intersect case-insensitively", () => {
  assert(matches(job(), criteria({ skills: ["react"] })), "lowercase should match");
  assert(matches(job(), criteria({ skills: ["REACT"] })), "uppercase should match");
  assert(!matches(job(), criteria({ skills: ["python"] })), "no overlap should not match");
});

suite("skills whitespace-only entries are ignored", () => {
  assert(matches(job(), criteria({ skills: ["  react  "] })), "trims match");
  assert(
    !matches(job({ skills: [] }), criteria({ skills: ["   "] })),
    "only-whitespace criterion still requires an intersection, but a job with no skills cannot intersect anything",
  );
});

suite("role is case-insensitive substring on job.title", () => {
  assert(matches(job(), criteria({ role: "react" })), "substring hit");
  assert(matches(job(), criteria({ role: "Senior" })), "different casing");
  assert(!matches(job(), criteria({ role: "backend" })), "no substring");
});

suite("location is case-insensitive substring on job.location", () => {
  assert(matches(job(), criteria({ location: "Bengaluru" })), "exact-ish");
  assert(matches(job(), criteria({ location: "bengaluru" })), "casing");
  assert(!matches(job(), criteria({ location: "mumbai" })), "different city");
});

suite("location set + job.location null => no match", () => {
  assert(
    !matches(job({ location: null }), criteria({ location: "Bengaluru" })),
    "null job location cannot satisfy a set location criterion",
  );
});

suite("workMode is exact enum match", () => {
  assert(matches(job(), criteria({ workMode: "HYBRID" })), "matches");
  assert(!matches(job(), criteria({ workMode: "REMOTE" })), "different mode");
});

suite("opportunityType is exact enum match", () => {
  assert(matches(job(), criteria({ opportunityType: "FULL_TIME" })), "matches");
  assert(
    !matches(job(), criteria({ opportunityType: "INTERNSHIP" })),
    "different type",
  );
});

suite("T-250 grid example: React + Bengaluru + full-time matches", () => {
  const c = criteria({
    skills: ["React"],
    location: "Bengaluru",
    opportunityType: "FULL_TIME",
  });
  assert(matches(job(), c), "grid case should match");
});

suite("T-250 grid example: non-matching job (Python part-time Mumbai)", () => {
  const c = criteria({
    skills: ["React"],
    location: "Bengaluru",
    opportunityType: "FULL_TIME",
  });
  const nonMatch = job({
    title: "Backend Python Developer",
    location: "Mumbai, MH",
    type: "PART_TIME",
    skills: ["Python", "Django"],
  });
  assert(!matches(nonMatch, c), "grid non-match case should not match");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
