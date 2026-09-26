import "server-only";
import type { Domain } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getBalance } from "@/repositories/points";
import { getCandidateDetail } from "@/repositories/candidate-detail";
import { listQuizCatalog } from "@/repositories/learning";
import { listPassedChallengeDays, listQuizAttemptsForUser } from "@/repositories/progress";
import { formatInTimeZone } from "date-fns-tz";
import {
  IST,
  addCalendarDaysToKey,
  getElapsedDayNumber,
} from "@/lib/date-utils";
import type { ActivityCell } from "@/features/dashboard/get-activity-heatmap";
import { getResumeView } from "@/features/resume/service";
import {
  computeCompleteness,
  type SectionStatus,
} from "@/features/profile/completeness";
import { getHistory } from "@/features/interview/platform/service";
import { getAvailableQuiz } from "@/features/quiz/get-available-quiz";
import { listCandidateAttempts } from "@/features/assessment-attempts/service";
import { prismaAttemptStore } from "@/features/assessment-attempts/prisma-store";
import { HACKATHON } from "@/components/hackathon/hackathon-config";
import type { HubEnrollment } from "@/features/dashboard/get-hub-data";

/**
 * Extra reads for the three-stage hub (Build skills → Test skills → Get
 * hired). Read-only calls into existing features; every piece degrades to an
 * empty/zero value on failure so the dashboard never 500s over one of them.
 */

/** A weekly quiz counts as passed at this share of questions correct. */
export const QUIZ_PASS_RATIO = 0.6;

/** One square of the 60-day grid. `level` 1–5 drives an active square's shade. */
export type SixtyDay =
  | { day: number; status: "active"; level: 1 | 2 | 3 | 4 | 5 }
  | { day: number; status: "missed" | "future" };

export type StageData = {
  sixty: SixtyDay[];
  synergyPoints: number;
  profile: {
    score: number;
    sections: SectionStatus[];
    openToWork: boolean;
  };
  mock: { completed: number };
  quiz: { passed: boolean; readyHref: string | null };
  hackathon: { submitted: boolean; registered: boolean; live: boolean; registrationOpen: boolean };
  assessments: { pending: number };
};

function degrade<T>(label: string, fallback: T) {
  return (e: unknown): T => {
    logger.warn(`[dashboard] ${label} unavailable`, {
      message: e instanceof Error ? e.message : String(e),
    });
    return fallback;
  };
}

async function loadProfile(userId: string): Promise<StageData["profile"]> {
  const [detail, resume] = await Promise.all([
    getCandidateDetail(userId),
    getResumeView(userId).catch(() => null),
  ]);
  if (!detail) return { score: 0, sections: [], openToWork: false };
  const { score, sections } = computeCompleteness(detail, {
    hasResume: Boolean(detail.resumeUrl?.trim()) || resume?.status === "READY",
  });
  return { score, sections, openToWork: detail.preference?.openToWork ?? false };
}

async function loadMock(userId: string): Promise<StageData["mock"]> {
  const history = await getHistory(userId);
  const completed = history.ok
    ? history.data.filter((a) => a.status === "COMPLETED").length
    : 0;
  return { completed };
}

async function loadQuiz(
  userId: string,
  enrollments: HubEnrollment[],
): Promise<StageData["quiz"]> {
  const domains = [...new Set(enrollments.map((e) => e.domain))] as Domain[];
  const catalogs = (await Promise.all(domains.map((d) => listQuizCatalog(d)))).flat();
  const questions = new Map(catalogs.map((q) => [q.id, q.questionCount]));
  const attempts = await listQuizAttemptsForUser(userId, [...questions.keys()]);
  const passed = attempts.some((a) => {
    const total = questions.get(a.quizId) ?? 0;
    return total > 0 && a.score / total >= QUIZ_PASS_RATIO;
  });

  // First active track with a quiz ready to take right now.
  let readyHref: string | null = null;
  for (const e of enrollments.filter((x) => x.status === "ACTIVE")) {
    const available = await getAvailableQuiz(userId, {
      challengeId: "",
      domain: e.domain,
      daysCompleted: e.daysCompleted,
      status: "ACTIVE",
    });
    const id = available.quiz && available.reason === "ready"
      ? available.quiz.id
      : available.banner?.quizId;
    if (id) {
      readyHref = `/quiz/${id}`;
      break;
    }
  }
  return { passed, readyHref };
}

