import { SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getIstDateKeyForChallengeDay, IST } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";

export type HeatmapCellStatus = "on_time" | "late" | "pending" | "missed";

export type HeatmapCell = {
  dayNumber: number;
  date: string;
  status: HeatmapCellStatus;
  /** Daily task metadata when the challenge defines this day */
  taskTitle: string | null;
  problemStatement: string | null;
  /** Submission fields when this day was submitted (on_time / late) */
  githubUrl: string | null;
  linkedinUrl: string | null;
  /** ISO timestamp for display */
  submittedAt: string | null;
};

export async function getHeatmapData(
  enrollmentId: string,
  options?: { includeSubmissionDetails?: boolean },
): Promise<HeatmapCell[]> {
  const includeSubmissionDetails = options?.includeSubmissionDetails ?? true;
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { startedAt: true, challengeId: true },
  });

  if (!enrollment) {
    return [];
  }

  const [submissions, tasks] = await Promise.all([
    prisma.submission.findMany({
      where: { enrollmentId },
      select: {
        dayNumber: true,
        status: true,
        githubUrl: includeSubmissionDetails,
        linkedinUrl: includeSubmissionDetails,
        submittedAt: true,
      },
    }),
    prisma.dailyTask.findMany({
      where: {
        challengeId: enrollment.challengeId,
        dayNumber: { gte: 1, lte: 60 },
      },
      select: { dayNumber: true, title: true, problemStatement: true },
    }),
  ]);

  const byDay = new Map<
    number,
    {
      status: SubmissionStatus;
      githubUrl: string | null;
      linkedinUrl: string | null;
      submittedAt: Date;
    }
  >();
  for (const s of submissions) {
    byDay.set(s.dayNumber, {
      status: s.status,
      githubUrl: s.githubUrl ?? null,
      linkedinUrl: s.linkedinUrl ?? null,
      submittedAt: s.submittedAt,
    });
  }

  const taskByDay = new Map<
    number,
    { title: string; problemStatement: string }
  >();
  for (const t of tasks) {
    taskByDay.set(t.dayNumber, {
      title: t.title,
      problemStatement: t.problemStatement,
    });
  }

  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const out: HeatmapCell[] = [];

  for (let dayNumber = 1; dayNumber <= 60; dayNumber++) {
    const date = getIstDateKeyForChallengeDay(enrollment.startedAt, dayNumber);
    const row = byDay.get(dayNumber);
    const task = taskByDay.get(dayNumber);

    let status: HeatmapCellStatus;
    if (row?.status === SubmissionStatus.ON_TIME) {
      status = "on_time";
    } else if (row?.status === SubmissionStatus.LATE) {
      status = "late";
    } else if (date > nowKey) {
      status = "pending";
    } else if (date < nowKey) {
      status = "missed";
    } else {
      status = "pending";
    }

    const hasSubmission = status === "on_time" || status === "late";

    out.push({
      dayNumber,
      date,
      status,
      taskTitle: task?.title ?? null,
      problemStatement: task?.problemStatement ?? null,
      githubUrl:
        includeSubmissionDetails && hasSubmission && row ? row.githubUrl : null,
      linkedinUrl:
        includeSubmissionDetails && hasSubmission && row ? row.linkedinUrl : null,
      submittedAt:
        hasSubmission && row ? row.submittedAt.toISOString() : null,
    });
  }

  return out;
}
