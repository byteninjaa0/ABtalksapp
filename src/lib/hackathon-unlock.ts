/**
 * Shared constants for the VC20 unlock gate on /hackathon.
 *
 * The code is a fixed, non-secret token emailed to every registrant. It is
 * NOT security — it's a "did you read the email?" confirmation that gates the
 * rest of the landing until the user proves they got their code. Registered
 * users are auto-unlocked by the server (they already proved it by owning
 * the account behind the registration); the code path exists for people who
 * have the code but aren't signed-in on this browser yet.
 */
export const HACKATHON_UNLOCK_CODE = "VC20";
export const HACKATHON_UNLOCK_STORAGE_KEY =
  "klymb:hackathon:vicodathon-2-2026:unlocked";
