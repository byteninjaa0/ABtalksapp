/**
 * Plan 151 Phase 0 — evidence strength and skill stages are pure, so they are
 * tested without a database. Run: npm run test:skill-evidence
 */
import assert from "node:assert/strict";
import { EvidenceSourceType } from "@prisma/client";
import { computeEvidenceScore } from "@/repositories/skill-evidence";
import {
  deriveSkillStage,
  nextStageHint,
  strengthBand,
  type StageEvidence,
} from "@/features/profile/skill-stage";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const monthsAgo = (n: number) =>
  new Date(NOW.getTime() - n * 30.44 * 24 * 60 * 60 * 1000);

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

const activity = (over: Partial<StageEvidence> = {}): StageEvidence => ({
  sourceType: EvidenceSourceType.ACTIVITY_EVALUATION,
  score: null,
  maxScore: null,
  weight: 1,
  occurredAt: monthsAgo(1),
  ...over,
});

console.log("skill evidence");

test("no evidence scores zero and stays Claimed", () => {
  assert.equal(computeEvidenceScore([], NOW), 0);
  assert.equal(deriveSkillStage([], { now: NOW }), "Claimed");
});

test("enrolment alone reads as Learning, not Claimed", () => {
  assert.equal(
    deriveSkillStage([], { enrolledInTeachingProgram: true, now: NOW }),
    "Learning",
  );
});

test("one passed activity is worth far less than a credential", () => {
  const one = computeEvidenceScore([{ ...activity() }], NOW);
  const credential = computeEvidenceScore(
    [{ ...activity(), sourceType: EvidenceSourceType.CREDENTIAL }],
    NOW,
  );
  assert.ok(one < credential, `${one} should be below ${credential}`);
  assert.ok(one <= 5, "a single activity should barely move strength");
});

test("strength decays with age but history is never deleted", () => {
  const fresh = computeEvidenceScore(
    [{ ...activity(), sourceType: EvidenceSourceType.CREDENTIAL, occurredAt: NOW }],
    NOW,
  );
  const old = computeEvidenceScore(
    [
      {
        ...activity(),
        sourceType: EvidenceSourceType.CREDENTIAL,
        occurredAt: monthsAgo(18),
      },
    ],
    NOW,
  );
  assert.ok(old < fresh);
  assert.ok(Math.abs(old - fresh / 2) <= 1, "18 months should halve it");
});

test("strength is capped at 100", () => {
  const many = Array.from({ length: 12 }, () => ({
    ...activity(),
    sourceType: EvidenceSourceType.CREDENTIAL,
    occurredAt: NOW,
  }));
  assert.equal(computeEvidenceScore(many, NOW), 100);
});

test("grinding activities cannot reach Verified", () => {
  const grind = Array.from({ length: 40 }, () => activity({ weight: 10 }));
  assert.equal(deriveSkillStage(grind, { now: NOW }), "Practicing");
});

test("a build makes it Applied; a completion makes it Verified", () => {
  assert.equal(
    deriveSkillStage([activity({ isBuild: true })], { now: NOW }),
    "Applied",
  );
  assert.equal(
    deriveSkillStage(
      [{ ...activity(), sourceType: EvidenceSourceType.CREDENTIAL }],
      { now: NOW },
    ),
    "Verified",
  );
});

test("assessment below 70% does not verify; at or above does", () => {
  const at = (pct: number) => ({
    ...activity(),
    sourceType: EvidenceSourceType.ASSESSMENT_SCORE,
    score: pct,
    maxScore: 100,
  });
  assert.equal(deriveSkillStage([at(69)], { now: NOW }), "Learning");
  assert.equal(deriveSkillStage([at(70)], { now: NOW }), "Verified");
});

test("Advanced needs two sources, a high score and recent evidence", () => {
  const strong = {
    ...activity(),
    sourceType: EvidenceSourceType.ASSESSMENT_SCORE,
    score: 90,
    maxScore: 100,
    occurredAt: monthsAgo(1),
  };
  const credential = {
    ...activity(),
    sourceType: EvidenceSourceType.CREDENTIAL,
    occurredAt: monthsAgo(2),
  };
  assert.equal(deriveSkillStage([strong], { now: NOW }), "Verified");
  assert.equal(deriveSkillStage([strong, credential], { now: NOW }), "Advanced");

  const stale = { ...strong, occurredAt: monthsAgo(20) };
  assert.equal(
    deriveSkillStage([stale, { ...credential, occurredAt: monthsAgo(24) }], { now: NOW }),
    "Verified",
    "stale evidence should fall back from Advanced",
  );
});

test("bands and hints line up with stages", () => {
  assert.equal(strengthBand(10), "Emerging");
  assert.equal(strengthBand(45), "Established");
  assert.equal(strengthBand(72), "Strong");
  assert.equal(nextStageHint("Advanced"), null);
  assert.ok(nextStageHint("Verified")?.includes("85%"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
