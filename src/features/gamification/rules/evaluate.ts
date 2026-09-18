/**
 * Plan 151 §31.2 — PURE rules engine.
 * (event, rules, snapshot) → Effect[]
 *
 * Evaluate from state, don't increment. Quest progress, badge criteria and
 * levels are recomputed from ledger and source queries on each relevant event.
 * Only XpTransaction is append-only.
 */

import type { GamificationEventType } from "../event-types";
import { XP_EVENT_TYPES } from "../event-types";
import {
  ASSESSMENT_WEEKLY_CAP_COUNT,
  ASSESSMENT_XP,
  applyActivityDailySoftCap,
  applyDailyHardCeiling,
  enrollmentCompletionXp,
  HACKATHON_SUBMITTED_XP,
  MOCK_INTERVIEW_WEEKLY_CAP_COUNT,
  MOCK_INTERVIEW_XP,
  PLACEMENT_XP,
  PROFILE_SECTION_XP,
  PROFILE_XP_LIFETIME_CAP,
  REFERRAL_LIFETIME_CAP_COUNT,
  REFERRAL_XP,
  computeActivityXp,
  xpCategoryForEvent,
  type XpFormulaInput,
} from "./xp-formula";
import { computeLevel, type LevelGateSnapshot } from "../levels";
import {
  evaluateCriterion,
  parseBadgeCriteria,
  type CriteriaContext,
  type EventFact,
} from "../badges/criteria";
import {
  deriveQuestProgress,
  parseQuestTasks,
  type QuestEventFact,
} from "../quests/progress";

export type RuleRow = {
  key: string;
  eventType: string;
  category: "LEARNING" | "BUILDING" | "CAREER" | "COMPETITION" | "COMMUNITY";
  xpAmount: number | null;
  multiplierBp: number;
  dailyCap: number | null;
  weeklyCap: number | null;
  lifetimeCap: number | null;
  isActive: boolean;
};

export type BadgeDefRow = {
  id: string;
  slug: string;
  name: string;
  criteria: unknown;
  criteriaVersion: number;
  xpReward: number;
  isActive: boolean;
};

export type QuestDefRow = {
  id: string;
  slug: string;
  name: string;
  cadence: string;
  segment: string | null;
  tasks: unknown;
  xpReward: number;
  badgeSlug: string | null;
  isActive: boolean;
};

export type UserQuestRow = {
  id: string;
  questId: string;
  periodKey: string;
  status: string;
  startedAt: Date;
  progress: unknown;
};

export type EvaluateEvent = {
  id: string;
  userId: string;
  type: GamificationEventType;
  sourceType: string;
  sourceId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  isBackfill: boolean;
};

export type EvaluateSnapshot = {
  disabled: boolean;
  deleted: boolean;
  heldAt: Date | null;
  highFlagOpen: boolean;
  phoneVerified: boolean;
  xpTotal: number;
  xpToday: number;
  activityXpToday: number;
  assessmentCountThisWeek: number;
  mockCountThisWeek: number;
  referralLifetimeCount: number;
  profileSectionXpLifetime: number;
  profileSectionsAwarded: string[];
  enrollmentXpEarned: number;
  levelGates: LevelGateSnapshot;
  weekStreak: number;
  events: EventFact[];
  rules: RuleRow[];
  badges: BadgeDefRow[];
  heldBadgeSlugs: Set<string>;
  quests: QuestDefRow[];
  userQuests: UserQuestRow[];
  skillStagesEnabled: boolean;
  completeness: number;
  completedSections: string[];
};

export type XpEffect = {
  kind: "xp";
  amount: number;
  category: RuleRow["category"];
  ruleKey: string;
  idempotencyKey: string;
};

export type PeriodScoreEffect = {
  kind: "periodScore";
  periodType: "WEEK" | "MONTH";
  periodKey: string;
  amount: number;
};

