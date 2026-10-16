/**
 * Plan 195 — build the canonical learning spine for the challenge track.
 *
 * WHY THIS EXISTS. `prisma/seed.ts` seeds the content tables (`Challenge`,
 * `DailyTask`, `Quiz`) but not the canonical 078 model those are projected
 * into — `LearningProgram` → `ProgramVersion` → `Module` → `Activity`, plus the
 * `legacy-<domain>` `Cohort` every challenge `ProgramEnrollment` points at.
 * `seedTestUsers` then throws `Missing cohort legacy-se`.
 *
 * The script that used to create them, `prisma/scripts/migrate-2d-learning-
 * content.ts`, cannot run any more: it imports `./migrate-078-shared`, which is
 * not in the repository (plan 078 is complete and the shared module went with
 * it). So as things stand there is NO path from a clean database to a working
 * one, and that is not specific to the test environment — it is true for anyone
 * cloning this repo.
 *
 * This fills that gap for the test environment only, deriving the spine from
 * the content rows rather than from the dropped legacy tables. It is NOT a
 * replacement for a real seed and claims no completeness beyond what the test
 * environment needs: the challenge track resolving, unlocking and enrolling.
 *
 * Shapes are taken from the read path, not invented:
 *   - program slugs from `PROGRAM_SLUG` in `src/repositories/learning.ts`
 *   - cohort slugs from `cohortSlugForDomain` in `src/repositories/ids.ts`
 *   - activity ids from `activityIdForDailyTask` / `activityIdForQuiz`, which
 *     `ActivityAttempt.activityId` is a real FK against.
 */
import {
  ActivityType,
  ProgramMissionType,
  CohortStartMode,
  CohortStatus,
  Domain,
  ProgramFormat,
  ProgramVersionStatus,
} from "@prisma/client";

import { prisma } from "../../src/lib/db";
import {
  activityIdForDailyTask,
  activityIdForProgramDay,
  activityIdForQuiz,
  cohortSlugForDomain,
} from "../../src/repositories/ids";

/** Must match `PROGRAM_SLUG` in `src/repositories/learning.ts` exactly. */
const PROGRAM_SLUG: Record<Domain, string> = {
  SE: "software-engineering-challenge",
  DS: "data-science-challenge",
  AI: "ai-engineering-challenge",
  CLAUDE: "claude-challenge",
};

const CATEGORY_SLUG = "challenges";

export type LearningContentResult = {
  programs: number;
  cohorts: number;
  activities: number;
};

/**
 * Create or refresh the spine for every `Challenge` row present.
 *
 * Driven by the challenges that exist rather than by the `Domain` enum, so a
 * checkout whose content JSON only covers some domains gets a consistent
 * environment instead of empty programs pointing at nothing.
 */
