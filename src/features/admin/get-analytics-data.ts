import { subDays, subMonths, subWeeks } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { IST, parseCalendarKeyToUtcDate } from "@/lib/date-utils";

export type TimeRange = "daily" | "weekly" | "monthly";

function getIstHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
}

function toIstDayKey(date: Date): string {
  return formatInTimeZone(date, IST, "yyyy-MM-dd");
}

function toIstMonthKey(date: Date): string {
  return formatInTimeZone(date, IST, "yyyy-MM");
}

function getIstWeekStartKey(date: Date): string {
  const dayKey = toIstDayKey(date);
  const day = parseCalendarKeyToUtcDate(dayKey);
  const dayOfWeek = day.getUTCDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(day.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
  return formatInTimeZone(monday, IST, "yyyy-MM-dd");
}

function getRangeWindow(range: TimeRange) {
  const now = new Date();
  if (range === "weekly") {
    return { now, start: subWeeks(now, 11) };
  }
  if (range === "monthly") {
    return { now, start: subMonths(now, 11) };
  }
  return { now, start: subDays(now, 29) };
}

function buildBuckets(range: TimeRange, now: Date) {
  if (range === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const date = subWeeks(now, 11 - i);
      const key = getIstWeekStartKey(date);
      const label = formatInTimeZone(parseCalendarKeyToUtcDate(key), IST, "MMM d");
      return { key, label };
    });
  }

  if (range === "monthly") {
    return Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(now, 11 - i);
      const key = toIstMonthKey(date);
      const label = formatInTimeZone(new Date(`${key}-01T00:00:00+05:30`), IST, "MMM yyyy");
      return { key, label };
    });
  }

  return Array.from({ length: 30 }, (_, i) => {
    const date = subDays(now, 29 - i);
    const key = toIstDayKey(date);
    const label = formatInTimeZone(parseCalendarKeyToUtcDate(key), IST, "MMM d");
    return { key, label };
  });
}

function timeKeyFor(date: Date, range: TimeRange) {
  if (range === "weekly") return getIstWeekStartKey(date);
  if (range === "monthly") return toIstMonthKey(date);
  return toIstDayKey(date);
}

export async function getAnalyticsData(range: TimeRange = "daily") {
  const { now, start } = getRangeWindow(range);
  const buckets = buildBuckets(range, now);
  const bucketSet = new Set(buckets.map((b) => b.key));

  const [
    rangedProfiles,
    rangedSubmissions,
    domainGrouped,
    allEnrollments,
    allSubmissions,
    topPerformersRaw,
  ] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.submission.findMany({
      where: { submittedAt: { gte: start } },
      select: { submittedAt: true },
    }),
    prisma.studentProfile.groupBy({
      by: ["domain"],
      _count: { domain: true },
    }),
    prisma.enrollment.findMany({
      select: { daysCompleted: true },
    }),
    prisma.submission.findMany({
      select: { submittedAt: true },
    }),
    prisma.enrollment.findMany({
      orderBy: [{ daysCompleted: "desc" }, { currentStreak: "desc" }],
      take: 10,
      include: {
        user: {
          select: {
            email: true,
            studentProfile: {
              select: { fullName: true, domain: true },
            },
          },
        },
      },
    }),
  ]);

  const registrationsCountByKey = new Map<string, number>();
  for (const profile of rangedProfiles) {
    const key = timeKeyFor(profile.createdAt, range);
    if (!bucketSet.has(key)) continue;
    registrationsCountByKey.set(key, (registrationsCountByKey.get(key) ?? 0) + 1);
  }

  const submissionsCountByKey = new Map<string, number>();
  for (const submission of rangedSubmissions) {
    const key = timeKeyFor(submission.submittedAt, range);
    if (!bucketSet.has(key)) continue;
    submissionsCountByKey.set(key, (submissionsCountByKey.get(key) ?? 0) + 1);
  }

  const registrationsSeries = buckets.map((bucket) => ({
    label: bucket.label,
    count: registrationsCountByKey.get(bucket.key) ?? 0,
  }));

  const submissionsSeries = buckets.map((bucket) => ({
    label: bucket.label,
    count: submissionsCountByKey.get(bucket.key) ?? 0,
  }));

  const domainDistribution = ["AI", "DS", "SE"].map((domain) => ({
    name: domain,
    value: domainGrouped.find((row) => row.domain === domain)?._count.domain ?? 0,
  }));

  const milestones = [1, 7, 14, 30, 45, 60];
  const dropOff = milestones.map((milestone) => ({
    milestone: `Day ${milestone}`,
    count: allEnrollments.filter((row) => row.daysCompleted >= milestone).length,
  }));

  const submissionsByHourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour.toString().padStart(2, "0")}:00`,
    count: 0,
  }));

  for (const submission of allSubmissions) {
    submissionsByHourBuckets[getIstHour(submission.submittedAt)]!.count += 1;
  }

  const topPerformers = topPerformersRaw.map((row) => ({
    name:
      row.user.studentProfile?.fullName?.trim() || row.user.email || "Unknown",
    domain: row.user.studentProfile?.domain || row.domain,
    daysCompleted: row.daysCompleted,
    currentStreak: row.currentStreak,
  }));

  return {
    range,
    registrationsSeries,
    submissionsSeries,
    domainDistribution,
    dropOff,
    submissionsByHour: submissionsByHourBuckets,
    topPerformers,
  };
}
