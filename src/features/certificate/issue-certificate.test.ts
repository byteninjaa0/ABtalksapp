import { CertificateType, Domain } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstEnrollment = vi.hoisted(() => vi.fn());
const findFirstSubmission = vi.hoisted(() => vi.fn());
const findUniqueCertificate = vi.hoisted(() => vi.fn());
const createCertificate = vi.hoisted(() => vi.fn());
const generateCertificateId = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    enrollment: { findFirst: findFirstEnrollment },
    submission: { findFirst: findFirstSubmission },
    certificate: {
      findUnique: findUniqueCertificate,
      create: createCertificate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/features/certificate/generate-certificate-id", () => ({
  generateCertificateId,
}));

import { ensureClaudeCertificate } from "@/features/certificate/issue-certificate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureClaudeCertificate eligibility", () => {
  it("fails when user has no CLAUDE enrollment", async () => {
    findFirstEnrollment.mockResolvedValue(null);

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Not enrolled in the Claude challenge",
    });
    expect(findFirstSubmission).not.toHaveBeenCalled();
  });

  it("fails when day 60 is missing or daysCompleted < 50", async () => {
    findFirstEnrollment.mockResolvedValue({
      id: "enr1",
      daysCompleted: 49,
      longestStreak: 10,
      completedAt: null,
      user: { studentProfile: { fullName: "Ada", college: null, organization: null } },
    });
    findFirstSubmission.mockResolvedValue({ id: "sub60" });

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Challenge not completed yet",
    });

    findFirstEnrollment.mockResolvedValue({
      id: "enr1",
      daysCompleted: 50,
      longestStreak: 10,
      completedAt: null,
      user: { studentProfile: { fullName: "Ada", college: null, organization: null } },
    });
    findFirstSubmission.mockResolvedValue(null);

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Challenge not completed yet",
    });
    expect(createCertificate).not.toHaveBeenCalled();
  });

  it("returns alreadyIssued when a certificate exists for the enrollment", async () => {
    findFirstEnrollment.mockResolvedValue({
      id: "enr1",
      daysCompleted: 55,
      longestStreak: 20,
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: { studentProfile: { fullName: "Ada", college: "X", organization: null } },
    });
    findFirstSubmission.mockResolvedValue({ id: "sub60" });
    findUniqueCertificate.mockResolvedValue({ certificateId: "ABT-CL-W2N3R" });

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-CL-W2N3R", alreadyIssued: true },
    });
    expect(generateCertificateId).not.toHaveBeenCalled();
  });

  it("requires a non-empty profile name before issuing", async () => {
    findFirstEnrollment.mockResolvedValue({
      id: "enr1",
      daysCompleted: 55,
      longestStreak: 20,
      completedAt: null,
      user: { studentProfile: { fullName: "  ", college: null, organization: null } },
    });
    findFirstSubmission.mockResolvedValue({ id: "sub60" });
    findUniqueCertificate.mockResolvedValue(null);

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Complete your profile name before claiming your certificate",
    });
  });

  it("issues a new CLAUDE_CHALLENGE certificate when eligible", async () => {
    const completedAt = new Date("2026-02-01T12:00:00.000Z");
    findFirstEnrollment.mockResolvedValue({
      id: "enr1",
      daysCompleted: 58,
      longestStreak: 30,
      completedAt,
      user: {
        studentProfile: {
          fullName: "Ada Lovelace",
          college: "MIT",
          organization: null,
        },
      },
    });
    findFirstSubmission.mockResolvedValue({ id: "sub60" });
    findUniqueCertificate.mockResolvedValue(null);
    generateCertificateId.mockResolvedValue("ABT-CL-W2N3R");
    createCertificate.mockResolvedValue({ certificateId: "ABT-CL-W2N3R" });

    await expect(ensureClaudeCertificate("u1")).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-CL-W2N3R", alreadyIssued: false },
    });

    expect(generateCertificateId).toHaveBeenCalledWith(CertificateType.CLAUDE_CHALLENGE);
    expect(createCertificate).toHaveBeenCalledWith({
      data: {
        certificateId: "ABT-CL-W2N3R",
        userId: "u1",
        type: CertificateType.CLAUDE_CHALLENGE,
        recipientName: "Ada Lovelace",
        domain: Domain.CLAUDE,
        enrollmentId: "enr1",
        issuedAt: completedAt,
        metadata: {
          daysCompleted: 58,
          longestStreak: 30,
          completedAt: completedAt.toISOString(),
          college: "MIT",
          organization: null,
        },
      },
      select: { certificateId: true },
    });
  });
});
