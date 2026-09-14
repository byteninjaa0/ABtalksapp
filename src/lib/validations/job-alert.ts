import { z } from "zod";
import { JobType, JobWorkMode } from "@prisma/client";

const optionalTrimmed = z
  .string()
  .max(200)
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t ? t : null;
  });

const nameSchema = z
  .string()
  .max(80)
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t && t.length > 0 ? t : "My job alert";
  });

const criteriaSchema = z.object({
  name: nameSchema,
  skills: z
    .array(z.string().max(60))
    .max(25)
    .optional()
    .default([])
    .transform((arr) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of arr) {
        const t = raw.trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    }),
  role: optionalTrimmed,
  location: optionalTrimmed,
  workMode: z.nativeEnum(JobWorkMode).nullable().optional().default(null),
  opportunityType: z.nativeEnum(JobType).nullable().optional().default(null),
  enabled: z.boolean().optional().default(true),
});

export const createJobAlertSchema = criteriaSchema;
export const updateJobAlertSchema = criteriaSchema.extend({
  id: z.string().min(1),
});

export const toggleJobAlertSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export const deleteJobAlertSchema = z.object({
  id: z.string().min(1),
});

export type CreateJobAlertInput = z.infer<typeof createJobAlertSchema>;
export type UpdateJobAlertInput = z.infer<typeof updateJobAlertSchema>;