export async function buildLearningContent(): Promise<LearningContentResult> {
  const challenges = await prisma.challenge.findMany({
    select: {
      id: true,
      domain: true,
      title: true,
      description: true,
      totalDays: true,
      isActive: true,
      startsAt: true,
    },
  });

  if (challenges.length === 0) {
    throw new Error(
      "No Challenge rows — run the content seed before building the learning spine.",
    );
  }

  const category = await prisma.programCategory.upsert({
    where: { slug: CATEGORY_SLUG },
    create: {
      slug: CATEGORY_SLUG,
      name: "Challenges",
      description: "The 60-day domain challenges.",
      sortOrder: 0,
    },
    update: {},
    select: { id: true },
  });

  let activities = 0;

  for (const challenge of challenges) {
    const slug = PROGRAM_SLUG[challenge.domain];
    if (!slug) continue;

    const program = await prisma.learningProgram.upsert({
      where: { slug },
      create: {
        slug,
        title: challenge.title,
        description: challenge.description,
        categoryId: category.id,
        format: ProgramFormat.CHALLENGE,
        // `getChallengeByDomain` reports `isActive` from THIS field, not from
        // `Challenge.isActive` — an unpublished program reads as an inactive
        // challenge and the track disappears from the dashboard.
        isPublished: challenge.isActive,
      },
      update: {
        title: challenge.title,
        description: challenge.description,
        isPublished: challenge.isActive,
      },
      select: { id: true },
    });

    const version = await prisma.programVersion.upsert({
      where: {
        programId_versionNumber: { programId: program.id, versionNumber: 1 },
      },
      create: {
        programId: program.id,
        versionNumber: 1,
        status: ProgramVersionStatus.PUBLISHED,
        // `getChallengeByDomain` reads totalDays from here, falling back to 60.
        plannedDurationDays: challenge.totalDays,
        publishedAt: new Date(),
      },
      update: {
        status: ProgramVersionStatus.PUBLISHED,
        plannedDurationDays: challenge.totalDays,
      },
      select: { id: true },
    });

    // One module spanning the whole challenge. The canonical model wants
    // modules, the challenge track has no module concept of its own, and
    // inventing four arbitrary ones would put structure in the fixtures that
    // the product does not have.
    const challengeModule = await prisma.module.upsert({
      where: {
        programVersionId_position: {
          programVersionId: version.id,
          position: 1,
        },
      },
      create: {
        programVersionId: version.id,
        position: 1,
        title: `${challenge.domain} — 60 days`,
        startDay: 1,
        endDay: challenge.totalDays,
      },
      update: { endDay: challenge.totalDays },
      select: { id: true },
    });

    await prisma.cohort.upsert({
      where: { slug: cohortSlugForDomain(challenge.domain) },
      create: {
        slug: cohortSlugForDomain(challenge.domain),
        name: `${challenge.title} (test)`,
        programVersionId: version.id,
        // ROLLING, because a challenge enrollment's day 1 is the day that
        // candidate started — `Challenge.startsAt` being null is exactly what
        // "rolling start from enrollment.startedAt" means in the schema note.
        // The Claude cohort has an anchor, so it gets FIXED.
        startMode: challenge.startsAt
          ? CohortStartMode.FIXED
          : CohortStartMode.ROLLING,
        startsAt: challenge.startsAt,
        status: CohortStatus.ACTIVE,
        timezone: "Asia/Kolkata",
        // Opened so the hire desk can see results for completed candidates;
        // the desk gates recruiter visibility on this.
        resultsPublishedAt: new Date(),
      },
      update: {
        programVersionId: version.id,
        status: CohortStatus.ACTIVE,
        resultsPublishedAt: new Date(),
      },
      select: { id: true },
    });

    // --- Activities ------------------------------------------------------
    // Deterministic ids, because ActivityAttempt.activityId is a real FK and
    // `seedTestUsers` writes attempts at `act_dt_<dailyTaskId>` without
    // looking them up.
    const tasks = await prisma.dailyTask.findMany({
      where: { challengeId: challenge.id },
      select: { id: true, dayNumber: true, title: true, estimatedMinutes: true },
      orderBy: { dayNumber: "asc" },
    });

    for (const task of tasks) {
      await prisma.activity.upsert({
        where: { id: activityIdForDailyTask(task.id) },
        create: {
          id: activityIdForDailyTask(task.id),
          moduleId: challengeModule.id,
          position: task.dayNumber,
          type: ActivityType.DAILY_CHALLENGE,
          title: task.title,
          dayNumber: task.dayNumber,
          points: 10,
          isRequired: true,
          estimatedMinutes: task.estimatedMinutes,
        },
        update: { title: task.title, dayNumber: task.dayNumber },
        select: { id: true },
      });
      activities += 1;
    }

    const quizzes = await prisma.quiz.findMany({
      where: { challengeId: challenge.id },
      select: { id: true, weekNumber: true, title: true },
      orderBy: { weekNumber: "asc" },
    });

    for (const quiz of quizzes) {
      await prisma.activity.upsert({
        where: { id: activityIdForQuiz(quiz.id) },
        create: {
          id: activityIdForQuiz(quiz.id),
          moduleId: challengeModule.id,
          // Offset past the daily tasks so `(programVersionId, position)`
          // style ordering stays stable and quizzes never collide with a day.
          position: 1000 + quiz.weekNumber,
          type: ActivityType.QUIZ,
          title: quiz.title,
          dayNumber: quiz.weekNumber * 7,
          points: 20,
          isRequired: false,
        },
        update: { title: quiz.title },
        select: { id: true },
      });
      activities += 1;
    }

    // `requiredActivityCount` is the denominator for progress %, and is
    // documented as recomputed on publish — so recompute it here, where
    // publishing effectively happens.
    const requiredActivityCount = await prisma.activity.count({
      where: { module: { programVersionId: version.id }, isRequired: true },
    });
    const points = await prisma.activity.aggregate({
      where: { module: { programVersionId: version.id } },
      _sum: { points: true },
    });
    await prisma.programVersion.update({
      where: { id: version.id },
      data: {
        requiredActivityCount,
        totalPoints: points._sum.points ?? 0,
      },
      select: { id: true },
    });
  }

  return {
    programs: challenges.length,
    cohorts: challenges.length,
    activities,
  };
}

// ---------------------------------------------------------------------------
// The AI Cohort program (/program, 31 days)
// ---------------------------------------------------------------------------

/** Must match `AI_COHORT_SLUG` in `src/repositories/learning.ts`. */
const AI_COHORT_SLUG = "ai-cohort-program";

/** What a mission type becomes in the canonical model. Mirrors migrate-2d. */
function missionActivityType(
  missionType: ProgramMissionType,
  isProjectDay: boolean,
): ActivityType {
  if (isProjectDay) return ActivityType.PROJECT;
  switch (missionType) {
    case ProgramMissionType.CODE_SPRINT:
    case ProgramMissionType.DATA_ROOM:
      return ActivityType.CODING;
    case ProgramMissionType.SHIP_IT:
      return ActivityType.EXTERNAL_SUBMISSION;
    case ProgramMissionType.PROMPT_FORGE:
      return ActivityType.ASSIGNMENT;
    case ProgramMissionType.BOSS_BUILD:
      return ActivityType.PROJECT;
    default:
      return ActivityType.ASSIGNMENT;
  }
}

