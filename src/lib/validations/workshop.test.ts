import { describe, expect, it } from "vitest";
import { workshopRegistrationSchema } from "@/lib/validations/workshop";

const baseValid = {
  name: "Ada Lovelace",
  phone: "9876543210",
  role: "Student" as const,
  organization: "Example College",
  graduationYear: 2027,
  acceptLegal: true as const,
  newsletterOptIn: true,
};

describe("workshopRegistrationSchema legal consent", () => {
  it("accepts acceptLegal + explicit newsletterOptIn (including opt-out)", () => {
    const ok = workshopRegistrationSchema.safeParse({
      ...baseValid,
      newsletterOptIn: false,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.newsletterOptIn).toBe(false);
    }
  });

  it("rejects when Terms/Privacy are not accepted", () => {
    const bad = workshopRegistrationSchema.safeParse({
      ...baseValid,
      acceptLegal: false,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects when newsletterOptIn is omitted", () => {
    const { newsletterOptIn: _omit, ...rest } = baseValid;
    const bad = workshopRegistrationSchema.safeParse(rest);
    expect(bad.success).toBe(false);
  });

  it("rejects empty name/phone", () => {
    expect(
      workshopRegistrationSchema.safeParse({ ...baseValid, name: "  " }).success,
    ).toBe(false);
    expect(
      workshopRegistrationSchema.safeParse({ ...baseValid, phone: "" }).success,
    ).toBe(false);
  });
});