async function loadHackathon(userId: string): Promise<StageData["hackathon"]> {
  const [submission, participant] = await Promise.all([
    prisma.hackathonSubmission.findFirst({
      where: { team: { participants: { some: { userId } } } },
      select: { id: true },
    }),
    prisma.hackathonParticipant.findFirst({
      where: { userId, eventId: HACKATHON.eventId },
      select: { id: true },
    }),
  ]);
  const now = Date.now();
  return {
    submitted: submission !== null,
    registered: participant !== null,
    live:
      now >= Date.parse(HACKATHON.kickoffUtc) &&
      now <= Date.parse(HACKATHON.deadlineUtc),
    registrationOpen:
      HACKATHON.registrationOpen && now < Date.parse(HACKATHON.registrationClosesUtc),
  };
}

/**
 * The primary track's 60 days: passed → active (shaded by that date's
 * submission count), past and not passed → missed, the rest → future.
 * Today stays "future" until it's passed.
 */
async function loadSixty(
  enrollment: HubEnrollment | null,
  cells: ActivityCell[],
): Promise<SixtyDay[]> {
  if (!enrollment) return [];
  const passed = new Set(await listPassedChallengeDays(enrollment.id));
  const today = getElapsedDayNumber(enrollment.startedAt);
  const startKey = formatInTimeZone(enrollment.startedAt, IST, "yyyy-MM-dd");
  const levelByDate = new Map(cells.map((c) => [c.date, c.level]));
  return Array.from({ length: 60 }, (_, i): SixtyDay => {
    const day = i + 1;
    if (passed.has(day)) {
      const heat = levelByDate.get(addCalendarDaysToKey(startKey, i)) ?? 0;
      return { day, status: "active", level: (Math.min(4, heat) + 1) as 1 | 2 | 3 | 4 | 5 };
    }
    return { day, status: day < today ? "missed" : "future" };
  });
}

async function loadAssessments(userId: string): Promise<StageData["assessments"]> {
  const listed = await listCandidateAttempts(prismaAttemptStore(), userId);
  const pending = listed.ok
    ? listed.data.filter((a) => a.status !== "SUBMITTED").length
    : 0;
  return { pending };
}

export async function getStageData(
  userId: string,
  enrollments: HubEnrollment[],
  cells: ActivityCell[],
): Promise<StageData> {
  const primary = enrollments.find((e) => e.status === "ACTIVE") ?? enrollments[0] ?? null;
  const [sixty, synergyPoints, profile, mock, quiz, hackathon, assessments] =
    await Promise.all([
      loadSixty(primary, cells).catch(degrade("60-day grid", [] as SixtyDay[])),
      getBalance(userId).catch(degrade("synergy points", 0)),
      loadProfile(userId).catch(
        degrade("profile strength", { score: 0, sections: [], openToWork: false }),
      ),
      loadMock(userId).catch(degrade("mock interviews", { completed: 0 })),
      loadQuiz(userId, enrollments).catch(
        degrade("weekly quiz", { passed: false, readyHref: null }),
      ),
      loadHackathon(userId).catch(
        degrade("hackathon", {
          submitted: false,
          registered: false,
          live: false,
          registrationOpen: false,
        }),
      ),
      loadAssessments(userId).catch(degrade("assessments", { pending: 0 })),
    ]);
  return { sixty, synergyPoints, profile, mock, quiz, hackathon, assessments };
}
