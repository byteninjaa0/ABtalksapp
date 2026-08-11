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
});

export const runMatchSchema = z.object({
  requestId: z.string().cuid(),
});
