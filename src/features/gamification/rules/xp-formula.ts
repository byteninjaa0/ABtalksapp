/**
 * Plan 151 §6 — XP = min(ruleCap, round(Base × D × V × T × Rep)).
 * Pure. No Prisma, no IO.
 *
 * Anchor: 1 XP ≈ one minute of verified, focused work.
 * Verifiability comes from activity type + proof payload, NEVER evaluatorType.
 */

export type ActivityTypeName =
  | "CODING"
  | "QUIZ"
  | "PROJECT"
  | "ASSIGNMENT"
  | "CONTENT"
  | "VIDEO"
  | "INTERVIEW"
  | "EXTERNAL_SUBMISSION"
  | "DAILY_CHALLENGE";

export type LatenessName = "ON_TIME" | "LATE" | "NOT_APPLICABLE";

export type MissionTypeName =
  | "CODE_SPRINT"
  | "DATA_ROOM"
  | "PROMPT_FORGE"
  | "SHIP_IT"
  | "BOSS_BUILD"
  | "QUIZ"
  | "CHALLENGE_DAY"
  | "PROJECT"
  | string;

export type XpFormulaInput = {
  activityType: string;
  estimatedMinutes: number | null | undefined;
  difficulty: string | null | undefined;
  lateness: string;
  hasGithubProof: boolean;
  missionType?: string | null;
  isAdminIssued?: boolean;
  repeatProgram?: boolean;
};

const TYPE_FALLBACK_MINUTES: Record<string, number> = {
  CODING: 30,
  QUIZ: 15,
  PROJECT: 120,
  ASSIGNMENT: 45,
  EXTERNAL_SUBMISSION: 30,
  DAILY_CHALLENGE: 30,
  CONTENT: 5,
  VIDEO: 5,
  INTERVIEW: 30,
};

const BUILD_TYPES = new Set(["PROJECT", "BOSS_BUILD", "SHIP_IT"]);

