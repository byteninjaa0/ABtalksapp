/**
 * Seed gamification rules (inactive), 17 badges, 3 V1 quests.
 *
 * Idempotent upserts. Rules stay inactive until an admin enables them.
 * Respects SEED_ALLOW_PRODUCTION. Local .env is production — refuse known
 * production hosts unless the allow flag is set.
 *
 * Run: npm run db:seed:gamification
 */
import { PrismaClient, type Prisma, XpCategory, QuestCadence } from "@prisma/client";

const PRODUCTION_HOST_MARKERS = [
  "ep-nameless-term-ams9a5e3",
  "ep-young-shadow",
];

function assertNotProduction(): void {
  if (process.env.SEED_ALLOW_PRODUCTION === "true") {
    console.warn("SEED_ALLOW_PRODUCTION=true — production guard bypassed");
    return;
  }
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  for (const marker of PRODUCTION_HOST_MARKERS) {
    if (url.includes(marker)) {
      throw new Error(
        `Refusing to seed: DATABASE_URL points at production (${marker}). Use a Neon child branch.`,
      );
    }
  }
}

const prisma = new PrismaClient();

const RULES: Array<{
  key: string;
  eventType: string;
  category: XpCategory;
  xpAmount: number | null;
  dailyCap?: number;
  weeklyCap?: number;
  lifetimeCap?: number;
}> = [
  { key: "xp.activity.passed", eventType: "activity.passed", category: "LEARNING", xpAmount: null, dailyCap: 300 },
  { key: "xp.enrollment.completed", eventType: "enrollment.completed", category: "LEARNING", xpAmount: null },
  { key: "xp.credential.issued", eventType: "credential.issued", category: "LEARNING", xpAmount: 0 },
  { key: "xp.profile.section_completed", eventType: "profile.section_completed", category: "CAREER", xpAmount: null, lifetimeCap: 160 },
  { key: "xp.hackathon.submitted", eventType: "hackathon.submitted", category: "BUILDING", xpAmount: 300 },
  { key: "xp.hackathon.placed", eventType: "hackathon.placed", category: "COMPETITION", xpAmount: null },
  { key: "xp.assessment.completed", eventType: "assessment.completed", category: "CAREER", xpAmount: 40, weeklyCap: 80 },
  { key: "xp.mock_interview.completed", eventType: "mock_interview.completed", category: "CAREER", xpAmount: 60, weeklyCap: 60 },
  { key: "xp.referral.qualified", eventType: "referral.qualified", category: "COMMUNITY", xpAmount: 50, lifetimeCap: 500 },
];

type BadgeSeed = {
  slug: string;
  name: string;
  description: string;
  category: string;
  baseRarity: string;
  iconKey: string;
  sortOrder: number;
  criteria: Prisma.InputJsonValue;
  xpReward?: number;
};

