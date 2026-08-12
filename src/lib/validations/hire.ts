import { z } from "zod";

export const talentSenioritySchema = z.enum([
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "LEAD",
]);

export const talentWorkModeSchema = z.enum([
  "ONSITE",
  "HYBRID",
  "REMOTE",
  "FLEXIBLE",
]);

export const talentEmploymentTypeSchema = z.enum([
  "FULL_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "PART_TIME",
]);

export const talentMatchTierSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);

export const evidenceDimensionSchema = z.enum([
  "missions",
  "clean_pass",
  "projects",
  "consistency",
  "interview",
  "stack",
  "data",
  "ai_prompting",
  "communication",
  "ship_speed",
]);

/** Partial job spec Scout accumulates across turns. */
export const jobSpecSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  seniority: talentSenioritySchema.optional().nullable(),
  openings: z.number().int().min(1).max(50).optional(),
  mustHaveStack: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  niceToHaveStack: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  evidencePriority: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  salaryMin: z.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(3).optional(),
  salaryPeriod: z.enum(["ANNUAL", "MONTHLY"]).optional(),
  workMode: talentWorkModeSchema.optional().nullable(),
  locationCity: z.string().trim().max(80).optional().nullable(),
  employmentType: talentEmploymentTypeSchema.optional().nullable(),
  noticePeriodDays: z.number().int().min(0).max(180).optional().nullable(),
  minExperience: z.number().int().min(0).max(50).optional().nullable(),
  maxExperience: z.number().int().min(0).max(50).optional().nullable(),
  requiresDegree: z.boolean().optional(),
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type JobSpec = z.infer<typeof jobSpecSchema>;

export const scoutOptionSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(120),
});

/** Phase A structured response from Scout conversation model. */
export const scoutTurnSchema = z.object({
  spec: jobSpecSchema,
  nextQuestion: z.string().max(500).nullable(),
  options: z.array(scoutOptionSchema).max(12),
  allowFreeText: z.boolean(),
  readyToSearch: z.boolean(),
  summary: z.string().max(1000),
});

export type ScoutTurn = z.infer<typeof scoutTurnSchema>;

/**
 * Ordered question slots, highest information gain first.
 *
 * Shared by the server (which picks the next question and merges the reply into
 * exactly that slot) and the client (which renders progress). One list means an
 * answer can never land in the wrong field — the previous free-text parser
 * guessed, and filed job titles as required skills.
 */
export const HIRE_SLOTS = [
  "title",
  "seniority",
  "mustHaveStack",
  "evidencePriority",
  "salary",
  "employmentType",
  "workMode",
  "locationCity",
  "noticePeriodDays",
  "experience",
] as const;

export type HireSlot = (typeof HIRE_SLOTS)[number];

/**
 * Slots the recruiter explicitly declined to answer.
 *
 * Most slots have a sentinel that reads as a real answer — "any city",
 * "flexible", "evidence only". Seniority and evidence priority have none, so
 * the refusal itself is the record. Without this, a chip-only question the
 * recruiter could not answer had no exit at all and the conversation could
 * never reach the end.
 */
export function skippedSlots(spec: JobSpec): Set<HireSlot> {
  const raw = (spec.extra as { skipped?: unknown } | null | undefined)?.skipped;
  if (!Array.isArray(raw)) return new Set<HireSlot>();
  return new Set(
    raw.filter((s): s is HireSlot => HIRE_SLOTS.includes(s as HireSlot)),
  );
}

/** Slots that don't apply to this spec, so progress stays honest. */
export function inapplicableSlots(spec: JobSpec): Set<HireSlot> {
  const skip = skippedSlots(spec);
  // A remote role has no office city to ask about.
  if (spec.workMode === "REMOTE") skip.add("locationCity");
  return skip;
}

export function isSlotFilled(spec: JobSpec, slot: HireSlot): boolean {
  switch (slot) {
    case "title":
      return Boolean(spec.title?.trim());
    case "seniority":
      return spec.seniority != null;
    case "mustHaveStack":
      return (spec.mustHaveStack?.length ?? 0) > 0;
    case "evidencePriority":
      return (spec.evidencePriority?.length ?? 0) > 0;
    case "salary":
      return spec.salaryMin != null || spec.salaryMax != null;
    case "employmentType":
      return spec.employmentType != null;
    case "workMode":
      return spec.workMode != null;
    case "locationCity":
      return Boolean(spec.locationCity?.trim());
    case "noticePeriodDays":
      return spec.noticePeriodDays != null;
    case "experience":
      return spec.minExperience != null || spec.maxExperience != null;
  }
}

/** Progress for the UI: how many applicable slots are answered. */
export function hireProgress(spec: JobSpec): { done: number; total: number } {
  const skip = inapplicableSlots(spec);
  const applicable = HIRE_SLOTS.filter((s) => !skip.has(s));
  return {
    done: applicable.filter((s) => isSlotFilled(spec, s)).length,
    total: applicable.length,
  };
}

export const candidateAvailabilitySchema = z
  .object({
    openToWork: z.boolean(),
    expectedSalaryMin: z.number().int().min(0).max(100_000_000).nullable().optional(),
    expectedSalaryMax: z.number().int().min(0).max(100_000_000).nullable().optional(),
    salaryCurrency: z.string().trim().min(3).max(3).default("INR"),
    noticePeriodDays: z.number().int().min(0).max(180).nullable().optional(),
    preferredWorkMode: talentWorkModeSchema.nullable().optional(),
    preferredCities: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
    openToRelocate: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (
      v.expectedSalaryMin != null &&
      v.expectedSalaryMax != null &&
      v.expectedSalaryMax < v.expectedSalaryMin
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Max salary must be ≥ min salary.",
        path: ["expectedSalaryMax"],
      });
    }
  });

export type CandidateAvailabilityInput = z.infer<
  typeof candidateAvailabilitySchema
>;

export const sendScoutMessageSchema = z.object({
  requestId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(2000),
  /**
   * What the recruiter actually saw, when they tapped a chip whose machine
   * value differs from its label ("Within 30 days" → "30"). Display only —
   * the engine always parses `message`.
   */
  display: z.string().trim().min(1).max(200).optional(),
});

export const runMatchSchema = z.object({
  requestId: z.string().cuid(),
});
