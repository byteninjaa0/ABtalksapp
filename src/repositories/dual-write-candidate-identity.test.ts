import { UserType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isDualWriteEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/feature-flags", () => ({
  isDualWriteEnabled,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  dualWriteCandidateIdentity,
  educationIdForStudentProfile,
  experienceIdForStudentProfile,
} from "@/repositories/dual-write";

beforeEach(() => {
  vi.clearAllMocks();
  isDualWriteEnabled.mockReturnValue(true);
});

afterEach(() => {
  isDualWriteEnabled.mockReturnValue(false);
});

function makeTx(overrides?: {
  studentProfile?: Record<string, unknown> | null;
  existingPhoneVerifiedAt?: Date | null;
}) {
  const studentProfile = Object.prototype.hasOwnProperty.call(
    overrides ?? {},
    "studentProfile",
  )
    ? overrides!.studentProfile
    : {
        userId: "user_1",
        fullName: "Ada",
        userType: UserType.STUDENT,
        college: "IIT",
        collegeId: "col_1",
        graduationYear: 2026,
        organization: "Acme",
        role: "Engineer",
        yearsExperience: 2,
        phone: "+91",
        phoneVerified: true,
        phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
        linkedinUrl: "https://linkedin.com/in/ada",
        githubUsername: "ada",
        resumeUrl: null,
        referralCode: "ABCD1234",
        skills: [],
        isReadyForInterview: false,
        isCampusAmbassadorCandidate: false,
        ambassadorAppliedAt: null,
        ambassadorDismissedAt: null,
      };

  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    studentProfile: {
      findUnique: vi.fn().mockResolvedValue(studentProfile),
    },
    candidateProfile: {
      findUnique: vi.fn().mockResolvedValue(
        overrides?.existingPhoneVerifiedAt !== undefined
          ? { phoneVerifiedAt: overrides.existingPhoneVerifiedAt }
          : null,
      ),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    candidateEducation: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    candidateExperience: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    skill: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    candidateSkill: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
    },
  };
}

describe("education/experience deterministic ids", () => {
  it("prefixes profile-owned child ids with edu_sp_ / exp_sp_", () => {
    expect(educationIdForStudentProfile("user_1")).toBe("edu_sp_user_1");
    expect(experienceIdForStudentProfile("user_1")).toBe("exp_sp_user_1");
  });
});

describe("dualWriteCandidateIdentity", () => {
  it("always copies referralCode and only overwrites submitted scalars", async () => {
    const tx = makeTx();

    await dualWriteCandidateIdentity(tx as never, "user_1", {
      phone: true,
    });

    expect(tx.candidateProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      create: expect.objectContaining({
        id: "cp_user_1",
        userId: "user_1",
        fullName: "Ada",
        referralCode: "ABCD1234",
        phone: "+91",
        phoneVerified: true,
      }),
      update: {
        referralCode: "ABCD1234",
        phone: "+91",
        phoneVerified: true,
        phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    expect(tx.candidateEducation.upsert).not.toHaveBeenCalled();
    expect(tx.candidateExperience.upsert).not.toHaveBeenCalled();
  });

  it("syncs education/experience on full identity writes", async () => {
    const tx = makeTx();

    await dualWriteCandidateIdentity(tx as never, "user_1");

    expect(tx.candidateEducation.upsert).toHaveBeenCalledWith({
      where: { id: "edu_sp_user_1" },
      create: expect.objectContaining({
        id: "edu_sp_user_1",
        institutionName: "IIT",
        collegeId: "col_1",
        graduationYear: 2026,
      }),
      update: expect.objectContaining({
        institutionName: "IIT",
        collegeId: "col_1",
      }),
    });
    expect(tx.candidateExperience.upsert).toHaveBeenCalledWith({
      where: { id: "exp_sp_user_1" },
      create: expect.objectContaining({
        id: "exp_sp_user_1",
        companyName: "Acme",
        title: "Engineer",
        totalMonths: 24,
      }),
      update: expect.objectContaining({
        companyName: "Acme",
        title: "Engineer",
        totalMonths: 24,
      }),
    });
  });

  it("no-ops when dual-write is off", async () => {
    isDualWriteEnabled.mockReturnValue(false);
    const tx = makeTx();

    await dualWriteCandidateIdentity(tx as never, "user_1");

    expect(tx.studentProfile.findUnique).not.toHaveBeenCalled();
    expect(tx.candidateProfile.upsert).not.toHaveBeenCalled();
  });

  it("rolls back the SAVEPOINT when StudentProfile is missing", async () => {
    const tx = makeTx({ studentProfile: null });

    await dualWriteCandidateIdentity(tx as never, "user_1");

    expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
      "SAVEPOINT dw_candidateIdentity",
      "ROLLBACK TO SAVEPOINT dw_candidateIdentity",
    ]);
    expect(tx.candidateProfile.upsert).not.toHaveBeenCalled();
  });
});
