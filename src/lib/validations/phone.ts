import { z } from "zod";

/**
 * International phone number validation.
 * Accepts:
 *   - Optional leading + sign
 *   - 7 to 15 digits (E.164 spec range)
 *   - May include single spaces, hyphens, or parentheses (stripped during validation)
 *
 * Rejects:
 *   - Too short (under 7 digits)
 *   - Too long (over 15 digits)
 *   - Letters or invalid characters
 */
export const phoneSchema = z
  .string()
  .transform((val) => val.replace(/[\s\-()]/g, ""))
  .refine(
    (val) => /^\+?\d{7,15}$/.test(val),
    "Enter a valid phone number (7-15 digits, optional + prefix)",
  );

// Use this when phone is optional
export const optionalPhoneSchema = z
  .union([z.literal(""), phoneSchema])
  .default("");
