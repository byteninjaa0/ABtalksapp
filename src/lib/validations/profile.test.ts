import { describe, expect, it } from "vitest";
import {
  updateProfessionalProfileSchema,
  updateStudentProfileSchema,
} from "@/lib/validations/profile";

describe("updateStudentProfileSchema", () => {
  const base = {
    userType: "STUDENT" as const,
    fullName: "Ada Lovelace",
    college: "IIT Bombay",
    graduationYear: 2027,
    skills: ["AI"],
  };

  it("defaults collegeId to empty and accepts a cuid", () => {
    const omitted = updateStudentProfileSchema.safeParse(base);
    expect(omitted.success).toBe(true);
    if (omitted.success) {
      expect(omitted.data.collegeId).toBe("");
    }

    const cuid = updateStudentProfileSchema.safeParse({
      ...base,
      collegeId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
    });
    expect(cuid.success).toBe(true);
  });

  it("rejects a non-cuid collegeId", () => {
    const bad = updateStudentProfileSchema.safeParse({
      ...base,
      collegeId: "college-1",
    });
    expect(bad.success).toBe(false);
  });
});

describe("updateProfessionalProfileSchema", () => {
  it("does not require college fields", () => {
    const ok = updateProfessionalProfileSchema.safeParse({
      userType: "PROFESSIONAL",
      fullName: "Grace Hopper",
      organization: "Navy",
      role: "Engineer",
      yearsExperience: 10,
      skills: [],
    });
    expect(ok.success).toBe(true);
  });
});
