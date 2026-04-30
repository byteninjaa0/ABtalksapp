import * as fs from "node:fs";
import * as path from "node:path";
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

type ProblemJson = {
  dayNumber: number;
  domain: string;
  title: string;
  problemStatement: string;
  learningObjectives: string[];
  resources: string[];
  difficulty: string;
  estimatedMinutes: number;
  linkedinTemplate: string;
  solutionApproach: string;
  tags: string[];
};

type QuizQuestionJson = {
  questionOrder: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
};

type QuizJson = {
  weekNumber: number;
  domain: string;
  title: string;
  questions: QuizQuestionJson[];
};

function loadJsonFile<T>(filename: string): T | null {
  const full = path.join(process.cwd(), "prisma", "content", filename);
  if (!fs.existsSync(full)) {
    console.warn(`Content file not found (skipping): ${full}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8")) as T;
  } catch (e) {
    console.warn(`Invalid JSON in ${filename}:`, e);
    return null;
  }
}

function buildProblemLookup(entries: ProblemJson[] | null): Map<string, ProblemJson> {
  const map = new Map<string, ProblemJson>();
  if (!entries) return map;
  for (const p of entries) {
    if (p.domain !== "SE" && p.domain !== "DS" && p.domain !== "AI") continue;
    map.set(`${p.domain}:${p.dayNumber}`, p);
  }
  return map;
}

function placeholderDailyTaskData(domain: Domain, dayNumber: number) {
  const difficulty = dayNumber <= 7 ? "Easy" : "Medium";
  const estimatedMinutes = Math.min(60, 5 + dayNumber * 2);
  return {
    domain,
    title: `Day ${dayNumber} — Placeholder`,
    problemStatement: `Placeholder problem statement for day ${dayNumber}. Real content coming soon.`,
    learningObjectives: ["Objective 1", "Objective 2"],
    resources: [],
    difficulty,
    estimatedMinutes,
    linkedinTemplate: `Day ${dayNumber} of my 60 Days of Code with ABtalks 🚀\n\nMade progress today. Check my work: {{github_link}}\n\n#ABtalks #60DaysOfCode`,
    solutionApproach: null,
    tags: ["placeholder", `day-${dayNumber}`],
  };
}

function dailyTaskFromJson(domain: Domain, row: ProblemJson) {
  return {
    domain,
    title: row.title,
    problemStatement: row.problemStatement,
    learningObjectives: row.learningObjectives,
    resources: row.resources ?? [],
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    linkedinTemplate: row.linkedinTemplate,
    solutionApproach: row.solutionApproach,
    tags: row.tags,
  };
}

async function upsertDailyTasksForChallenge(
  challengeId: string,
  domain: Domain,
  problemLookup: Map<string, ProblemJson>,
) {
  for (let dayNumber = 1; dayNumber <= 60; dayNumber++) {
    const key = `${domain}:${dayNumber}`;
    const fromJson = problemLookup.get(key);
    const body = fromJson
      ? dailyTaskFromJson(domain, fromJson)
      : placeholderDailyTaskData(domain, dayNumber);

    await prisma.dailyTask.upsert({
      where: {
        challengeId_dayNumber: { challengeId, dayNumber },
      },
      create: {
        challengeId,
        dayNumber,
        ...body,
      },
      update: { ...body },
    });
  }
}

async function replaceQuizQuestionsFromJson(
  quizId: string,
  questions: QuizQuestionJson[],
) {
  await prisma.quizQuestion.deleteMany({ where: { quizId } });
  for (const q of questions) {
    await prisma.quizQuestion.create({
      data: {
        quizId,
        questionOrder: q.questionOrder,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      },
    });
  }
}

async function seedPlaceholderWeekQuiz(
  challengeId: string,
  domain: Domain,
  weekNumber: number,
  quizWeek1IdByDomain: Map<Domain, string>,
) {
  const title = `Week ${weekNumber} Quiz — ${domain}`;
  const quiz = await prisma.quiz.upsert({
    where: {
      challengeId_weekNumber: { challengeId, weekNumber },
    },
    create: {
      challengeId,
      domain,
      weekNumber,
      title,
    },
    update: { title },
  });
  if (weekNumber === 1) {
    quizWeek1IdByDomain.set(domain, quiz.id);
  }
  await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
  const correctCycle = ["A", "B", "C", "D"] as const;
  for (let qn = 1; qn <= 10; qn++) {
    const correctAnswer = correctCycle[(qn - 1) % 4]!;
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        questionOrder: qn,
        questionText: `Week ${weekNumber} Q${qn} placeholder for ${domain}?`,
        optionA: "Option A placeholder",
        optionB: "Option B placeholder",
        optionC: "Option C placeholder",
        optionD: "Option D placeholder",
        correctAnswer,
        explanation: `Placeholder explanation for Week ${weekNumber} Q${qn} — real content pending.`,
      },
    });
  }
}

