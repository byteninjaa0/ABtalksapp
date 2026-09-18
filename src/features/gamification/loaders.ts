/**
 * Plan 151 §30 — server-only reads. Own data only. Flag + try/catch so a
 * missing table hides the panel instead of 500ing the page. Never writes.
 */
import "server-only";

import { GamificationEventStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import {
  isBadgesUiEnabled,
  isGamificationEventsEnabled,
  isHackathonResultsBoardEnabled,
  isLeaderboardWeeklyEnabled,
  isQuestsEnabled,
  isSkillStagesEnabled,
  isWeekStreakEnabled,
  isXpUiEnabled,
} from "@/lib/feature-flags";
import { getIstDateKey, getIstWeekKey } from "@/lib/date-utils";
import { istWeekStartUtc, isWeekActive } from "./streak-weeks";
import { logger } from "@/lib/logger";
import {
  computeLevel,
  nextLevelTarget,
  unmetGates,
  V1_MAX_VISIBLE_LEVEL,
  type LevelGateSnapshot,
} from "./levels";
import { parseQuestTasks, deriveQuestProgress } from "./quests/progress";
import { displayRarity } from "./badges/criteria";

export type ProgressView = {
  xpTotal: number;
  level: number;
  levelName: string;
  next: {
    level: number;
    name: string;
    xpRequired: number;
    xpRemaining: number;
    gates: { key: string; label: string; met: boolean }[];
  } | null;
  teaser: string | null;
  /**
   * False until the first verified activity. The hub shows the welcome hint
   * instead of a 0 XP bar — an empty bar on day one reads as failure.
   */
  started: boolean;
  /**
   * True when this level was reached recently enough to celebrate. Decided on
   * the server so the client never has to read the clock during render.
   */
  levelIsFresh: boolean;
};

export type StreakDay = {
  /** Mon…Sun */
  label: string;
  dayKey: string;
  active: boolean;
  isToday: boolean;
  isFuture: boolean;
};

export type StreakView = {
  weekStreak: number;
  longestWeekStreak: number;
  streakFreezes: number;
  days: StreakDay[];
  activeDays: number;
  /** A week needs checked work on 2+ days, or one build/completion. */
  weekActive: boolean;
};

export type LedgerEntry = {
  id: string;
  eventType: string;
  label: string;
  amount: number | null;
  note: string | null;
  occurredAt: Date;
};

export type CohortMilestone = {
  key: string;
  label: string;
  done: boolean;
};

export type BadgeView = {
  /** UserBadge row id — what markBadgesSeenAction takes. Null until earned. */
  userBadgeId: string | null;
  slug: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  iconKey: string;
  earnedAt: Date | null;
  seenAt: Date | null;
  evidence: unknown;
};

export type QuestView = {
  slug: string;
  name: string;
  description: string;
  cadence: string;
  tasks: {
    taskKey: string;
    label: string;
    current: number;
    required: number;
    done: boolean;
  }[];
  currentIndex: number;
  completed: boolean;
  href: string | null;
};

/** A level-up is celebrated only while it is fresh — never on an old account's first load. */
const LEVEL_CELEBRATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function emptyGates(xpTotal: number): LevelGateSnapshot {
  return {
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
  };
}

async function gatesFor(userId: string, xpTotal: number): Promise<LevelGateSnapshot> {
  const [passed, days, builds, completions] = await Promise.all([
    prisma.gamificationEvent.count({
      where: {
        userId,
        type: "activity.passed",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT to_char(("occurredAt" AT TIME ZONE 'UTC') + interval '5 hours 30 minutes', 'YYYY-MM-DD')) AS n
      FROM "GamificationEvent"
      WHERE "userId" = ${userId}
        AND type = 'activity.passed'
        AND status = 'PROCESSED'::"GamificationEventStatus"
    `,
    prisma.gamificationEvent.count({
      where: {
        userId,
        status: GamificationEventStatus.PROCESSED,
        OR: [
          { type: "hackathon.submitted" },
          {
            type: "activity.passed",
            payload: { path: ["activityType"], equals: "PROJECT" },
          },
        ],
      },
    }),
    prisma.gamificationEvent.count({
      where: {
        userId,
        type: "enrollment.completed",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
  ]);
  return {
    ...emptyGates(xpTotal),
    passedActivityCount: passed,
    distinctVerifiedDays: Number(days[0]?.n ?? 0),
    hasVerifiedBuild: builds > 0,
    programCompletions: completions,
  };
}

export async function getMyProgress(userId: string): Promise<ProgressView | null> {
  if (!isXpUiEnabled() || !isGamificationEventsEnabled()) return null;
  try {
    const row = await prisma.userProgress.findUnique({
      where: { userId },
      select: { xpTotal: true, level: true, levelReachedAt: true },
    });
    const xpTotal = row?.xpTotal ?? 0;
    const snapshot = await gatesFor(userId, xpTotal);
    const current = computeLevel(snapshot, {
      skillStagesEnabled: isSkillStagesEnabled(),
    });
    const next = nextLevelTarget(snapshot, {
      skillStagesEnabled: isSkillStagesEnabled(),
    });
    const teaser =
      !isSkillStagesEnabled() && current.level >= V1_MAX_VISIBLE_LEVEL
        ? "Proven Builder unlocks when verified skills launch"
        : null;
    return {
      xpTotal,
      level: current.level,
      levelName: current.name,
      next: next
        ? {
            level: next.level,
            name: next.name,
            xpRequired: next.xpRequired,
            xpRemaining: Math.max(0, next.xpRequired - xpTotal),
            gates: unmetGates(next),
          }
        : null,
      teaser,
      started: snapshot.passedActivityCount > 0 || xpTotal > 0,
      levelIsFresh:
        row?.levelReachedAt != null &&
        Date.now() - row.levelReachedAt.getTime() <= LEVEL_CELEBRATION_WINDOW_MS,
    };
  } catch (err) {
    logger.info(
      {
        event: "gamification.read.failed",
        surface: "progress",
        err: err instanceof Error ? err.message : "unknown",
      },
      "gamification progress read failed",
    );
    return null;
  }
}

export async function getMyBadges(userId: string): Promise<BadgeView[]> {
  if (!isBadgesUiEnabled() || !isGamificationEventsEnabled()) return [];
  try {
    const defs = await prisma.badgeDefinition.findMany({
      where: { isActive: true, isHidden: false },
      orderBy: { sortOrder: "asc" },
      select: {
        slug: true,
        name: true,
        description: true,
        category: true,
        baseRarity: true,
        measuredRarity: true,
        iconKey: true,
        earnedCount: true,
        createdAt: true,
        holders: {
          where: { userId, revokedAt: null },
          select: { id: true, earnedAt: true, seenAt: true, evidence: true },
          take: 1,
        },
      },
    });
    const eligible = await prisma.gamificationEvent.groupBy({
      by: ["userId"],
      where: {
        type: "activity.passed",
        status: GamificationEventStatus.PROCESSED,
        occurredAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      },
    });
    const now = Date.now();
    return defs.map((d) => {
      const holder = d.holders[0] ?? null;
      const rarity = displayRarity({
        baseRarity: d.baseRarity,
        measuredRarity: d.measuredRarity,
        earnedCount: d.earnedCount,
        eligibleActive: eligible.length,
        badgeAgeDays: Math.floor((now - d.createdAt.getTime()) / 86400000),
      });
      return {
        userBadgeId: holder?.id ?? null,
        slug: d.slug,
        name: d.name,
        description: d.description,
        category: d.category,
        rarity,
        iconKey: d.iconKey,
        earnedAt: holder?.earnedAt ?? null,
        seenAt: holder?.seenAt ?? null,
        evidence: holder?.evidence ?? null,
      };
    });
  } catch {
    return [];
  }
}

export async function getMyQuests(userId: string): Promise<QuestView[]> {
  if (!isQuestsEnabled() || !isGamificationEventsEnabled()) return [];
  try {
    const rows = await prisma.userQuest.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        startedAt: true,
        progress: true,
        quest: {
          select: {
            slug: true,
            name: true,
            description: true,
            cadence: true,
            tasks: true,
          },
        },
      },
      take: 4,
    });
    const events = await prisma.gamificationEvent.findMany({
      where: { userId, status: GamificationEventStatus.PROCESSED },
      select: { type: true, occurredAt: true, payload: true },
    });
    const facts = events.map((e) => ({
      type: e.type,
      occurredAt: e.occurredAt,
      payload:
        e.payload && typeof e.payload === "object" && !Array.isArray(e.payload)
          ? (e.payload as Record<string, unknown>)
          : {},
    }));
    const now = new Date();
    const mapped = rows.map((row) => {
      const parsed = parseQuestTasks(row.quest.tasks);
      const derived = parsed.ok
        ? deriveQuestProgress(parsed.data, facts, now, row.startedAt)
        : { tasks: [], completed: false, currentIndex: 0 };
      const current = derived.tasks[derived.currentIndex];
      return {
        slug: row.quest.slug,
        name: row.quest.name,
        description: row.quest.description,
        cadence: row.quest.cadence,
        tasks: derived.tasks,
        currentIndex: derived.currentIndex,
        completed: derived.completed,
        href: hrefForQuestTask(row.quest.slug, current?.taskKey),
      };
    });
    if (mapped.length > 0) return mapped;

    const hasPass = facts.some((e) => e.type === "activity.passed");
    const lastPass = facts
      .filter((e) => e.type === "activity.passed")
      .reduce<Date | null>((acc, e) => (!acc || e.occurredAt > acc ? e.occurredAt : acc), null);
    const dormant =
      hasPass &&
      lastPass != null &&
      now.getTime() - lastPass.getTime() > 30 * 24 * 60 * 60 * 1000;
    const registered = facts.some((e) => e.type === "hackathon.registered");
    const slug = !hasPass
      ? registered
        ? "hackathon-arrival"
        : "first-steps"
      : dormant
        ? "comeback"
        : null;
    if (!slug) return [];
    const def = await prisma.questDefinition.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        description: true,
        cadence: true,
        tasks: true,
      },
    });
    if (!def) return [];
    const parsed = parseQuestTasks(def.tasks);
    const derived = parsed.ok
      ? deriveQuestProgress(parsed.data, facts, now, now)
      : { tasks: [], completed: false, currentIndex: 0 };
    const current = derived.tasks[derived.currentIndex];
    return [
      {
        slug: def.slug,
        name: def.name,
        description: def.description,
        cadence: def.cadence,
        tasks: derived.tasks,
        currentIndex: derived.currentIndex,
        completed: derived.completed,
        href: hrefForQuestTask(def.slug, current?.taskKey),
      },
    ];
  } catch {
    return [];
  }
}

function hrefForQuestTask(slug: string, taskKey: string | undefined): string | null {
  if (!taskKey) return "/dashboard";
  if (taskKey.includes("headline") || taskKey.includes("education") || taskKey.includes("profile")) {
    return "/profile";
  }
  if (taskKey.includes("hackathon") || slug === "hackathon-arrival") return "/hackathon";
  if (taskKey.includes("join") || taskKey.includes("track")) return "/challenges";
  return "/dashboard";
}

export async function getBoard(input: {
  board: "weekly" | "hackathon";
  periodKey?: string;
  viewerUserId: string;
  limit?: number;
}): Promise<{
  rows: {
    rank: number;
    displayName: string;
    xp: number;
    isViewer: boolean;
    /** Published placement band, hackathon board only. */
    placement: string | null;
  }[];
  viewerRank: number | null;
} | null> {
  const limit = Math.min(input.limit ?? 50, 50);
  try {
    if (input.board === "weekly") {
      if (!isLeaderboardWeeklyEnabled()) return null;
      const periodKey = input.periodKey ?? getIstWeekKey();
      const rows = await prisma.xpPeriodScore.findMany({
        where: { periodType: "WEEK", periodKey },
        orderBy: [{ xp: "desc" }, { lastXpAt: "asc" }],
        take: limit,
        select: {
          userId: true,
          xp: true,
          user: { select: { name: true, disabledAt: true, deletedAt: true } },
        },
      });
      const visible = rows.filter(
        (r) => r.user.disabledAt == null && r.user.deletedAt == null,
      );
      return {
        rows: visible.map((r, i) => ({
          rank: i + 1,
          displayName: pseudonym(r.user.name),
          xp: r.xp,
          isViewer: r.userId === input.viewerUserId,
          placement: null,
        })),
        viewerRank:
          visible.findIndex((r) => r.userId === input.viewerUserId) + 1 || null,
      };
    }
    if (!isHackathonResultsBoardEnabled()) return null;
    const creds = await prisma.credential.findMany({
      where: {
        type: "PLACEMENT",
        status: "ISSUED",
        sourceType: "HACKATHON_TEAM",
      },
      select: {
        userId: true,
        metadata: true,
        title: true,
        user: { select: { name: true } },
      },
      take: limit,
    });
    const order = ["winner", "second", "third", "top5", "finalist", "top10pct"];
    const ranked = creds
      .map((c) => {
        const meta =
          c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
            ? (c.metadata as Record<string, unknown>)
            : {};
        const variant = String(meta.hackathonVariant ?? "");
        return { ...c, variant, rank: order.indexOf(variant) };
      })
      .filter((c) => c.rank >= 0)
      .sort((a, b) => a.rank - b.rank);
    return {
      rows: ranked.map((r, i) => ({
        rank: i + 1,
        displayName: pseudonym(r.user.name),
        xp: 0,
        isViewer: r.userId === input.viewerUserId,
        placement: PLACEMENT_LABEL[r.variant] ?? r.variant,
      })),
      viewerRank:
        ranked.findIndex((r) => r.userId === input.viewerUserId) + 1 || null,
    };
  } catch {
    return null;
  }
}

/** Published placement bands, as the certificates record them. */
const PLACEMENT_LABEL: Record<string, string> = {
  winner: "Winner",
  second: "Runner up",
  third: "Second runner up",
  top5: "Top 5",
  finalist: "Finalist",
  top10pct: "Top 10%",
};

function pseudonym(name: string | null): string {
  const parts = (name ?? "Builder").trim().split(/\s+/);
  const first = parts[0] ?? "Builder";
  const last = parts[1]?.[0] ?? "";
  return last ? `${first} ${last}.` : first;
}

/** T3+ events: one of these alone keeps a week alive (plan 151 §10). */
const T3_TYPES = ["hackathon.submitted", "enrollment.completed", "hackathon.placed"];

/**
 * The week strip: which IST days this week carry checked work, and the streak
 * state behind it. Read-only — week close happens in the sweep, never here.
 */
export async function getStreakView(userId: string): Promise<StreakView | null> {
  if (!isWeekStreakEnabled() || !isGamificationEventsEnabled()) return null;
  try {
    const weekKey = getIstWeekKey();
    const weekStart = istWeekStartUtc(weekKey);
    const [row, events] = await Promise.all([
      prisma.userProgress.findUnique({
        where: { userId },
        select: { weekStreak: true, longestWeekStreak: true, streakFreezes: true },
      }),
      prisma.gamificationEvent.findMany({
        where: {
          userId,
          status: GamificationEventStatus.PROCESSED,
          occurredAt: { gte: weekStart },
          type: { in: ["activity.passed", ...T3_TYPES] },
        },
        select: { type: true, occurredAt: true },
      }),
    ]);

    const activeKeys = new Set(
      events
        .filter((e) => e.type === "activity.passed")
        .map((e) => getIstDateKey(e.occurredAt)),
    );
    const todayKey = getIstDateKey();
    const days: StreakDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
      (label, i) => {
        const dayKey = getIstDateKey(addDays(weekStart, i));
        return {
          label,
          dayKey,
          active: activeKeys.has(dayKey),
          isToday: dayKey === todayKey,
          isFuture: dayKey > todayKey,
        };
      },
    );
    const hasT3 = events.some((e) => T3_TYPES.includes(e.type));
    return {
      weekStreak: row?.weekStreak ?? 0,
      longestWeekStreak: row?.longestWeekStreak ?? 0,
      streakFreezes: row?.streakFreezes ?? 0,
      days,
      activeDays: activeKeys.size,
      weekActive: isWeekActive({ distinctVerifiedDays: activeKeys.size, hasT3Event: hasT3 }),
    };
  } catch {
    return null;
  }
}

const LEDGER_LABEL: Record<string, string> = {
  "activity.passed": "Activity passed",
  "enrollment.started": "Track joined",
  "enrollment.completed": "Programme completed",
  "credential.issued": "Credential issued",
  "profile.section_completed": "Profile section completed",
  "hackathon.registered": "Hackathon registration",
  "hackathon.submitted": "Hackathon submission",
  "hackathon.placed": "Hackathon placement",
  "assessment.completed": "Assessment completed",
  "mock_interview.completed": "Mock interview completed",
  "referral.qualified": "Referral qualified",
  "skill_evidence.added": "Skill evidence added",
};

/**
 * The proof ledger: what the platform checked, and what it paid. Labels are
 * resolved from the source rows — event payloads carry ids only, never titles.
 */
export async function getLedger(
  userId: string,
  limit = 8,
): Promise<LedgerEntry[]> {
  if (!isXpUiEnabled() || !isGamificationEventsEnabled()) return [];
  try {
    const events = await prisma.gamificationEvent.findMany({
      where: { userId, status: GamificationEventStatus.PROCESSED },
      orderBy: { occurredAt: "desc" },
      take: Math.min(limit, 20),
      select: { id: true, type: true, occurredAt: true, payload: true },
    });
    if (events.length === 0) return [];

    const xp = await prisma.xpTransaction.groupBy({
      by: ["eventId"],
      where: { userId, eventId: { in: events.map((e) => e.id) } },
      _sum: { amount: true },
    });
    const xpByEvent = new Map(xp.map((r) => [r.eventId, r._sum.amount ?? 0]));

    const activityIds = events
      .map((e) => payloadString(e.payload, "activityId"))
      .filter((v): v is string => v != null);
    const activities = activityIds.length
      ? await prisma.activity.findMany({
          where: { id: { in: activityIds } },
          select: { id: true, title: true, dayNumber: true },
        })
      : [];
    const byActivity = new Map(activities.map((a) => [a.id, a]));

    return events.map((e) => {
      const activityId = payloadString(e.payload, "activityId");
      const activity = activityId ? byActivity.get(activityId) : undefined;
      const label = activity
        ? activity.dayNumber != null
          ? `Day ${activity.dayNumber} · ${activity.title}`
          : activity.title
        : LEDGER_LABEL[e.type] ?? e.type;
      const amount = xpByEvent.get(e.id) ?? null;
      return {
        id: e.id,
        eventType: e.type,
        label,
        amount: amount && amount !== 0 ? amount : null,
        note: amount ? null : noteForEvent(e.type),
        occurredAt: e.occurredAt,
      };
    });
  } catch {
    return [];
  }
}

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function noteForEvent(type: string): string | null {
  if (type === "skill_evidence.added") return "evidence";
  if (type === "enrollment.started" || type === "hackathon.registered") return "no XP";
  return null;
}

/** Module-position milestones, derived from the cohort's own activity list. */
function milestonesFor(
  completed: number,
  total: number,
  hasBuild: boolean,
  isComplete: boolean,
): CohortMilestone[] {
  return [
    { key: "week1", label: "Week 1", done: completed >= Math.min(7, Math.ceil(total * 0.2)) },
    { key: "halfway", label: "Halfway", done: total > 0 && completed >= Math.ceil(total / 2) },
    { key: "build", label: "Boss build", done: hasBuild },
    { key: "final", label: "Final project", done: isComplete },
    { key: "complete", label: "Complete", done: isComplete },
  ];
}

export async function getCohortPanel(
  userId: string,
): Promise<{
  enrollmentId: string;
  cohortName: string;
  completed: number;
  total: number;
  percentile: number | null;
  milestones: CohortMilestone[];
  dayLabel: string | null;
  freezeNote: string | null;
} | null> {
  if (!isXpUiEnabled()) return null;
  try {
    const enrollment = await prisma.programEnrollment.findFirst({
      where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        cohortId: true,
        status: true,
        cohort: { select: { name: true } },
        progress: {
          select: {
            completedActivities: true,
            totalActivities: true,
            percentCompleteBp: true,
          },
        },
      },
    });
    if (!enrollment?.progress) return null;
    const mine = enrollment.progress.percentCompleteBp;
    const total = await prisma.enrollmentProgress.count({
      where: { cohortId: enrollment.cohortId },
    });
    const below = await prisma.enrollmentProgress.count({
      where: { cohortId: enrollment.cohortId, percentCompleteBp: { lt: mine } },
    });
    const percentile =
      total > 1 ? Math.round((below / (total - 1)) * 100) : null;
    const hasBuild = await prisma.activityAttempt.count({
      where: {
        enrollmentId: enrollment.id,
        passed: true,
        activity: { type: { in: ["PROJECT", "ASSIGNMENT"] } },
      },
    });
    const isComplete = enrollment.status === "COMPLETED";
    const completed = enrollment.progress.completedActivities;
    const totalActivities = enrollment.progress.totalActivities;
    return {
      enrollmentId: enrollment.id,
      cohortName: enrollment.cohort.name,
      completed,
      total: totalActivities,
      percentile,
      milestones: milestonesFor(completed, totalActivities, hasBuild > 0, isComplete),
      dayLabel:
        totalActivities > 0 ? `Day ${Math.min(completed + (isComplete ? 0 : 1), totalActivities)} of ${totalActivities}` : null,
      freezeNote: null,
    };
  } catch {
    return null;
  }
}
