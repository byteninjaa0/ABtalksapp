import { z } from "zod";

export const requestRecruiterOtpSchema = z.object({
  email: z.string().trim().email().max(200),
});

export const verifyRecruiterOtpSchema = z.object({
  email: z.string().trim().email().max(200),
  /** Exactly six digits — anything else never reaches the database. */
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const completeRecruiterProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  acceptedTerms: z.literal(true, {
    message: "Please accept the Terms and Privacy Policy.",
  }),
  newsletterOptIn: z.boolean(),
});
