/**
 * Plan 151 — processor integration (in-memory; no production DB).
 * Run: npm run test:gamification:integration
 */
import { readFileSync } from "node:fs";
import { evaluate } from "@/features/gamification/rules/evaluate";
import type { EvaluateSnapshot } from "@/features/gamification/rules/evaluate";
import type { LevelGateSnapshot } from "@/features/gamification/levels";

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

function gates(over: Partial<LevelGateSnapshot> = {}): LevelGateSnapshot {
  return {
    xpTotal: 0,
    passedActivityCount: 0,
    distinctVerifiedDays: 0,
    hasVerifiedBuild: false,
    programCompletions: 0,
    verifiedSkillCount: 0,
    verifiedSkillsInOneCategory: 0,
    hackathonTop25: false,
    advancedSkillCount: 0,
    hackathonTop10OrFinalist: false,
    activeWeeksLast52: 0,
    ...over,
  };
}

function snapshot(over: Partial<EvaluateSnapshot> = {}): EvaluateSnapshot {
  return {
    disabled: false,
    deleted: false,
    heldAt: null,
    highFlagOpen: false,
    phoneVerified: true,
    xpTotal: 0,
    xpToday: 0,
    activityXpToday: 0,
    assessmentCountThisWeek: 0,
    mockCountThisWeek: 0,
    referralLifetimeCount: 0,
    profileSectionXpLifetime: 0,
    profileSectionsAwarded: [],
    enrollmentXpEarned: 0,
    levelGates: gates(),
    weekStreak: 0,
    events: [],
    rules: [
      {
        key: "xp.activity.passed",
        eventType: "activity.passed",
        category: "LEARNING",
        xpAmount: null,
        multiplierBp: 10000,
        dailyCap: null,
        weeklyCap: null,
        lifetimeCap: null,
        isActive: true,
      },
    ],
    badges: [
      {
        id: "b1",
        slug: "first-step",
        name: "First Step",
        criteria: { kind: "event_count", eventType: "activity.passed", count: 1 },
        criteriaVersion: 1,
        xpReward: 0,
        isActive: true,
      },
    ],
    heldBadgeSlugs: new Set(),
    quests: [],
    userQuests: [],
    skillStagesEnabled: false,
    completeness: 0,
    completedSections: [],
    ...over,
  };
}

console.log("\nPlan 151 — gamification integration (pure processor)\n");

suite("same event evaluated twice with identical snapshot yields one XP effect shape", () => {
  const event = {
    id: "e1",
    userId: "u1",
    type: "activity.passed" as const,
    sourceType: "ActivityEvaluation",
    sourceId: "ev1",
    occurredAt: new Date("2026-09-18T10:00:00Z"),
    payload: {
      activityId: "a1",
      activityType: "DAILY_CHALLENGE",
      estimatedMinutes: 30,
      lateness: "ON_TIME",
      hasGithubProof: true,
      missionType: "CHALLENGE_DAY",
    },
    isBackfill: false,
  };
  const snap = snapshot();
  const a = evaluate(event, snap, { weekKey: "2026-W38", monthKey: "2026-09" });
  const b = evaluate(event, snap, { weekKey: "2026-W38", monthKey: "2026-09" });
  const xpA = a.filter((e) => e.kind === "xp");
  const xpB = b.filter((e) => e.kind === "xp");
  assert(xpA.length === 1 && xpB.length === 1, "one xp effect");
  assert(
    xpA[0]?.kind === "xp" &&
      xpB[0]?.kind === "xp" &&
      xpA[0].idempotencyKey === xpB[0].idempotencyKey,
    "same idempotency key",
  );
});

suite("disabled user is skipped", () => {
  const effects = evaluate(
    {
      id: "e1",
      userId: "u1",
      type: "activity.passed",
      sourceType: "ActivityEvaluation",
      sourceId: "ev1",
      occurredAt: new Date(),
      payload: {
        activityId: "a1",
        activityType: "CODING",
        lateness: "ON_TIME",
        hasGithubProof: false,
      },
      isBackfill: false,
    },
    snapshot({ disabled: true }),
    { weekKey: "2026-W38", monthKey: "2026-09" },
  );
  assert(effects.some((e) => e.kind === "skip"), "skipped");
});

suite("backfill does not write weekly period scores", () => {
  const effects = evaluate(
    {
      id: "e1",
      userId: "u1",
      type: "activity.passed",
      sourceType: "ActivityEvaluation",
      sourceId: "ev1",
      occurredAt: new Date(),
      payload: {
        activityId: "a1",
        activityType: "CODING",
        estimatedMinutes: 30,
        lateness: "ON_TIME",
        hasGithubProof: false,
        missionType: "CODE_SPRINT",
      },
      isBackfill: true,
    },
    snapshot(),
    { weekKey: "2026-W38", monthKey: "2026-09" },
  );
  assert(
    effects.every((e) => e.kind !== "periodScore"),
    "no period score on backfill",
  );
  assert(effects.some((e) => e.kind === "xp"), "xp still awarded");
});

suite("held user still gets XP but no badges", () => {
  const effects = evaluate(
    {
      id: "e1",
      userId: "u1",
      type: "activity.passed",
      sourceType: "ActivityEvaluation",
      sourceId: "ev1",
      occurredAt: new Date(),
      payload: {
        activityId: "a1",
        activityType: "CODING",
        estimatedMinutes: 30,
        lateness: "ON_TIME",
        hasGithubProof: false,
        missionType: "CODE_SPRINT",
      },
      isBackfill: false,
    },
    snapshot({ heldAt: new Date() }),
    { weekKey: "2026-W38", monthKey: "2026-09" },
  );
  assert(effects.some((e) => e.kind === "xp"), "xp accrues on hold");
  assert(
    effects.every((e) => e.kind !== "badgeAward"),
    "badges paused on hold",
  );
});

suite("child-branch host guard is present on seed and backfill", () => {
  const seed = readFileSync("prisma/seed-gamification.ts", "utf8");
  const backfill = readFileSync("prisma/scripts/gamification-backfill.ts", "utf8");
  assert(seed.includes("ep-young-shadow"), "seed guards live host");
  assert(backfill.includes("ep-young-shadow"), "backfill guards live host");
  assert(seed.includes("SEED_ALLOW_PRODUCTION"), "seed allow flag");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
