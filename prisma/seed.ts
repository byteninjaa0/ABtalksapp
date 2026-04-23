import { addDays, subDays } from "date-fns";
import {
  Domain,
  EnrollmentStatus,
  Role,
  SubmissionStatus,
} from "@prisma/client";
import { prisma } from "../src/lib/db";

const TEST_EMAIL_SUFFIX = "@abtalks.dev";

function randomReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = randomReferralCode();
    const exists = await prisma.studentProfile.findUnique({
      where: { referralCode: code },
    });
    if (!exists) return code;
  }
  throw new Error("Could not generate unique referral code");
}

function utcNoon(daysAgo: number): Date {
  const d = subDays(new Date(), daysAgo);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

async function main() {
  await prisma.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_SUFFIX } },
  });

  await prisma.challenge.deleteMany({
    where: { domain: { in: [Domain.SE, Domain.ML, Domain.AI] } },
  });

  const challengeSpecs: { domain: Domain; title: string; description: string }[] =
    [
      {
        domain: Domain.SE,
        title: "60 Days of Code — Software Engineering",
        description:
          "Placeholder SE challenge. Real curriculum content coming soon.",
      },
      {
        domain: Domain.ML,
        title: "60 Days of Code — Machine Learning",
        description:
          "Placeholder ML challenge. Real curriculum content coming soon.",
      },
      {
        domain: Domain.AI,
        title: "60 Days of Code — Artificial Intelligence",
        description:
          "Placeholder AI challenge. Real curriculum content coming soon.",
      },
    ];

  const challengeByDomain = new Map<Domain, { id: string }>();

  for (const spec of challengeSpecs) {
    const challenge = await prisma.challenge.create({
      data: {
        domain: spec.domain,
        title: spec.title,
        description: spec.description,
        totalDays: 60,
        isActive: true,
      },
    });
    challengeByDomain.set(spec.domain, { id: challenge.id });

    // 60 tasks per domain so enrollments up to day 60 have valid DailyTask FKs
    for (let dayNumber = 1; dayNumber <= 60; dayNumber++) {
      const difficulty = dayNumber <= 7 ? "Easy" : "Medium";
      const estimatedMinutes = Math.min(60, 5 + dayNumber * 2);
      await prisma.dailyTask.create({
        data: {
          challengeId: challenge.id,
          dayNumber,
          domain: spec.domain,
          title: `Day ${dayNumber} — Placeholder`,
          problemStatement: `Placeholder problem statement for day ${dayNumber}. Real content coming soon.`,
          learningObjectives: ["Objective 1", "Objective 2"],
          resources: [],
          difficulty,
          estimatedMinutes,
          linkedinTemplate: `Day ${dayNumber} of my 60 Days of Code with ABtalks 🚀\n\nMade progress today. Check my work: {{github_link}}\n\n#ABtalks #60DaysOfCode`,
          tags: ["placeholder", `day-${dayNumber}`],
        },
      });
    }
  }

  type EnrollSpec = {
    daysCompleted: number;
    currentStreak: number;
    longestStreak: number;
    lastSubmittedDay: number | null;
    status: EnrollmentStatus;
    startedDaysAgo: number;
    completedAt?: Date | null;
  };

  type UserSeed = {
    email: string;
    password: string;
    name: string;
    num: number;
    domain: Domain;
    role: Role;
    isReadyForInterview?: boolean;
    enrollment?: EnrollSpec;
  };

  const users: UserSeed[] = [
    {
      email: "arjun@abtalks.dev",
      password: "test",
      name: "Arjun",
      num: 1,
      domain: Domain.SE,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSubmittedDay: null,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 0,
      },
    },
    {
      email: "priya@abtalks.dev",
      password: "test",
      name: "Priya",
      num: 2,
      domain: Domain.ML,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSubmittedDay: null,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 0,
      },
    },
    {
      email: "rohan@abtalks.dev",
      password: "test",
      name: "Rohan",
      num: 3,
      domain: Domain.AI,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSubmittedDay: null,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 0,
      },
    },
    {
      email: "sneha@abtalks.dev",
      password: "test",
      name: "Sneha",
      num: 4,
      domain: Domain.SE,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 7,
        currentStreak: 7,
        longestStreak: 7,
        lastSubmittedDay: 7,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 7,
      },
    },
    {
      email: "vikram@abtalks.dev",
      password: "test",
      name: "Vikram",
      num: 5,
      domain: Domain.ML,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 15,
        currentStreak: 15,
        longestStreak: 15,
        lastSubmittedDay: 15,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 15,
      },
    },
    {
      email: "anika@abtalks.dev",
      password: "test",
      name: "Anika",
      num: 6,
      domain: Domain.SE,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 30,
        currentStreak: 30,
        longestStreak: 30,
        lastSubmittedDay: 30,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 30,
      },
    },
    {
      email: "karan@abtalks.dev",
      password: "test",
      name: "Karan",
      num: 7,
      domain: Domain.AI,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 40,
        currentStreak: 3,
        longestStreak: 20,
        lastSubmittedDay: 40,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 45,
      },
    },
    {
      email: "meera@abtalks.dev",
      password: "test",
      name: "Meera",
      num: 8,
      domain: Domain.SE,
      role: Role.STUDENT,
      isReadyForInterview: true,
      enrollment: {
        daysCompleted: 60,
        currentStreak: 60,
        longestStreak: 60,
        lastSubmittedDay: 60,
        status: EnrollmentStatus.COMPLETED,
        startedDaysAgo: 60,
        completedAt: new Date(),
      },
    },
    {
      email: "dhruv@abtalks.dev",
      password: "test",
      name: "Dhruv",
      num: 9,
      domain: Domain.SE,
      role: Role.STUDENT,
      enrollment: {
        daysCompleted: 20,
        currentStreak: 20,
        longestStreak: 20,
        lastSubmittedDay: 20,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 20,
      },
    },
    {
      email: "admin@abtalks.dev",
      password: "admin",
      name: "Admin",
      num: 10,
      domain: Domain.SE,
      role: Role.ADMIN,
    },
  ];

  const emailToId = new Map<string, string>();

  for (const u of users) {
    const referralCode = await uniqueReferralCode();
    const startedAt = utcNoon(u.enrollment?.startedDaysAgo ?? 0);

    const created = await prisma.user.create({
      data: {
        email: u.email,
        password: u.password,
        name: u.name,
        role: u.role,
        studentProfile: {
          create: {
            fullName: u.name,
            college: "Test College",
            graduationYear: 2026,
            domain: u.domain,
            skills: ["JavaScript", "Python"],
            referralCode,
            isReadyForInterview: u.isReadyForInterview ?? false,
          },
        },
        ...(u.enrollment
          ? {
              enrollments: {
                create: {
                  challengeId: challengeByDomain.get(u.domain)!.id,
                  domain: u.domain,
                  status: u.enrollment.status,
                  startedAt,
                  completedAt: u.enrollment.completedAt ?? null,
                  daysCompleted: u.enrollment.daysCompleted,
                  currentStreak: u.enrollment.currentStreak,
                  longestStreak: u.enrollment.longestStreak,
                  lastSubmittedDay: u.enrollment.lastSubmittedDay,
                },
              },
            }
          : {}),
      },
      include: {
        enrollments: true,
      },
    });

    emailToId.set(u.email, created.id);

    const enrollment = created.enrollments[0];
    if (enrollment && u.enrollment && u.enrollment.daysCompleted > 0) {
      const challengeId = challengeByDomain.get(u.domain)!.id;
      for (let day = 1; day <= u.enrollment.daysCompleted; day++) {
        const dailyTask = await prisma.dailyTask.findUnique({
          where: {
            challengeId_dayNumber: { challengeId, dayNumber: day },
          },
        });
        if (!dailyTask) {
          throw new Error(`Missing DailyTask domain=${u.domain} day=${day}`);
        }
        const submittedAt = addDays(startedAt, day - 1);
        submittedAt.setUTCHours(14, 0, 0, 0);

        await prisma.submission.create({
          data: {
            userId: created.id,
            enrollmentId: enrollment.id,
            dailyTaskId: dailyTask.id,
            dayNumber: day,
            githubUrl: `https://github.com/test-user-${u.num}/abtalks-day-${day}`,
            linkedinUrl: `https://www.linkedin.com/posts/test-user-${u.num}-day-${day}`,
            status: SubmissionStatus.ON_TIME,
            submittedAt,
          },
        });
      }
    }
  }

  const dhruvId = emailToId.get("dhruv@abtalks.dev")!;
  const arjunId = emailToId.get("arjun@abtalks.dev")!;
  const priyaId = emailToId.get("priya@abtalks.dev")!;
  const rohanId = emailToId.get("rohan@abtalks.dev")!;

  await prisma.referral.createMany({
    data: [
      { referrerId: dhruvId, referredId: arjunId },
      { referrerId: dhruvId, referredId: priyaId },
      { referrerId: dhruvId, referredId: rohanId },
    ],
  });

  const meeraSubs = await prisma.submission.count({
    where: { user: { email: "meera@abtalks.dev" } },
  });
  const anikaSubs = await prisma.submission.count({
    where: { user: { email: "anika@abtalks.dev" } },
  });
  const dhruvRefs = await prisma.referral.count({
    where: { referrerId: dhruvId },
  });

  console.log("Seed verification:", {
    meeraSubmissions: meeraSubs,
    anikaSubmissions: anikaSubs,
    dhruvReferrals: dhruvRefs,
  });
}

main()
  .then(() => {
    console.log("Seed completed.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
