/**
 * Career guidance (T-224 / plan 146) — recommendation shapes.
 *
 * Pure data. No Prisma, no server-only.
 */

export type GuidanceKind = "cohort" | "hackathon" | "challenge" | "mock";

export type GuidanceItem = {
  id: string;
  kind: GuidanceKind;
  title: string;
  /** One sentence naming a fact on this candidate. Never a statistic. */
  because: string;
  href: string;
  cta: string;
};

export type ChallengeDomain = "AI" | "DS" | "SE" | "CLAUDE";

export type ChallengeStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";

export type TrackStatus = "ACTIVE" | "COMPLETED";

/** AI Cohort funnel — APPLIED covers APPLIED + WAITLISTED. */
export type AiCohortStatus = "APPLIED" | "ACTIVE" | "COMPLETED" | null;

export type ChallengeFact = {
  domain: ChallengeDomain;
  status: ChallengeStatus;
  daysCompleted: number;
};

export type SkillFact = {
  name: string;
  categoryName: string | null;
};

export type MockFact = {
  slug: string;
  label: string;
  /** Remaining attempts. `null` means uncapped. */
  attemptsLeft: number | null;
};

export type GuidanceFlags = {
  program: boolean;
  databricks: boolean;
  dsArchitect: boolean;
  powerBi: boolean;
  claude: boolean;
};

export type CandidateFacts = {
  challenges: ChallengeFact[];
  aiCohortStatus: AiCohortStatus;
  databricksStatus: TrackStatus | null;
  dsArchitectStatus: TrackStatus | null;
  powerBiStatus: TrackStatus | null;
  hackathonRegistered: boolean;
  hackathonRegistrationOpen: boolean;
  hasClaudeCredential: boolean;
  skills: SkillFact[];
  preferredRoles: string[];
  flags: GuidanceFlags;
  mocks: MockFact[];
};

/** Hub daily rail. */
export const DAILY_CAP = 4;
/** Pool size from evaluateRules before daily slot pick. */
export const GUIDANCE_POOL_CAP = 8;
/** @deprecated use DAILY_CAP / GUIDANCE_POOL_CAP — kept as alias for older tests. */
export const GUIDANCE_CAP = GUIDANCE_POOL_CAP;

/** Days completed that count as guidance-completed (matches accomplishments). */
export const GUIDANCE_COMPLETED_DAYS = 50;

/** Hub daily mix card — profile rec or catalog check-in/quote. */
export type DailyCardKind = GuidanceKind | "checkin" | "quote" | "quest";

export type DailyCard = {
  id: string;
  source: "profile" | "catalog";
  kind: DailyCardKind;
  title: string;
  body: string;
  ctaLabel: string | null;
  href: string | null;
};

export type GuidanceMemory = {
  istDay: string;
  /** Frozen ids for this IST day. Null until the pack is first built. */
  packIds: string[] | null;
  dismissedIds: string[];
  onceSeen: string[];
  weeklySeen: Record<string, string>;
  /** True after the one allowed refill for this IST day. */
  refillUsed: boolean;
};