export type BadgeAwardEffect = {
  kind: "badgeAward";
  badgeId: string;
  slug: string;
  criteriaVersion: number;
  xpReward: number;
};

export type QuestUpdateEffect = {
  kind: "questUpdate";
  userQuestId: string;
  questId: string;
  progress: unknown;
  completed: boolean;
  xpReward: number;
  badgeSlug: string | null;
};

export type QuestAssignEffect = {
  kind: "questAssign";
  questId: string;
  periodKey: string;
};

export type LevelChangeEffect = {
  kind: "levelChange";
  from: number;
  to: number;
};

export type StreakUpdateEffect = {
  kind: "streakUpdate";
  weekStreak: number;
  longestWeekStreak: number;
  lastActiveWeekKey: string | null;
  streakFreezes: number;
};

export type FlagEffect = {
  kind: "flag";
  flagKind: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details: Record<string, unknown>;
};

export type SkipEffect = {
  kind: "skip";
  reason: string;
};

export type Effect =
  | XpEffect
  | PeriodScoreEffect
  | BadgeAwardEffect
  | QuestUpdateEffect
  | QuestAssignEffect
  | LevelChangeEffect
  | StreakUpdateEffect
  | FlagEffect
  | SkipEffect;

function asFormulaInput(payload: Record<string, unknown>): XpFormulaInput {
  return {
    activityType: String(payload.activityType ?? "DAILY_CHALLENGE"),
    estimatedMinutes:
      typeof payload.estimatedMinutes === "number"
        ? payload.estimatedMinutes
        : null,
    difficulty:
      typeof payload.difficulty === "string" ? payload.difficulty : null,
    lateness: String(payload.lateness ?? "NOT_APPLICABLE"),
    hasGithubProof: payload.hasGithubProof === true,
    missionType:
      typeof payload.missionType === "string" ? payload.missionType : null,
    isAdminIssued: payload.isAdminIssued === true,
    repeatProgram: payload.repeatProgram === true,
  };
}

function activeRule(
  rules: RuleRow[],
  eventType: string,
): RuleRow | undefined {
  return rules.find((r) => r.eventType === eventType && r.isActive);
}

