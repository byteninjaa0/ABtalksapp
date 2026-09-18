/**
 * Plan 151 — gamification unit tests (pure).
 * Run: npm run test:gamification:unit
 */
import { computeActivityXp, applyActivityDailySoftCap, enrollmentCompletionXp, applyDailyHardCeiling, DAILY_HARD_CEILING } from "@/features/gamification/rules/xp-formula";
import { computeLevel, evaluateLevel, type LevelGateSnapshot } from "@/features/gamification/levels";
import { evaluateCriterion, measuredRarityBand, parseBadgeCriteria, type CriteriaContext } from "@/features/gamification/badges/criteria";
import { deriveQuestProgress, parseQuestTasks } from "@/features/gamification/quests/progress";
import { applyWeekClose, earnFreezeOnStreak, isWeekActive, STREAK_FREEZE_BANK_MAX, type StreakState } from "@/features/gamification/streak-weeks";
import { buildIdempotencyKey, parseEventPayload } from "@/features/gamification/event-types";
import { getIstWeekKey } from "@/lib/date-utils";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
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

const emptyGates = (xpTotal: number): LevelGateSnapshot => ({
  xpTotal,
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
});

console.log("\nPlan 151 — gamification unit\n");

suite("XP formula: fallback by type and clamps", () => {
  const quiz = computeActivityXp({
    activityType: "QUIZ",
    estimatedMinutes: null,
    difficulty: null,
    lateness: "ON_TIME",
    hasGithubProof: false,
  });
  assert(quiz === 15, `quiz fallback was ${quiz}`);
  const coding = computeActivityXp({
    activityType: "CODING",
    estimatedMinutes: 5,
    difficulty: "easy",
    lateness: "ON_TIME",
    hasGithubProof: false,
    missionType: "CODE_SPRINT",
  });
  assert(coding === 10, `coding clamp-low was ${coding}`);
  const project = computeActivityXp({
    activityType: "PROJECT",
    estimatedMinutes: 10,
    difficulty: "easy",
    lateness: "ON_TIME",
    hasGithubProof: false,
    missionType: "BOSS_BUILD",
  });
  assert(project === Math.round(60 * 1.2), `project clamp-low was ${project}`);
});

suite("XP formula: difficulty, late, repeat, admin", () => {
  const base = computeActivityXp({
    activityType: "CODING",
    estimatedMinutes: 30,
    difficulty: "hard",
    lateness: "LATE",
    hasGithubProof: false,
    missionType: "CODE_SPRINT",
  });
  assert(base === Math.round(30 * 1.5 * 1 * 0.75), `hard+late was ${base}`);
  const repeat = computeActivityXp({
    activityType: "CODING",
    estimatedMinutes: 30,
    difficulty: "medium",
    lateness: "ON_TIME",
    hasGithubProof: false,
    missionType: "CODE_SPRINT",
    repeatProgram: true,
  });
  assert(repeat === Math.round(30 * 1.25 * 0.25), `repeat was ${repeat}`);
  assert(
    computeActivityXp({
      activityType: "CODING",
      estimatedMinutes: 30,
      difficulty: null,
      lateness: "ON_TIME",
      hasGithubProof: false,
      isAdminIssued: true,
    }) === 0,
    "admin issued is 0",
  );
});

suite("XP formula: challenge proof verifiability", () => {
  const withProof = computeActivityXp({
    activityType: "DAILY_CHALLENGE",
    estimatedMinutes: 30,
    difficulty: null,
    lateness: "ON_TIME",
    hasGithubProof: true,
    missionType: "CHALLENGE_DAY",
  });
  const noProof = computeActivityXp({
    activityType: "DAILY_CHALLENGE",
    estimatedMinutes: 30,
    difficulty: null,
    lateness: "ON_TIME",
    hasGithubProof: false,
    missionType: "CHALLENGE_DAY",
  });
  assert(withProof === Math.round(30 * 0.6), `proof was ${withProof}`);
  assert(noProof === Math.round(30 * 0.4), `no proof was ${noProof}`);
});

suite("daily soft cap boundaries 149/150/151 and 299/300/301", () => {
  assert(applyActivityDailySoftCap(149, 1) === 1, "149+1 full");
  assert(applyActivityDailySoftCap(150, 1) === 1, "150+1 half of 1 rounded");
  assert(applyActivityDailySoftCap(151, 2) === 1, "151+2 is half");
  assert(applyActivityDailySoftCap(299, 1) === 1, "299+1 still in half band");
  assert(applyActivityDailySoftCap(300, 10) === 0, "300+ is zero");
  assert(applyActivityDailySoftCap(301, 10) === 0, "301+ is zero");
});

suite("enrollment completion clamp and daily hard ceiling", () => {
  assert(enrollmentCompletionXp(0) === 200, "min 200");
  assert(enrollmentCompletionXp(100_000) === 1000, "max 1000");
  assert(enrollmentCompletionXp(1600) === 400, "0.25 * 1600");
  const hit = applyDailyHardCeiling(DAILY_HARD_CEILING - 10, 50, false);
  assert(hit.awarded === 10 && hit.hitCeiling, "hard ceiling flags");
  const exempt = applyDailyHardCeiling(DAILY_HARD_CEILING, 1500, true);
  assert(exempt.awarded === 1500 && !exempt.hitCeiling, "placements exempt");
});

suite("level gates: XP met, gate unmet does not level", () => {
  const snap = emptyGates(10_000);
  snap.passedActivityCount = 1;
  snap.distinctVerifiedDays = 7;
  const level = computeLevel(snap);
  assert(level.level === 3, `expected 3 without build, got ${level.level}`);
  const l4 = evaluateLevel(4, snap);
  assert(l4.xpMet && !l4.gatesMet && !l4.eligible, "L4 XP met gate unmet");
});

