import { z } from "zod";
import { optionalPhoneSchema } from "@/lib/validations/phone";

function trimEmptyToUndefined(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  college: z.string().trim().min(1).max(200),
  graduationYear: z.coerce.number().int().min(2020).max(2035),
  skills: z
    .array(z.string().trim().min(1).max(80))
    .max(10, "At most 10 skills"),
  linkedinUrl: z
    .string()
    .default("")
    .transform((s) => trimEmptyToUndefined(s.trim()))
    .pipe(z.union([z.undefined(), z.string().url("Must be a valid URL")])),
  resumeUrl: z.union([z.literal(""), z.string().url("Must be a valid URL")]).default(""),
  githubUsername: z
    .string()
    .default("")
    .transform((s) => trimEmptyToUndefined(s.trim()))
    .pipe(
      z.union([
        z.undefined(),
        z.string().regex(/^[a-zA-Z0-9-]+$/, {
          message:
            "GitHub username may only contain letters, numbers, and hyphens",
        }),
      ]),
    ),
  phone: optionalPhoneSchema,
});

/** Parsed / validated profile update payload */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Values accepted by the profile form (includes optional defaults). */
export type ProfileFormValues = z.input<typeof updateProfileSchema>;