export function isBuildActivity(
  activityType: string,
  missionType?: string | null,
): boolean {
  const mission = (missionType ?? "").toUpperCase();
  if (BUILD_TYPES.has(mission)) return true;
  return activityType === "PROJECT";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function baseMinutes(input: XpFormulaInput): number {
  const mission = (input.missionType ?? "").toUpperCase();
  const isBuild =
    input.activityType === "PROJECT" ||
    mission === "PROJECT" ||
    mission === "BOSS_BUILD";
  const fallback = TYPE_FALLBACK_MINUTES[input.activityType] ?? 30;
  const raw =
    typeof input.estimatedMinutes === "number" && input.estimatedMinutes > 0
      ? input.estimatedMinutes
      : fallback;
  if (isBuild) return clamp(raw, 60, 240);
  return clamp(raw, 10, 90);
}

function difficultyFactor(difficulty: string | null | undefined): number {
  const d = (difficulty ?? "").toLowerCase();
  if (d === "hard") return 1.5;
  if (d === "medium") return 1.25;
  return 1.0;
}

/**
 * Verifiability. Challenge dual-writes are AUTO with no proof check — V is
 * derived from activity type + payload, not evaluatorType (§1.2 #1).
 */
export function verifiabilityFactor(input: XpFormulaInput): number {
  if (input.isAdminIssued) return 0;
  const mission = (input.missionType ?? "").toUpperCase();
  if (
    mission === "CODE_SPRINT" ||
    mission === "DATA_ROOM" ||
    mission === "PROMPT_FORGE"
  ) {
    return 1.0;
  }
  if (input.activityType === "QUIZ" || mission === "QUIZ") return 1.0;
  if (mission === "SHIP_IT") return 1.0;
  if (
    input.activityType === "PROJECT" ||
    mission === "BOSS_BUILD" ||
    mission === "PROJECT"
  ) {
    return 1.2;
  }
  if (
    input.activityType === "DAILY_CHALLENGE" ||
    mission === "CHALLENGE_DAY"
  ) {
    return input.hasGithubProof ? 0.6 : 0.4;
  }
  return 1.0;
}

function timelinessFactor(lateness: string): number {
  if (lateness === "LATE") return 0.75;
  return 1.0;
}

function repetitionFactor(repeatProgram: boolean | undefined): number {
  return repeatProgram ? 0.25 : 1.0;
}

export function computeActivityXp(input: XpFormulaInput): number {
  if (input.isAdminIssued) return 0;
  const xp =
    baseMinutes(input) *
    difficultyFactor(input.difficulty) *
    verifiabilityFactor(input) *
    timelinessFactor(input.lateness) *
    repetitionFactor(input.repeatProgram);
  return Math.round(xp);
}

/**
 * Daily soft cap for `activity.passed` (IST day, all enrollments):
 * 100% up to 150, 50% from 150 to 300, 0 beyond.
 */
export function applyActivityDailySoftCap(
  alreadyAwardedToday: number,
  rawXp: number,
): number {
  if (rawXp <= 0) return 0;
  const FULL = 150;
  const HALF_UNTIL = 300;
  let remaining = rawXp;
  let awarded = 0;
  let cursor = alreadyAwardedToday;

  if (cursor < FULL) {
    const room = FULL - cursor;
    const take = Math.min(remaining, room);
    awarded += take;
    remaining -= take;
    cursor += take;
  }
  if (remaining > 0 && cursor < HALF_UNTIL) {
    const room = HALF_UNTIL - cursor;
    const take = Math.min(remaining, room);
    awarded += Math.round(take * 0.5);
    remaining -= take;
    cursor += take;
  }
  return awarded;
}

export const DAILY_HARD_CEILING = 1000;

export const PROFILE_SECTION_XP: Record<string, number> = {
  basic: 30,
  education: 20,
  experience: 20,
  projects: 30,
  skills: 20,
  resume: 20,
  links: 10,
  preferences: 10,
};

export const PROFILE_XP_LIFETIME_CAP = 160;

export const ASSESSMENT_XP = 40;
export const ASSESSMENT_WEEKLY_CAP_COUNT = 2;
export const MOCK_INTERVIEW_XP = 60;
export const MOCK_INTERVIEW_WEEKLY_CAP_COUNT = 1;
export const REFERRAL_XP = 50;
export const REFERRAL_LIFETIME_CAP_COUNT = 10;
export const HACKATHON_SUBMITTED_XP = 300;

export const PLACEMENT_XP: Record<string, number> = {
  top10pct: 400,
  finalist: 600,
  top5: 800,
  third: 1000,
  second: 1200,
  winner: 1500,
};

export function enrollmentCompletionXp(enrollmentXpEarned: number): number {
  return clamp(Math.round(0.25 * enrollmentXpEarned), 200, 1000);
}

export function applyDailyHardCeiling(
  alreadyAwardedToday: number,
  rawXp: number,
  exempt: boolean,
): { awarded: number; hitCeiling: boolean } {
  if (exempt) return { awarded: rawXp, hitCeiling: false };
  const room = Math.max(0, DAILY_HARD_CEILING - alreadyAwardedToday);
  const awarded = Math.min(rawXp, room);
  return { awarded, hitCeiling: rawXp > room };
}

export function xpCategoryForEvent(
  type: string,
  extras?: { activityType?: string; missionType?: string | null },
): "LEARNING" | "BUILDING" | "CAREER" | "COMPETITION" | "COMMUNITY" {
  if (type === "hackathon.placed") return "COMPETITION";
  if (type === "hackathon.submitted") return "BUILDING";
  if (type === "referral.qualified") return "COMMUNITY";
  if (
    type === "profile.section_completed" ||
    type === "assessment.completed" ||
    type === "mock_interview.completed"
  ) {
    return "CAREER";
  }
  if (type === "enrollment.completed") return "LEARNING";
  if (type === "activity.passed") {
    if (isBuildActivity(extras?.activityType ?? "", extras?.missionType)) {
      return "BUILDING";
    }
    return "LEARNING";
  }
  if (type === "credential.issued") return "LEARNING";
  return "LEARNING";
}
