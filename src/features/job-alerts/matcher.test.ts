/**
 * Unit tests for the T-250 rule-based matcher.
 *   npx tsx src/features/job-alerts/matcher.test.ts
 */
import { matches, MATCH_THRESHOLD } from "./matcher";
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

suite("threshold constant is 0.6 by default", () => {
  assert(MATCH_THRESHOLD === 0.6, `got ${MATCH_THRESHOLD}`);
});

suite("disabled alert never matches", () => {
  assert(!matches(job(), criteria({ enabled: false })), "should reject");
});

suite("empty enabled criteria matches every job (documented wildcard)", () => {
  assert(matches(job(), criteria()), "empty criteria should match");
});

suite("single-criterion alert still requires that criterion to pass", () => {
  // 1 set criterion, 1 pass = 100%; 0 pass = 0%. Threshold irrelevant at N=1.
  assert(matches(job(), criteria({ skills: ["React"] })), "one skill pass");
  assert(!matches(job(), criteria({ skills: ["python"] })), "one skill fail");
});

suite("skills intersect case-insensitively", () => {
  assert(matches(job(), criteria({ skills: ["react"] })), "lowercase should match");
  assert(matches(job(), criteria({ skills: ["REACT"] })), "uppercase should match");
});

suite("role direct substring still works", () => {
  assert(matches(job(), criteria({ role: "react" })), "substring hit");
  assert(matches(job(), criteria({ role: "Senior" })), "different casing");
});

suite(
  "role token match: individual words of the alert role match against the title",
  () => {
    // Alert role "Head of Design" -> tokens ["head", "design"]. Title
    // "Design Lead" contains "design" -> passes even though the exact phrase
    // does not appear.
    assert(
      matches(
        job({ title: "Design Lead" }),
        criteria({ role: "Head of Design" }),
      ),
      "should token-match",
    );
    assert(
      matches(
        job({ title: "Senior Design Engineer" }),
        criteria({ role: "Design Head" }),
      ),
      "should token-match via 'Design'",
    );
  },
);

suite(
  "role token match: unrelated title still fails role check",
  () => {
    // Alert "Design Head" vs job "Marketing Manager" -> no shared word.
    assert(
      !matches(
        job({ title: "Marketing Manager" }),
        criteria({ role: "Design Head" }),
      ),
      "unrelated titles should not match",
    );
  },
);

suite("location is case-insensitive substring on job.location", () => {
  assert(matches(job(), criteria({ location: "Bengaluru" })), "exact-ish");
  assert(matches(job(), criteria({ location: "bengaluru" })), "casing");
  // 1 of 1 fails -> ratio 0.
  assert(!matches(job(), criteria({ location: "mumbai" })), "different city");
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

suite(
  "3-criteria alert with 3 passes: matches (100% >= 75%)",
  () => {
    const c = criteria({
      skills: ["React"],
      location: "Bengaluru",
      opportunityType: "FULL_TIME",
    });
    assert(matches(job(), c), "all three pass");
  },
);

suite(
  "3-criteria alert with 2 passes: matches (67% >= 60%)",
  () => {
    const c = criteria({
      skills: ["React"],
      location: "Bengaluru",
      opportunityType: "INTERNSHIP", // fails
    });
    assert(matches(job(), c), "two of three should fire at 60%");
  },
);

suite("4-criteria alert with 3 passes: matches (75% >= 60%)", () => {
  const c = criteria({
    skills: ["React"],
    location: "Bengaluru",
    workMode: "HYBRID",
    opportunityType: "INTERNSHIP", // fails
  });
  assert(matches(job(), c), "three of four should fire at 60%");
});

suite(
  "4-criteria alert with 2 passes: does NOT match (50% < 60%)",
  () => {
    const c = criteria({
      skills: ["React"],
      location: "Mumbai", // fails
      workMode: "REMOTE", // fails
      opportunityType: "FULL_TIME",
    });
    assert(!matches(job(), c), "two of four should not fire at 60%");
  },
);

suite(
  "1-criterion alert still requires 100% (single field can't average)",
  () => {
    assert(
      !matches(job(), criteria({ skills: ["python"] })),
      "single-field failure remains a total failure",
    );
  },
);

suite(
  "T-250 grid: React + Bengaluru + FULL_TIME still matches on a matching job",
  () => {
    const c = criteria({
      skills: ["React"],
      location: "Bengaluru",
      opportunityType: "FULL_TIME",
    });
    assert(matches(job(), c), "grid case should match");
  },
);

suite("T-250 grid: totally non-matching job still receives nothing", () => {
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