/**
 * The canonical spine for the AI-cohort program, derived from the `ProgramDay`
 * rows that `prisma/seed-program.ts` writes.
 *
 * This is why that seed is run TWICE by the bootstrap. Its day loop upserts
 * `ProgramDay` rows and then, in the same run, requires an `Activity` at
 * `act_pd_<dayId>` for each one — an Activity only this function creates. On a
 * clean database the first pass therefore cannot succeed: there are no days to
 * build activities from until it has written them. Pass one writes the days and
 * fails the check, this builds the activities, pass two completes.
 *
 * Returns 0 when no ProgramDay rows exist, so a checkout without the program
 * content JSON reports "skipped" rather than failing.
 */
export async function buildProgramSpine(): Promise<number> {
  const days = await prisma.programDay.findMany({
    select: {
      id: true,
      dayNumber: true,
      title: true,
      missionType: true,
      isProjectDay: true,
      missionPoints: true,
      estimatedMin: true,
      moduleId: true,
    },
    orderBy: { dayNumber: "asc" },
  });
  if (days.length === 0) return 0;

  const category = await prisma.programCategory.upsert({
    where: { slug: "cohorts" },
    create: { slug: "cohorts", name: "Cohort programs", sortOrder: 1 },
    update: {},
    select: { id: true },
  });

  const program = await prisma.learningProgram.upsert({
    where: { slug: AI_COHORT_SLUG },
    create: {
      slug: AI_COHORT_SLUG,
      title: "AI Cohort Program",
      description: "31-day AI cohort for working professionals.",
      categoryId: category.id,
      format: ProgramFormat.COHORT,
      isPublished: true,
    },
    update: { isPublished: true },
    select: { id: true },
  });

  const version = await prisma.programVersion.upsert({
    where: {
      programId_versionNumber: { programId: program.id, versionNumber: 1 },
    },
    create: {
      programId: program.id,
      versionNumber: 1,
      status: ProgramVersionStatus.PUBLISHED,
      plannedDurationDays: 31,
      publishedAt: new Date(),
    },
    update: { status: ProgramVersionStatus.PUBLISHED, plannedDurationDays: 31 },
    select: { id: true },
  });

  // One canonical Module per ProgramModule, so the program's own four-module
  // structure survives into the canonical model instead of being flattened.
  const programModules = await prisma.programModule.findMany({
    select: { id: true, number: true, title: true, subtitle: true, color: true, startDay: true, endDay: true },
    orderBy: { number: "asc" },
  });

  const moduleIdByProgramModule = new Map<string, string>();
  for (const pm of programModules) {
    const mod = await prisma.module.upsert({
      where: {
        programVersionId_position: {
          programVersionId: version.id,
          position: pm.number,
        },
      },
      create: {
        programVersionId: version.id,
        position: pm.number,
        title: pm.title,
        subtitle: pm.subtitle,
        colorToken: pm.color,
        startDay: pm.startDay,
        endDay: pm.endDay,
      },
      update: { title: pm.title, startDay: pm.startDay, endDay: pm.endDay },
      select: { id: true },
    });
    moduleIdByProgramModule.set(pm.id, mod.id);
  }

  // Fallback for a day whose ProgramModule is missing — better a usable
  // environment than a hard failure on content that may be partial.
  const fallbackModuleId =
    moduleIdByProgramModule.values().next().value ??
    (
      await prisma.module.upsert({
        where: {
          programVersionId_position: {
            programVersionId: version.id,
            position: 99,
          },
        },
        create: {
          programVersionId: version.id,
          position: 99,
          title: "Unassigned days",
        },
        update: {},
        select: { id: true },
      })
    ).id;

  let built = 0;
  for (const day of days) {
    await prisma.activity.upsert({
      where: { id: activityIdForProgramDay(day.id) },
      create: {
        id: activityIdForProgramDay(day.id),
        moduleId: moduleIdByProgramModule.get(day.moduleId) ?? fallbackModuleId,
        position: day.dayNumber,
        type: missionActivityType(day.missionType, day.isProjectDay),
        title: day.title,
        dayNumber: day.dayNumber,
        points: day.missionPoints,
        isRequired: true,
        estimatedMinutes: day.estimatedMin,
      },
      update: {
        title: day.title,
        dayNumber: day.dayNumber,
        points: day.missionPoints,
        moduleId: moduleIdByProgramModule.get(day.moduleId) ?? fallbackModuleId,
      },
      select: { id: true },
    });
    built += 1;
  }

  const requiredActivityCount = await prisma.activity.count({
    where: { module: { programVersionId: version.id }, isRequired: true },
  });
  const points = await prisma.activity.aggregate({
    where: { module: { programVersionId: version.id } },
    _sum: { points: true },
  });
  await prisma.programVersion.update({
    where: { id: version.id },
    data: { requiredActivityCount, totalPoints: points._sum.points ?? 0 },
    select: { id: true },
  });

  return built;
}