function computeXp(
  event: EvaluateEvent,
  snapshot: EvaluateSnapshot,
): { amount: number; ruleKey: string; category: RuleRow["category"]; hitCeiling: boolean; velocity: boolean } {
  const rule = activeRule(snapshot.rules, event.type);
  const category = xpCategoryForEvent(event.type, {
    activityType: String(event.payload.activityType ?? ""),
    missionType:
      typeof event.payload.missionType === "string"
        ? event.payload.missionType
        : null,
  });
  if (!XP_EVENT_TYPES.has(event.type)) {
    return { amount: 0, ruleKey: "none", category, hitCeiling: false, velocity: false };
  }
  if (!rule) {
    return { amount: 0, ruleKey: "inactive", category, hitCeiling: false, velocity: false };
  }

  let raw = 0;
  if (event.type === "activity.passed") {
    raw = computeActivityXp(asFormulaInput(event.payload));
    raw = applyActivityDailySoftCap(snapshot.activityXpToday, raw);
  } else if (event.type === "enrollment.completed") {
    const earned =
      typeof event.payload.enrollmentXp === "number"
        ? event.payload.enrollmentXp
        : snapshot.enrollmentXpEarned;
    raw = enrollmentCompletionXp(earned);
  } else if (event.type === "profile.section_completed") {
    const key = String(event.payload.sectionKey ?? "");
    if (snapshot.profileSectionsAwarded.includes(key)) {
      raw = 0;
    } else {
      const section = PROFILE_SECTION_XP[key] ?? 0;
      const room = Math.max(
        0,
        PROFILE_XP_LIFETIME_CAP - snapshot.profileSectionXpLifetime,
      );
      raw = Math.min(section, room);
    }
  } else if (event.type === "assessment.completed") {
    raw =
      snapshot.assessmentCountThisWeek >= ASSESSMENT_WEEKLY_CAP_COUNT
        ? 0
        : ASSESSMENT_XP;
  } else if (event.type === "mock_interview.completed") {
    raw =
      snapshot.mockCountThisWeek >= MOCK_INTERVIEW_WEEKLY_CAP_COUNT
        ? 0
        : MOCK_INTERVIEW_XP;
  } else if (event.type === "referral.qualified") {
    raw =
      snapshot.referralLifetimeCount >= REFERRAL_LIFETIME_CAP_COUNT
        ? 0
        : REFERRAL_XP;
  } else if (event.type === "hackathon.submitted") {
    const valid =
      event.payload.repoPublic === true &&
      event.payload.liveOk === true &&
      event.payload.duplicateRepo !== true;
    raw = valid ? HACKATHON_SUBMITTED_XP : 0;
  } else if (event.type === "hackathon.placed") {
    const variant = String(event.payload.variant ?? "");
    raw = PLACEMENT_XP[variant] ?? 0;
    if (event.payload.phoneVerified === false) raw = 0;
    if (event.payload.joinedWithin48h === true) raw = 0;
  } else if (event.type === "credential.issued") {
    const variant =
      typeof event.payload.hackathonVariant === "string"
        ? event.payload.hackathonVariant
        : null;
    if (variant && PLACEMENT_XP[variant] != null) {
      raw = 0;
    } else if (rule.xpAmount != null) {
      raw = rule.xpAmount;
    }
  } else if (rule.xpAmount != null) {
    raw = rule.xpAmount;
  }

  if (rule.multiplierBp !== 10000) {
    raw = Math.round((raw * rule.multiplierBp) / 10000);
  }
  if (rule.dailyCap != null) {
    raw = Math.min(raw, rule.dailyCap);
  }

  const placementExempt = event.type === "hackathon.placed";
  const capped = applyDailyHardCeiling(snapshot.xpToday, raw, placementExempt);
  return {
    amount: capped.awarded,
    ruleKey: rule.key,
    category: rule.category,
    hitCeiling: capped.hitCeiling,
    velocity: event.type === "activity.passed" && snapshot.activityXpToday === 0,
  };
}

const FIRST_STEPS_SEGMENT = "new";
const HACKATHON_ARRIVAL_SEGMENT = "hackathon_no_learning";
const COMEBACK_SEGMENT = "dormant";

