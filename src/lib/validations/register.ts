import { z } from "zod";
import { requiredPhoneSchema } from "@/lib/validations/phone";

const empty = z.literal("");

/** Explicit literals so validation never depends on a stale bundled `Domain` object. */
const domainSchema = z.enum(["SE", "DS", "AI"]);

export const registerSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
  college: z.string().min(1, "College is required").max(200),
  graduationYear: z.number().int().min(2020).max(2035),
  domain: domainSchema,
  skills: z.array(z.string().min(1).max(50)).max(10).default([]),
  linkedinUrl: z.union([empty, z.string().url()]).default(""),
  phone: requiredPhoneSchema,
  githubUsername: z
    .union([empty, z.string().regex(/^[a-zA-Z0-9-]+$/).max(50)])
    .default(""),
  referralCode: z
    .union([empty, z.string().length(6).regex(/^[A-Z0-9]{6}$/)])
    .default(""),
});

export type RegisterInput = z.infer<typeof registerSchema>;
