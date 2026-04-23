import type { EnrollmentStatus, Role, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentDayNumber, IST } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";

export type DashboardDataNoEnrollment = {
  hasEnrollment: false;
};

export type DashboardDataWithEnrollment = {
  hasEnrollment: true;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  };
  profile: {
    fullName: string;
    domain: string;
    college: string;
    referralCode: string;
    isReadyForInterview: boolean;
  };
  enrollment: {
    id: string;
    currentDay: number;
    totalDays: number;
    daysCompleted: number;
    currentStreak: number;
    longestStreak: number;
    status: EnrollmentStatus;
  };
  todayTask: {
    id: string;
    dayNumber: number;
    title: string;
    difficulty: string;
    estimatedMinutes: number;
  } | null;
  isTodayCompleted: boolean;
  recentSubmissions: Array<{
    id: string;
    dayNumber: number;
    status: SubmissionStatus;
    submittedAt: Date;
  }>;
  referralCount: number;
};

export type DashboardData = DashboardDataNoEnrollment | DashboardDataWithEnrollment;

function sameIstCalendarDay(a: Date, b: Date): boolean {
  return (
    formatInTimeZone(a, IST, "yyyy-MM-dd") ===
    formatInTimeZone(b, IST, "yyyy-MM-dd")
  );
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      studentProfile: {
        select: {
          fullName: true,
          domain: true,
          college: true,
          referralCode: true,
          isReadyForInterview: true,
        },
      },
      enrollments: {
        take: 1,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          challengeId: true,
          startedAt: true,
          daysCompleted: true,
          currentStreak: true,
          longestStreak: true,
          status: true,
          challenge: { select: { totalDays: true } },
        },
      },
    },
  });

  if (!user || !user.studentProfile) {
    return { hasEnrollment: false };
  }

  const enrollment = user.enrollments[0];
  if (!enrollment) {
    return { hasEnrollment: false };
  }

  const now = new Date();
  const submissionsLast2d = await prisma.submission.findMany({
    where: {
      userId,
      enrollmentId: enrollment.id,
      submittedAt: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
    },
    select: { submittedAt: true },
  });

  const isTodayCompleted = submissionsLast2d.some((s) =>
    sameIstCalendarDay(s.submittedAt, now),
  );

  const currentDay = getCurrentDayNumber(enrollment.startedAt);
  const totalDays = enrollment.challenge.totalDays;

  let todayTask: DashboardDataWithEnrollment["todayTask"] = null;
  const isChallengeComplete =
    enrollment.status === "COMPLETED" || enrollment.daysCompleted >= totalDays;

  if (!isChallengeComplete && !isTodayCompleted) {
    const task = await prisma.dailyTask.findUnique({
      where: {
        challengeId_dayNumber: {
          challengeId: enrollment.challengeId,
          dayNumber: currentDay,
        },
      },
      select: {
        id: true,
        dayNumber: true,
        title: true,
        difficulty: true,
        estimatedMinutes: true,
      },
    });
    if (task) {
      todayTask = task;
    }
  }

  const recentSubmissions = await prisma.submission.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    take: 7,
    select: {
      id: true,
      dayNumber: true,
      status: true,
      submittedAt: true,
    },
  });

  const referralCount = await prisma.referral.count({
    where: { referrerId: userId },
  });

  return {
    hasEnrollment: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    profile: {
      fullName: user.studentProfile.fullName,
      domain: user.studentProfile.domain,
      college: user.studentProfile.college,
      referralCode: user.studentProfile.referralCode,
      isReadyForInterview: user.studentProfile.isReadyForInterview,
    },
    enrollment: {
      id: enrollment.id,
      currentDay,
      totalDays,
      daysCompleted: enrollment.daysCompleted,
      currentStreak: enrollment.currentStreak,
      longestStreak: enrollment.longestStreak,
      status: enrollment.status,
    },
    todayTask,
    isTodayCompleted,
    recentSubmissions,
    referralCount,
  };
}
