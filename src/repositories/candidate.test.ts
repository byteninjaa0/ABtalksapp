import { CandidatePersona, UserType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueCandidate = vi.hoisted(() => vi.fn());
const findManyCandidate = vi.hoisted(() => vi.fn());
const findUniqueStudent = vi.hoisted(() => vi.fn());
const findManyStudent = vi.hoisted(() => vi.fn());
const findManyPreference = vi.hoisted(() => vi.fn());
const isNewCandidateRepoEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    candidateProfile: {
      findUnique: findUniqueCandidate,
      findMany: findManyCandidate,
    },
    candidatePreference: {
      findMany: findManyPreference,
    },
  },
}));

vi.mock("@/repositories/legacy/student-profile", () => ({
  studentProfile: {
    findUnique: findUniqueStudent,
    findMany: findManyStudent,
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  isNewCandidateRepoEnabled,
}));

import {
  findUserIdByReferralCode,
  getCandidateProfile,
  listCandidateAvailability,
  listCandidateProfiles,
} from "@/repositories/candidate";

beforeEach(() => {
  vi.clearAllMocks();
  isNewCandidateRepoEnabled.mockReturnValue(false);
});

afterEach(() => {
  isNewCandidateRepoEnabled.mockReturnValue(false);
});

describe("getCandidateProfile", () => {
  it("reads StudentProfile when ENABLE_NEW_CANDIDATE is off", async () => {
    findUniqueStudent.mockResolvedValue({
      userId: "user_1",
      fullName: "Ada",
      userType: UserType.STUDENT,
      college: "IIT",
      collegeId: "col_1",
      graduationYear: 2026,
      organization: null,
      role: null,
      yearsExperience: null,
      phone: null,
      phoneVerified: false,
      linkedinUrl: null,
      githubUsername: null,
      resumeUrl: null,
      referralCode: "ABCD1234",
      skills: ["TypeScript"],
      isReadyForInterview: false,
      isCampusAmbassadorCandidate: false,
      ambassadorDismissedAt: null,
    });

    await expect(getCandidateProfile("user_1")).resolves.toMatchObject({
      userId: "user_1",
      fullName: "Ada",
      userType: "STUDENT",
      college: "IIT",
      collegeId: "col_1",
      referralCode: "ABCD1234",
      skills: ["TypeScript"],
      headline: null,
    });
    expect(findUniqueStudent).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      select: expect.objectContaining({ fullName: true, referralCode: true }),
    });
    expect(findUniqueCandidate).not.toHaveBeenCalled();
  });

  it("returns null when the legacy profile is missing", async () => {
    findUniqueStudent.mockResolvedValue(null);
    await expect(getCandidateProfile("missing")).resolves.toBeNull();
  });

  it("maps CandidateProfile education/experience/skills when the flag is on", async () => {
    isNewCandidateRepoEnabled.mockReturnValue(true);
    findUniqueCandidate.mockResolvedValue({
      userId: "user_1",
      fullName: "Ada",
      headline: "Builder",
      primaryPersona: CandidatePersona.PROFESSIONAL,
      phone: "+91",
      phoneVerified: true,
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUsername: "ada",
      resumeUrl: null,
      referralCode: "ABCD1234",
      isReadyForInterview: true,
      isCampusAmbassadorCandidate: false,
      ambassadorDismissedAt: null,
      education: [
        {
          id: "edu_other",
          institutionName: "Wrong school",
          collegeId: "col_x",
          graduationYear: 2010,
          sortOrder: 1,
        },
        {
          id: "edu_sp_user_1",
          institutionName: "IIT",
          collegeId: "col_1",
          graduationYear: 2024,
          sortOrder: 0,
        },
      ],
      experience: [
        {
          id: "exp_sp_user_1",
          companyName: "Not specified",
          title: "Engineer",
          totalMonths: 30,
        },
      ],
      skills: [{ skill: { name: "Rust" } }, { skill: { name: "Go" } }],
    });

    await expect(getCandidateProfile("user_1")).resolves.toEqual({
      userId: "user_1",
      fullName: "Ada",
      headline: "Builder",
      phone: "+91",
      phoneVerified: true,
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUsername: "ada",
      resumeUrl: null,
      referralCode: "ABCD1234",
      skills: ["Rust", "Go"],
      isReadyForInterview: true,
      userType: "PROFESSIONAL",
      college: "IIT",
      collegeId: "col_1",
      graduationYear: 2024,
      organization: null,
      role: "Engineer",
      yearsExperience: 3,
      isCampusAmbassadorCandidate: false,
      ambassadorDismissedAt: null,
    });
    expect(findUniqueCandidate).toHaveBeenCalled();
    expect(findUniqueStudent).not.toHaveBeenCalled();
  });
});

