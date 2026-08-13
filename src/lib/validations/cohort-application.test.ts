import { describe, expect, it } from "vitest";
import { cohortApplicationSchema } from "@/lib/validations/cohort-application";

const baseValid = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  visaCategory: "H-1B" as const,
  educationLevel: "Master's Degree - Computer Science / AI / Data Science" as const,
  totalExperience: "3-5 years" as const,
  aiMlExperience: "1-2 years" as const,
  currentTitleCompany: "Engineer @ Example",
  industry: "Technology / Software" as const,
  primaryLanguagesTools: "Python, TypeScript",
  whyInterested: "x".repeat(60),
  whatToAchieve: "y".repeat(60),
  targetRole: "AI / ML Engineer" as const,
  commitHours: true as const,
  attendSessions: true as const,
  understandPreCall: true as const,
  basedInUsa: true as const,
  readyForChallenge: true as const,
  preferredStartWindow: "As soon as possible" as const,
  acceptLegal: true as const,
  newsletterOptIn: true,
};

describe("cohortApplicationSchema legal consent", () => {
  it("accepts acceptLegal + explicit newsletterOptIn (including opt-out)", () => {
    const ok = cohortApplicationSchema.safeParse({
      ...baseValid,
      newsletterOptIn: false,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects when Terms/Privacy are not accepted", () => {
    const bad = cohortApplicationSchema.safeParse({
      ...baseValid,
      acceptLegal: false,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects when newsletterOptIn is omitted", () => {
    const { newsletterOptIn: _omit, ...rest } = baseValid;
    const bad = cohortApplicationSchema.safeParse(rest);
    expect(bad.success).toBe(false);
  });
});