export function evaluate(
  event: EvaluateEvent,
  snapshot: EvaluateSnapshot,
  period: { weekKey: string; monthKey: string },
): Effect[] {
  if (snapshot.deleted) return [{ kind: "skip", reason: "deleted" }];
  if (snapshot.disabled) return [{ kind: "skip", reason: "disabled" }];

  const effects: Effect[] = [];
  const xp = computeXp(event, snapshot);

  if (xp.amount > 0) {
    effects.push({
      kind: "xp",
      amount: xp.amount,
      category: xp.category,
      ruleKey: xp.ruleKey,
      idempotencyKey: `xp:${event.id}:${xp.ruleKey}`,
    });
    if (!event.isBackfill) {
      effects.push({
        kind: "periodScore",
        periodType: "WEEK",
        periodKey: period.weekKey,
        amount: xp.amount,
      });
      effects.push({
        kind: "periodScore",
        periodType: "MONTH",
        periodKey: period.monthKey,
        amount: xp.amount,
      });
    }
  }

  if (xp.hitCeiling) {
    effects.push({
      kind: "flag",
      flagKind: "daily_ceiling",
      severity: "MEDIUM",
      details: { xpToday: snapshot.xpToday, attempted: xp.amount },
    });
  }

  const projectedXp = snapshot.xpTotal + Math.max(0, xp.amount);
  const gates: LevelGateSnapshot = {
    ...snapshot.levelGates,
    xpTotal: projectedXp,
  };
  if (event.type === "activity.passed") {
    gates.passedActivityCount = Math.max(gates.passedActivityCount, 1);
    gates.distinctVerifiedDays = Math.max(gates.distinctVerifiedDays, 1);
  }
  if (
    event.type === "hackathon.submitted" ||
    (event.type === "activity.passed" &&
      (event.payload.missionType === "SHIP_IT" ||
        event.payload.missionType === "BOSS_BUILD" ||
        event.payload.activityType === "PROJECT"))
  ) {
    gates.hasVerifiedBuild = true;
  }
  if (event.type === "enrollment.completed") {
    gates.programCompletions += 1;
  }

  const newLevel = computeLevel(gates, {
    skillStagesEnabled: snapshot.skillStagesEnabled,
  });
  const currentLevel = computeLevel(snapshot.levelGates, {
    skillStagesEnabled: snapshot.skillStagesEnabled,
  });
  if (newLevel.level !== currentLevel.level) {
    effects.push({
      kind: "levelChange",
      from: currentLevel.level,
      to: newLevel.level,
    });
  }

  const facts: EventFact[] = [
    ...snapshot.events,
    {
      type: event.type,
      occurredAt: event.occurredAt,
      payload: event.payload,
    },
  ];
  const criteriaCtx: CriteriaContext = {
    events: facts,
    weekStreak: snapshot.weekStreak,
    level: newLevel.level,
    profileCompleteness: snapshot.completeness,
    completedSections: snapshot.completedSections,
    skillStageCounts: {},
    skillStageCountsByCategory: {},
    seasonPercentile: {},
    now: event.occurredAt,
  };

  if (!snapshot.heldAt && !snapshot.highFlagOpen) {
    for (const badge of snapshot.badges) {
      if (!badge.isActive) continue;
      if (snapshot.heldBadgeSlugs.has(badge.slug)) continue;
      const parsed = parseBadgeCriteria(badge.criteria);
      if (!parsed.ok) continue;
      if (evaluateCriterion(parsed.data, criteriaCtx)) {
        effects.push({
          kind: "badgeAward",
          badgeId: badge.id,
          slug: badge.slug,
          criteriaVersion: badge.criteriaVersion,
          xpReward: badge.xpReward,
        });
      }
    }
  }

  const questEvents: QuestEventFact[] = facts;
  for (const uq of snapshot.userQuests) {
    if (uq.status !== "ACTIVE") continue;
    const def = snapshot.quests.find((q) => q.id === uq.questId);
    if (!def) continue;
    const tasks = parseQuestTasks(def.tasks);
    if (!tasks.ok) continue;
    const derived = deriveQuestProgress(
      tasks.data,
      questEvents,
      event.occurredAt,
      uq.startedAt,
    );
    effects.push({
      kind: "questUpdate",
      userQuestId: uq.id,
      questId: uq.questId,
      progress: derived.tasks,
      completed: derived.completed,
      xpReward: derived.completed ? def.xpReward : 0,
      badgeSlug: derived.completed ? def.badgeSlug : null,
    });
  }

  if (
    event.type === "enrollment.started" ||
    event.type === "profile.section_completed"
  ) {
    const first = snapshot.quests.find(
      (q) => q.slug === "first-steps" && q.isActive,
    );
    if (first && snapshot.levelGates.passedActivityCount === 0) {
      effects.push({
        kind: "questAssign",
        questId: first.id,
        periodKey: "once",
      });
    }
  }
  if (event.type === "hackathon.registered") {
    const arrival = snapshot.quests.find(
      (q) => q.slug === "hackathon-arrival" && q.isActive,
    );
    if (arrival) {
      effects.push({
        kind: "questAssign",
        questId: arrival.id,
        periodKey: "once",
      });
    }
  }
  void FIRST_STEPS_SEGMENT;
  void HACKATHON_ARRIVAL_SEGMENT;
  void COMEBACK_SEGMENT;

  return effects;
}
