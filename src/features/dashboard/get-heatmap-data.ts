import { SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getIstDateKeyForChallengeDay, IST } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";

export type HeatmapCellStatus = "on_time" | "late" | "pending" | "missed";

export type HeatmapCell = {
  dayNumber: number;
  date: string;
  status: HeatmapCellStatus;
};

export async function getHeatmapData(
  enrollmentId: string,
): Promise<HeatmapCell[]> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { startedAt: true },
  });

  if (!enrollment) {
    return [];
  }

  const submissions = await prisma.submission.findMany({
    where: { enrollmentId },
    select: { dayNumber: true, status: true },
  });

  const byDay = new Map<number, SubmissionStatus>();
  for (const s of submissions) {
    byDay.set(s.dayNumber, s.status);
  }

  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const out: HeatmapCell[] = [];

  for (let dayNumber = 1; dayNumber <= 60; dayNumber++) {
    const date = getIstDateKeyForChallengeDay(enrollment.startedAt, dayNumber);
    const sub = byDay.get(dayNumber);

    let status: HeatmapCellStatus;
    if (sub === SubmissionStatus.ON_TIME) {
      status = "on_time";
    } else if (sub === SubmissionStatus.LATE) {
      status = "late";
    } else if (date > nowKey) {
      status = "pending";
    } else if (date < nowKey) {
      status = "missed";
    } else {
      status = "pending";
    }

    out.push({ dayNumber, date, status });
  }

  return out;
}