async function main() {
  await prisma.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_SUFFIX } },
  });

  const problemsRaw = loadJsonFile<ProblemJson[]>("problems.json");
  const problemLookup = buildProblemLookup(
    Array.isArray(problemsRaw) ? problemsRaw : null,
  );
  const quizzesRaw = loadJsonFile<QuizJson[]>("quizzes.json");
  const quizEntries = Array.isArray(quizzesRaw) ? quizzesRaw : [];

  const challengeSpecs: { domain: Domain; title: string; description: string }[] =
    [
      {
        domain: Domain.SE,
        title: "60 Days of Code — Software Engineering",
        description:
          "Placeholder SE challenge. Real curriculum content coming soon.",
      },
      {
        domain: Domain.DS,
        title: "60 Days of Code — Data Science",
        description:
          "Placeholder Data Science challenge. Real curriculum content coming soon.",
      },
      {
        domain: Domain.AI,
        title: "60 Days of Code — Artificial Intelligence",
        description:
          "Placeholder AI challenge. Real curriculum content coming soon.",
      },
    ];

  const challengeByDomain = new Map<Domain, { id: string }>();
  const quizWeek1IdByDomain = new Map<Domain, string>();
  const quizSeededFromJson = new Set<string>();

  for (const spec of challengeSpecs) {
    const challenge = await prisma.challenge.upsert({
      where: { domain: spec.domain },
      create: {
        domain: spec.domain,
        title: spec.title,
        description: spec.description,
        totalDays: 60,
        isActive: true,
      },
      update: {
        title: spec.title,
        description: spec.description,
        totalDays: 60,
        isActive: true,
      },
    });
    challengeByDomain.set(spec.domain, { id: challenge.id });
    await upsertDailyTasksForChallenge(
      challenge.id,
      spec.domain,
      problemLookup,
    );
  }

  for (const entry of quizEntries) {
    if (entry.domain !== "SE" && entry.domain !== "DS" && entry.domain !== "AI") {
      continue;
    }
    const domain = entry.domain as Domain;
    const challengeId = challengeByDomain.get(domain)!.id;
    const quiz = await prisma.quiz.upsert({
      where: {
        challengeId_weekNumber: {
          challengeId,
          weekNumber: entry.weekNumber,
        },
      },
      create: {
        challengeId,
        domain,
        weekNumber: entry.weekNumber,
        title: entry.title,
      },
      update: { title: entry.title },
    });
    quizSeededFromJson.add(`${domain}:${entry.weekNumber}`);
    if (entry.weekNumber === 1) {
      quizWeek1IdByDomain.set(domain, quiz.id);
    }
    await replaceQuizQuestionsFromJson(quiz.id, entry.questions);
  }

  const defaultQuizWeeks = [1];
  for (const spec of challengeSpecs) {
    const challengeId = challengeByDomain.get(spec.domain)!.id;
    for (const weekNumber of defaultQuizWeeks) {
      const key = `${spec.domain}:${weekNumber}`;
      if (quizSeededFromJson.has(key)) {
        continue;
      }
      await seedPlaceholderWeekQuiz(
        challengeId,
        spec.domain,
        weekNumber,
        quizWeek1IdByDomain,
      );
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
        daysCompleted: 7,
        currentStreak: 7,
        longestStreak: 7,
        lastSubmittedDay: 7,
        status: EnrollmentStatus.ACTIVE,
        startedDaysAgo: 7,
      },
    },
    {
      email: "priya@abtalks.dev",
      password: "test",
      name: "Priya",
      num: 2,
      domain: Domain.DS,
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
      email: "rohan@abtalks.dev",
      password: "test",
      name: "Rohan",
      num: 3,
      domain: Domain.AI,
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
      domain: Domain.DS,
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

  const snehaId = emailToId.get("sneha@abtalks.dev")!;
  const seWeek1QuizId = quizWeek1IdByDomain.get(Domain.SE)!;
  const seWeek1Questions = await prisma.quizQuestion.findMany({
    where: { quizId: seWeek1QuizId },
    orderBy: { questionOrder: "asc" },
  });
  const snehaAnswers: Record<string, string> = {};
  seWeek1Questions.forEach((q, idx) => {
    const correct = q.correctAnswer;
    const wrong = correct === "A" ? "B" : "A";
    snehaAnswers[q.id] = idx < 8 ? correct : wrong;
  });
  await prisma.quizAttempt.create({
    data: {
      userId: snehaId,
      quizId: seWeek1QuizId,
      score: 8,
      answers: snehaAnswers,
    },
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
