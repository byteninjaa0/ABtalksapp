import { z } from "zod";

/**
 * Workshop lead-form payload. `email` is deliberately absent: it comes from
 * the session, never the client.
 */
export const workshopRegistrationSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  role: z.enum(["Student", "Professional"]),
  organization: z.string().trim().min(1).nullish(),
  graduationYear: z.coerce.number().int().min(2020).max(2035).nullish(),
  acceptLegal: z.boolean().refine((v) => v === true, {
    message: "Please accept the Terms of Service and Privacy Policy",
  }),
  // Marketing opt-in — plain boolean, never blocks signup.
  newsletterOptIn: z.boolean(),
});

export type WorkshopRegistrationInput = z.infer<
  typeof workshopRegistrationSchema
>;