describe("listCandidateProfiles", () => {
  it("returns an empty map for empty input without querying", async () => {
    await expect(listCandidateProfiles([])).resolves.toEqual(new Map());
    expect(findManyStudent).not.toHaveBeenCalled();
    expect(findManyCandidate).not.toHaveBeenCalled();
  });

  it("dedupes ids and reads CandidateProfile when the flag is on", async () => {
    isNewCandidateRepoEnabled.mockReturnValue(true);
    findManyCandidate.mockResolvedValue([
      {
        userId: "user_1",
        fullName: "Ada",
        headline: null,
        primaryPersona: CandidatePersona.STUDENT,
        phone: null,
        phoneVerified: false,
        linkedinUrl: null,
        githubUsername: null,
        resumeUrl: null,
        referralCode: "ABCD1234",
        isReadyForInterview: false,
        isCampusAmbassadorCandidate: false,
        ambassadorDismissedAt: null,
        education: [],
        experience: [],
        skills: [],
      },
    ]);

    const map = await listCandidateProfiles(["user_1", "user_1", ""]);
    expect([...map.keys()]).toEqual(["user_1"]);
    expect(findManyCandidate).toHaveBeenCalledWith({
      where: { userId: { in: ["user_1"] } },
      select: expect.any(Object),
    });
  });
});

describe("findUserIdByReferralCode", () => {
  it("resolves from StudentProfile when the flag is off", async () => {
    findUniqueStudent.mockResolvedValue({ userId: "user_1" });
    await expect(findUserIdByReferralCode("ABCD1234")).resolves.toBe("user_1");
    expect(findUniqueCandidate).not.toHaveBeenCalled();
  });

  it("resolves from CandidateProfile when ENABLE_NEW_CANDIDATE is on", async () => {
    isNewCandidateRepoEnabled.mockReturnValue(true);
    findUniqueCandidate.mockResolvedValue({ userId: "user_2" });
    await expect(findUserIdByReferralCode("ABCD1234")).resolves.toBe("user_2");
    expect(findUniqueCandidate).toHaveBeenCalledWith({
      where: { referralCode: "ABCD1234" },
      select: { userId: true },
    });
    expect(findUniqueStudent).not.toHaveBeenCalled();
  });
});

describe("listCandidateAvailability", () => {
  it("maps CandidatePreference fields into hire vocabulary", async () => {
    findManyPreference.mockResolvedValue([
      {
        userId: "user_1",
        openToWork: true,
        expectedSalaryMin: 10,
        expectedSalaryMax: 20,
        salaryCurrency: null,
        noticePeriodDays: 30,
        remotePreference: "REMOTE",
        preferredLocations: ["Bengaluru"],
        willingToRelocate: true,
      },
    ]);

    const map = await listCandidateAvailability(["user_1"]);
    expect(map.get("user_1")).toEqual({
      userId: "user_1",
      openToWork: true,
      expectedSalaryMin: 10,
      expectedSalaryMax: 20,
      salaryCurrency: "INR",
      noticePeriodDays: 30,
      preferredWorkMode: "REMOTE",
      preferredCities: ["Bengaluru"],
      openToRelocate: true,
    });
  });
});