const BADGES: BadgeSeed[] = [
  {
    slug: "first-step",
    name: "First Step",
    description: "Passed your first verified activity.",
    category: "Learning",
    baseRarity: "Common",
    iconKey: "first-step",
    sortOrder: 10,
    criteria: { kind: "event_count", eventType: "activity.passed", count: 1 },
  },
  {
    slug: "week-one",
    name: "Week One",
    description: "Verified activity on 7 distinct days.",
    category: "Learning",
    baseRarity: "Common",
    iconKey: "week-one",
    sortOrder: 20,
    criteria: { kind: "distinct_days", eventTypes: ["activity.passed"], days: 7 },
  },
  {
    slug: "finisher",
    name: "Finisher",
    description: "Completed a program.",
    category: "Learning",
    baseRarity: "Uncommon",
    iconKey: "finisher",
    sortOrder: 30,
    criteria: { kind: "event_count", eventType: "enrollment.completed", count: 1 },
  },
  {
    slug: "multi-track-finisher",
    name: "Multi-Track Finisher",
    description: "Completed two different learning programs.",
    category: "Learning",
    baseRarity: "Rare",
    iconKey: "multi-track-finisher",
    sortOrder: 40,
    criteria: {
      kind: "distinct_values",
      eventType: "enrollment.completed",
      payloadKey: "programId",
      count: 2,
    },
  },
  {
    slug: "first-build",
    name: "First Build",
    description: "Shipped a project activity or a valid hackathon submission.",
    category: "Building",
    baseRarity: "Uncommon",
    iconKey: "first-build",
    sortOrder: 50,
    criteria: { kind: "event_count", eventType: "hackathon.submitted", count: 1 },
  },
  {
    slug: "shipped-live",
    name: "Shipped Live",
    description: "Hackathon submission whose live URL passed checks.",
    category: "Building",
    baseRarity: "Uncommon",
    iconKey: "shipped-live",
    sortOrder: 60,
    criteria: {
      kind: "event_count",
      eventType: "hackathon.submitted",
      count: 1,
      filter: { liveOk: true },
    },
  },
  {
    slug: "hackathon-finisher",
    name: "Hackathon Finisher",
    description: "Submitted a valid hackathon project.",
    category: "Competition",
    baseRarity: "Common",
    iconKey: "hackathon-finisher",
    sortOrder: 70,
    criteria: { kind: "event_count", eventType: "hackathon.submitted", count: 1 },
  },
  {
    slug: "hackathon-top-5",
    name: "Hackathon Top 5",
    description: "Placed in the Top 5 of a hackathon.",
    category: "Competition",
    baseRarity: "Epic",
    iconKey: "hackathon-top-5",
    sortOrder: 80,
    criteria: { kind: "hackathon_placement", atLeast: "top5" },
  },
  {
    slug: "hackathon-champion",
    name: "Hackathon Champion",
    description: "Won a hackathon.",
    category: "Competition",
    baseRarity: "Legendary",
    iconKey: "hackathon-champion",
    sortOrder: 90,
    criteria: { kind: "hackathon_placement", atLeast: "winner" },
  },
  {
    slug: "profile-ready",
    name: "Profile Ready",
    description: "Completeness ≥ 80 with headline, education and a project.",
    category: "Career",
    baseRarity: "Common",
    iconKey: "profile-ready",
    sortOrder: 100,
    criteria: {
      kind: "profile_completeness",
      atLeast: 80,
      requiredSections: ["basic", "education", "projects"],
    },
  },
  {
    slug: "interview-practice",
    name: "Interview Practice",
    description: "Completed a mock interview.",
    category: "Career",
    baseRarity: "Common",
    iconKey: "interview-practice",
    sortOrder: 110,
    criteria: { kind: "event_count", eventType: "mock_interview.completed", count: 1 },
  },
  {
    slug: "assessment-taker",
    name: "Assessment Taker",
    description: "Completed a recruiter assessment.",
    category: "Career",
    baseRarity: "Uncommon",
    iconKey: "assessment-taker",
    sortOrder: 120,
    criteria: { kind: "event_count", eventType: "assessment.completed", count: 1 },
  },
  {
    slug: "referral-bronze",
    name: "Referral Bronze",
    description: "One qualified referral.",
    category: "Community",
    baseRarity: "Common",
    iconKey: "referral-bronze",
    sortOrder: 130,
    criteria: { kind: "event_count", eventType: "referral.qualified", count: 1 },
  },
  {
    slug: "referral-silver",
    name: "Referral Silver",
    description: "Five qualified referrals.",
    category: "Community",
    baseRarity: "Uncommon",
    iconKey: "referral-silver",
    sortOrder: 140,
    criteria: { kind: "event_count", eventType: "referral.qualified", count: 5 },
  },
  {
    slug: "referral-gold",
    name: "Referral Gold",
    description: "Ten qualified referrals.",
    category: "Community",
    baseRarity: "Rare",
    iconKey: "referral-gold",
    sortOrder: 150,
    criteria: { kind: "event_count", eventType: "referral.qualified", count: 10 },
  },
  {
    slug: "referral-platinum",
    name: "Referral Platinum",
    description: "Twenty-five qualified referrals.",
    category: "Community",
    baseRarity: "Epic",
    iconKey: "referral-platinum",
    sortOrder: 160,
    criteria: { kind: "event_count", eventType: "referral.qualified", count: 25 },
  },
  {
    slug: "warmed-up",
    name: "Warmed Up",
    description: "Passed two warm-up activities after registering for a hackathon.",
    category: "Starter",
    baseRarity: "Common",
    iconKey: "warmed-up",
    sortOrder: 170,
    criteria: { kind: "event_count", eventType: "activity.passed", count: 2 },
  },
];

