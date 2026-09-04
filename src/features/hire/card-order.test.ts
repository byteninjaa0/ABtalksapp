/**
 * card-order — the display layer must not undo the ranking.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/card-order.test.ts
 *
 * The bug this pins was real and invisible: `rankCandidates107` produced a
 * confidence-adjusted order, and then every surface that renders cards re-sorted
 * by `score` — role fit — putting the least reliable results on top. The engine
 * was right and the screen was wrong, which is the hardest kind of wrong to see.
 */
import { compareCards, orderCards } from "@/features/hire/card-order";
import { rankCandidates107 } from "@/features/hire/rank";
import { emptySearchSpec, emptyValue } from "@/features/hire/reduce-spec";
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

console.log("card-order");

suite("a weakly-evidenced high score sorts below a well-evidenced lower one", () => {
  const weak = { candidateRef: "a", score: 88, rankKey: 60 };
  const solid = { candidateRef: "b", score: 85, rankKey: 84 };
  const order = orderCards([weak, solid]).map((c) => c.candidateRef);
  assert(order[0] === "b", `expected the evidenced card first, got ${order.join(",")}`);
  // And the old behaviour is exactly what this prevents.
  const byScore = [weak, solid].sort((x, y) => y.score - x.score);
  assert(byScore[0]!.candidateRef === "a", "sanity: score alone picks the weak one");
});

suite("falls back to score for cards written before rankKey existed", () => {
  const older = [
    { candidateRef: "a", score: 70 },
    { candidateRef: "b", score: 90 },
  ];
  assert(orderCards(older)[0]!.candidateRef === "b", "highest score leads");
});

suite("a mixed list does not put legacy cards on top by accident", () => {
  // A legacy card has no rankKey, so its score stands in. That must compare
  // like for like against a modern card's rankKey, not beat it automatically.
  const mixed = [
    { candidateRef: "legacy", score: 70 },
    { candidateRef: "modern", score: 95, rankKey: 92 },
  ];
  assert(orderCards(mixed)[0]!.candidateRef === "modern", "modern leads");
});

suite("ordering is stable and total", () => {
  const tied = [
    { candidateRef: "b", score: 80, rankKey: 80 },
    { candidateRef: "a", score: 80, rankKey: 80 },
    { candidateRef: "c", score: 80, rankKey: 80 },
  ];
  assert(
    orderCards(tied).map((c) => c.candidateRef).join("") === "abc",
    "ties fall back to a stable key",
  );
  assert(compareCards(tied[0]!, tied[0]!) === 0, "reflexive");
});

/* ── the engine and the screen must agree ─────────────────────────────────── */

function member(id: string, p: Partial<ScoreableMember> = {}): ScoreableMember {
  return {
    id,
    candidateRef: id,
    userId: id,
    fullName: id,
    jobRole: "Backend Engineer",
    company: "",
    yearsExperience: 5,
    yearsExperienceKnown: true,
    skills: [],
    missionPoints: 0,
    missionsPassed: 8,
    missionsAttempted: 10,
    cleanPassCount: 6,
    totalScore: 0,
    commitDayCount: 8,
    projectScores: [],
    interview: null,
    cohortPublished: true,
    status: "ENROLLED",
    availability: null,
    cohortDay: 20,
    ...p,
  };
}

function skill(token: string): Criterion {
  return {
    id: `skill:${token}`,
    kind: "skill",
    label: token,
    weight: "must",
    absolute: false,
    value: emptyValue({ token }),
  };
}

suite("re-sorting the engine's own output does not change it", () => {
  // The real invariant: whatever `rankCandidates107` returns, running the
  // display comparator over it must be a no-op. If these ever disagree, the
  // screen is showing a different ranking from the one that was computed.
  const spec = emptySearchSpec();
  spec.criteria = [skill("python"), skill("react"), skill("sql")];
  const pool = [
    member("all-three", { skills: ["python", "react", "sql"] }),
    member("one-known", { skills: ["python"] }),
    member("none-recorded", { skills: [] }),
    member("two-of-three", { skills: ["python", "react"] }),
  ];
  const { primary } = rankCandidates107(pool, spec);
  const engineOrder = primary.map((p) => p.candidateRef);

  // Through the card shape the surface actually receives.
  const cards = primary.map((p) => ({
    candidateRef: p.candidateRef,
    score: Math.round(p.match),
    rankKey: p.rankKey,
  }));
  const screenOrder = orderCards(cards).map((c) => c.candidateRef);

  assert(
    engineOrder.join(">") === screenOrder.join(">"),
    `engine ${engineOrder.join(">")} vs screen ${screenOrder.join(">")}`,
  );
});

suite("every ranked candidate carries the key the surface needs", () => {
  const spec = emptySearchSpec();
  spec.criteria = [skill("python")];
  const { primary } = rankCandidates107([member("a", { skills: ["python"] })], spec);
  assert(
    primary.every((p) => typeof p.rankKey === "number"),
    "rankKey must be set, or the surface silently falls back to score",
  );
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
