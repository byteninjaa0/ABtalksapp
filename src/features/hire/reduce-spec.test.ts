/**
 * reduce-spec — source-span verification, every op, demotion.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/reduce-spec.test.ts
 */
import {
  applyCoverageGate,
  emptySearchSpec,
  emptyValue,
  reduceSpec,
  spanOccurs,
} from "@/features/hire/reduce-spec";
import type { Criterion } from "@/lib/validations/hire";
import type { ScoreableMember } from "@/features/hire/types";

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

function skill(label: string, opts?: { absolute?: boolean }): Criterion {
  return {
    id: `skill:${label.toLowerCase()}`,
    kind: "skill",
    label,
    weight: "must",
    absolute: opts?.absolute ?? false,
    value: emptyValue({ token: label }),
  };
}

const words = "python developers only from Delhi, not node";

console.log("reduce-spec");

suite("a real span applies", () => {
  const out = reduceSpec(emptySearchSpec(), {
    addCriteria: [
      {
        criterion: {
          kind: "skill",
          label: "python",
          weight: "must",
          absolute: true,
          value: emptyValue({ token: "python" }),
        },
        sourceText: "python",
      },
    ],
    updateCriteria: [],
    removeCriteria: [],
    filtersPatch: null,
    clarify: null,
  }, words);
  assert(out.spec.criteria.length === 1, "added");
  assert(out.spec.criteria[0]!.value.token === "python", "token");
  assert(out.dropped.length === 0, "nothing dropped");
});

suite("an op with a fabricated sourceText is dropped and reported", () => {
  const out = reduceSpec(emptySearchSpec(), {
    addCriteria: [
      {
        criterion: {
          kind: "skill",
          label: "rust",
          weight: "must",
          absolute: false,
          value: emptyValue({ token: "rust" }),
        },
        sourceText: "rust",
      },
    ],
    updateCriteria: [],
    removeCriteria: [],
    filtersPatch: null,
    clarify: null,
  }, words);
  assert(out.spec.criteria.length === 0, "not applied");
  assert(out.dropped.length === 1, "reported");
  assert(out.dropped[0]!.reason.includes("sourceText"), "reason names the span");
});

suite("a removeCriteria without a span is dropped", () => {
  const prior = emptySearchSpec();
  prior.criteria = [skill("python")];
  const out = reduceSpec(prior, {
    addCriteria: [],
    updateCriteria: [],
    removeCriteria: [{ id: "skill:python", sourceText: "please drop python" }],
    filtersPatch: null,
    clarify: null,
  }, words);
  assert(out.spec.criteria.length === 1, "kept");
  assert(out.dropped.some((d) => d.op === "remove"), "reported");
});

suite("a removeCriteria with a real span applies", () => {
  const prior = emptySearchSpec();
  prior.criteria = [skill("node")];
  const out = reduceSpec(
    prior,
    {
      addCriteria: [
        {
          criterion: {
            kind: "skill",
            label: "python",
            weight: "must",
            absolute: false,
            value: emptyValue({ token: "python" }),
          },
          sourceText: "python",
        },
      ],
      updateCriteria: [],
      removeCriteria: [{ id: "skill:node", sourceText: "not node" }],
      filtersPatch: null,
      clarify: null,
    },
    words,
  );
  assert(
    out.spec.criteria.length === 1 && out.spec.criteria[0]!.value.token === "python",
    "replaced",
  );
});

suite("punctuation and case still count as the same span", () => {
  assert(spanOccurs("Python", "python developers"), "case");
  assert(spanOccurs("from Delhi", "from delhi,"), "punct");
  assert(!spanOccurs("rust", "python developers"), "missing");
});

suite("an invalid delta leaves the prior spec untouched", () => {
  const prior = emptySearchSpec("keep me");
  prior.criteria = [skill("python")];
  const out = reduceSpec(prior, { nope: true }, words);
  assert(out.spec.criteria.length === 1, "untouched");
  assert(out.spec.statedAs === "keep me", "statedAs");
  assert(out.dropped.length >= 1, "reported");
});

suite("a criterion below the coverage gate is demoted with a reason", () => {
  const spec = emptySearchSpec();
  spec.criteria = [
    {
      ...skill("degree", { absolute: true }),
      kind: "education",
      id: "education:degree",
      label: "degree",
    },
  ];
  const members: ScoreableMember[] = [
    {
      id: "1",
      userId: "u1",
      fullName: "",
      jobRole: "",
      company: "",
      yearsExperience: 0,
      yearsExperienceKnown: false,
      skills: ["python"],
      missionPoints: 0,
      missionsPassed: 4,
      missionsAttempted: 4,
      cleanPassCount: 2,
      totalScore: 0,
      commitDayCount: 4,
      projectScores: [],
      interview: null,
      cohortPublished: true,
      status: "ENROLLED",
      availability: null,
      cohortDay: 10,
    },
    {
      id: "2",
      userId: "u2",
      fullName: "",
      jobRole: "",
      company: "",
      yearsExperience: 0,
      yearsExperienceKnown: false,
      skills: ["java"],
      missionPoints: 0,
      missionsPassed: 4,
      missionsAttempted: 4,
      cleanPassCount: 2,
      totalScore: 0,
      commitDayCount: 4,
      projectScores: [],
      interview: null,
      cohortPublished: true,
      status: "ENROLLED",
      availability: null,
      cohortDay: 10,
    },
  ];
  const gated = applyCoverageGate(spec, members);
  assert(gated.demoted.length === 1, "demoted");
  assert(Boolean(gated.spec.criteria[0]!.demotedReason), "reason set");
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