const QUESTS: Array<{
  slug: string;
  name: string;
  description: string;
  cadence: QuestCadence;
  segment: string;
  xpReward: number;
  badgeSlug: string | null;
  sortOrder: number;
  tasks: Prisma.InputJsonValue;
}> = [
  {
    slug: "first-steps",
    name: "First Steps",
    description: "Add a headline, join a track, and pass Day 1.",
    cadence: "ONBOARDING",
    segment: "new",
    xpReward: 100,
    badgeSlug: "first-step",
    sortOrder: 10,
    tasks: [
      {
        taskKey: "headline-education",
        label: "Add headline and education",
        eventTypes: ["profile.section_completed"],
        count: 2,
      },
      {
        taskKey: "join-track",
        label: "Join a track",
        eventTypes: ["enrollment.started"],
        count: 1,
      },
      {
        taskKey: "pass-day-1",
        label: "Pass Day 1",
        eventTypes: ["activity.passed"],
        count: 1,
      },
      {
        taskKey: "three-days",
        label: "Pass on 3 distinct days",
        eventTypes: ["activity.passed"],
        distinctDays: 3,
        withinDays: 7,
      },
    ],
  },
  {
    slug: "hackathon-arrival",
    name: "Hackathon Arrival",
    description: "Confirm your team, warm up, and submit.",
    cadence: "ONBOARDING",
    segment: "hackathon_no_learning",
    xpReward: 150,
    badgeSlug: "warmed-up",
    sortOrder: 20,
    tasks: [
      {
        taskKey: "roster",
        label: "Confirm team or solo",
        eventTypes: ["hackathon.registered"],
        count: 1,
      },
      {
        taskKey: "github",
        label: "Add GitHub username",
        eventTypes: ["profile.section_completed"],
        count: 1,
        filter: { sectionKey: "links" },
      },
      {
        taskKey: "warmup",
        label: "Pass 2 warm-up activities",
        eventTypes: ["activity.passed"],
        count: 2,
      },
      {
        taskKey: "submit",
        label: "Submit repo and live URL",
        eventTypes: ["hackathon.submitted"],
        count: 1,
      },
    ],
  },
  {
    slug: "comeback",
    name: "Comeback",
    description: "Return with verified work on two distinct days.",
    cadence: "CAREER",
    segment: "dormant",
    xpReward: 75,
    badgeSlug: null,
    sortOrder: 30,
    tasks: [
      {
        taskKey: "two-days",
        label: "Verified activity on 2 distinct days within 7 days",
        eventTypes: ["activity.passed"],
        distinctDays: 2,
        withinDays: 7,
      },
    ],
  },
];

async function main() {
  assertNotProduction();
  console.log("Seeding gamification rules, badges, quests (inactive rules)...\n");

  for (const rule of RULES) {
    await prisma.gamificationRule.upsert({
      where: { key: rule.key },
      create: {
        key: rule.key,
        eventType: rule.eventType,
        category: rule.category,
        xpAmount: rule.xpAmount,
        dailyCap: rule.dailyCap ?? null,
        weeklyCap: rule.weeklyCap ?? null,
        lifetimeCap: rule.lifetimeCap ?? null,
        isActive: false,
      },
      update: {},
    });
    console.log(`  = rule ${rule.key}`);
  }

  for (const badge of BADGES) {
    await prisma.badgeDefinition.upsert({
      where: { slug: badge.slug },
      create: {
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        baseRarity: badge.baseRarity,
        criteria: badge.criteria,
        iconKey: badge.iconKey,
        sortOrder: badge.sortOrder,
        xpReward: badge.xpReward ?? 0,
        isActive: true,
      },
      update: {},
    });
    console.log(`  = badge ${badge.slug}`);
  }

  for (const quest of QUESTS) {
    await prisma.questDefinition.upsert({
      where: { slug: quest.slug },
      create: {
        slug: quest.slug,
        name: quest.name,
        description: quest.description,
        cadence: quest.cadence,
        segment: quest.segment,
        tasks: quest.tasks,
        xpReward: quest.xpReward,
        badgeSlug: quest.badgeSlug,
        sortOrder: quest.sortOrder,
        isActive: true,
      },
      update: {},
    });
    console.log(`  = quest ${quest.slug}`);
  }

  console.log("\nRules are inactive. Enable them from /admin/gamification/rules.\n");
}

main()
  .catch((e) => {
    console.error("Gamification seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