suite("level 2 requires a verified activity, not XP alone", () => {
  const snap = emptyGates(500);
  assert(computeLevel(snap).level === 1, "XP alone stays Explorer");
  snap.passedActivityCount = 1;
  assert(computeLevel(snap).level === 2, "first pass reaches Learner");
});

suite("IST week keys: Sunday 23:59 IST vs Monday 00:00 IST", () => {
  const sunday = new Date("2026-09-13T18:29:59.000Z");
  const monday = new Date("2026-09-13T18:30:00.000Z");
  assert(getIstWeekKey(sunday) === "2026-W37", `sunday ${getIstWeekKey(sunday)}`);
  assert(getIstWeekKey(monday) === "2026-W38", `monday ${getIstWeekKey(monday)}`);
});

suite("streak freeze earn, bank limit, auto-apply", () => {
  assert(isWeekActive({ distinctVerifiedDays: 2, hasT3Event: false }), "2 days");
  assert(isWeekActive({ distinctVerifiedDays: 1, hasT3Event: true }), "T3");
  assert(!isWeekActive({ distinctVerifiedDays: 1, hasT3Event: false }), "1 day");
  let state: StreakState = {
    weekStreak: 3,
    longestWeekStreak: 3,
    lastActiveWeekKey: "2026-W36",
    streakFreezes: 0,
  };
  state = applyWeekClose(state, "2026-W37", true);
  assert(state.weekStreak === 4, `streak ${state.weekStreak}`);
  assert(state.streakFreezes === 1, "earned a freeze at 4");
  state = applyWeekClose(state, "2026-W38", false);
  assert(state.weekStreak === 4, "freeze preserves streak");
  assert(state.streakFreezes === 0, "freeze consumed");
  assert(earnFreezeOnStreak(8, 2) === STREAK_FREEZE_BANK_MAX, "bank max 2");
});

suite("rarity bands", () => {
  assert(measuredRarityBand(90, 100) === "Common", "common");
  assert(measuredRarityBand(20, 100) === "Uncommon", "uncommon");
  assert(measuredRarityBand(8, 100) === "Rare", "rare");
  assert(measuredRarityBand(3, 100) === "Epic", "epic");
  assert(measuredRarityBand(0, 100) === "Legendary", "legendary");
});

suite("badge criteria kinds", () => {
  const now = new Date("2026-09-18T00:00:00.000Z");
  const ctx: CriteriaContext = {
    events: [
      { type: "activity.passed", occurredAt: now, payload: {} },
      {
        type: "hackathon.placed",
        occurredAt: now,
        payload: { variant: "winner" },
      },
    ],
    weekStreak: 12,
    level: 4,
    profileCompleteness: 85,
    completedSections: ["basic", "education", "projects"],
    skillStageCounts: { Verified: 1 },
    skillStageCountsByCategory: {},
    seasonPercentile: { weekly: 1 },
    now,
  };
  assert(evaluateCriterion({ kind: "event_count", eventType: "activity.passed", count: 1 }, ctx));
  assert(evaluateCriterion({ kind: "week_streak", weeks: 12 }, ctx));
  assert(evaluateCriterion({ kind: "level_reached", level: 4 }, ctx));
  assert(evaluateCriterion({ kind: "hackathon_placement", atLeast: "top5" }, ctx));
  assert(
    evaluateCriterion(
      { kind: "profile_completeness", atLeast: 80, requiredSections: ["basic", "education"] },
      ctx,
    ),
  );
  assert(evaluateCriterion({ kind: "season_percentile", board: "weekly", atMost: 1 }, ctx));
  assert(evaluateCriterion({ kind: "skill_stage", stage: "Verified", count: 1 }, ctx));
  const parsed = parseBadgeCriteria({ kind: "event_count", eventType: "activity.passed", count: 1 });
  assert(parsed.ok, "criteria parse");
});

suite("quest derivation counts, distinct days, withinDays", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  const started = new Date("2026-09-10T00:00:00.000Z");
  const tasks = parseQuestTasks([
    {
      taskKey: "a",
      label: "Pass 2",
      eventTypes: ["activity.passed"],
      count: 2,
    },
    {
      taskKey: "b",
      label: "3 days",
      eventTypes: ["activity.passed"],
      distinctDays: 3,
      withinDays: 7,
    },
  ]);
  assert(tasks.ok, "tasks parse");
  const events = [
    { type: "activity.passed", occurredAt: new Date("2026-09-16T00:00:00Z"), payload: {} },
    { type: "activity.passed", occurredAt: new Date("2026-09-17T00:00:00Z"), payload: {} },
    { type: "activity.passed", occurredAt: new Date("2026-09-18T00:00:00Z"), payload: {} },
  ];
  const derived = deriveQuestProgress(tasks.data, events, now, started);
  assert(derived.tasks[0]?.done, "count 2");
  assert(derived.tasks[1]?.done, "3 distinct days");
  assert(derived.completed, "quest complete");
});

suite("banned quest event types rejected", () => {
  const parsed = parseQuestTasks([
    {
      taskKey: "login",
      label: "Log in",
      eventTypes: ["user.signed_in"],
      count: 3,
    },
  ]);
  assert(!parsed.ok, "login quest banned");
});

suite("idempotency key builder and payload PII rejection", () => {
  assert(
    buildIdempotencyKey("activity.passed", "u1:a1") === "activity.passed:u1:a1",
  );
  const bad = parseEventPayload("activity.passed", {
    activityId: "a1",
    activityType: "CODING",
    lateness: "ON_TIME",
    hasGithubProof: false,
    email: "x@y.com",
  });
  assert(!bad.ok, "extra email field rejected by strict payload");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
