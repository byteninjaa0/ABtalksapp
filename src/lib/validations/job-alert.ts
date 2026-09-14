import { z } from "zod";
import { JobType, JobWorkMode } from "@prisma/client";

/**
 * A blank string in the form is treated as "unset". Keeping the transform
 * here means the server action does not have to think about "" vs null.
 */
const optionalTrimmed = z
  .string()
  .max(200)
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t ? t : null;
  });

export const saveJobAlertSchema = z.object({
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

export type SaveJobAlertInput = z.infer<typeof saveJobAlertSchema>;

export const toggleJobAlertSchema = z.object({
  enabled: z.boolean(),
});
