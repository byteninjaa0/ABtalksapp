import { CertificateType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueParticipant,
  findFirstCertificate,
  findManyCertificates,
  createCertificate,
  generateCertificateId,
  transaction,
  dualWriteCredential,
} = vi.hoisted(() => ({
  findUniqueParticipant: vi.fn(),
  findFirstCertificate: vi.fn(),
  findManyCertificates: vi.fn(),
  createCertificate: vi.fn(),
  generateCertificateId: vi.fn(),
  transaction: vi.fn(),
  dualWriteCredential: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    hackathonParticipant: { findUnique: findUniqueParticipant },
    certificate: {
      findFirst: findFirstCertificate,
      findMany: findManyCertificates,
      create: createCertificate,
    },
  },
  writeClient: () => ({ $transaction: transaction }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/features/certificate/generate-certificate-id", () => ({
  generateCertificateId,
}));

vi.mock("@/repositories/dual-write", () => ({
  dualWriteCredential,
}));

import {
  HACKATHON_CERTIFICATE_ISSUED_AT,
  HACKATHON_EVENT_KEY,
  ensureHackathonAwardCertificate,
  ensureHackathonCertificate,
} from "@/features/certificate/issue-hackathon-certificate";

function participant(overrides?: {
  fullName?: string;
  submission?: null | {
    repoUrl?: string;
    liveUrl?: string;
    aiLogUrl?: string | null;
    updatedAt?: Date;
    problem?: { title: string } | null;
  };
}) {
  const submission =
    overrides && "submission" in overrides && overrides.submission === null
      ? null
      : {
          repoUrl: overrides?.submission?.repoUrl ?? "https://github.com/a/b",
          liveUrl: overrides?.submission?.liveUrl ?? "https://example.com",
          aiLogUrl: overrides?.submission?.aiLogUrl ?? null,
          updatedAt:
            overrides?.submission?.updatedAt ?? new Date("2026-08-09T12:00:00Z"),
          problem: overrides?.submission?.problem ?? { title: "Brief A" },
        };

  return {
    fullName: overrides?.fullName ?? "Ada Lovelace",
    isLeader: true,
    team: {
      id: "team-1",
      teamCode: "ABC12",
      teamName: "Team Ada",
      entryType: "TEAM",
      submission,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateCertificateId.mockResolvedValue("ABT-HK-23456");
  dualWriteCredential.mockResolvedValue(undefined);
  transaction.mockImplementation(async (fn: (tx: {
    certificate: { create: typeof createCertificate };
  }) => unknown) =>
    fn({ certificate: { create: createCertificate } }),
  );
});

describe("ensureHackathonCertificate", () => {
  it("rejects users who are not registered", async () => {
    findUniqueParticipant.mockResolvedValue(null);
    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Not registered for the hackathon",
    });
  });

  it("rejects teams without a submission or with blank URLs", async () => {
    findUniqueParticipant.mockResolvedValue(participant({ submission: null }));
    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Team has no submission",
    });

    findUniqueParticipant.mockResolvedValue(
      participant({ submission: { repoUrl: "  ", liveUrl: "https://x.com" } }),
    );
    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Submission is missing a repo URL or a live URL",
    });
  });

  it("returns existing certificate idempotently", async () => {
    findUniqueParticipant.mockResolvedValue(participant());
    findFirstCertificate.mockResolvedValue({ certificateId: "ABT-HK-EXIST" });
    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-HK-EXIST", alreadyIssued: true },
    });
    expect(createCertificate).not.toHaveBeenCalled();
    expect(dualWriteCredential).toHaveBeenCalledWith(
      expect.any(Object),
      "ABT-HK-EXIST",
    );
  });

  it("rejects blank participant names before issuing", async () => {
    findUniqueParticipant.mockResolvedValue(participant({ fullName: "   " }));
    findFirstCertificate.mockResolvedValue(null);
    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: false,
      message: "Participant has no name on their hackathon registration",
    });
  });

  it("issues a new HACKATHON certificate with event metadata", async () => {
    findUniqueParticipant.mockResolvedValue(participant());
    findFirstCertificate.mockResolvedValue(null);
    createCertificate.mockResolvedValue({ certificateId: "ABT-HK-23456" });

    await expect(ensureHackathonCertificate("u1")).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-HK-23456", alreadyIssued: false },
    });

    expect(generateCertificateId).toHaveBeenCalledWith(CertificateType.HACKATHON);
    expect(createCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          certificateId: "ABT-HK-23456",
          userId: "u1",
          type: CertificateType.HACKATHON,
          recipientName: "Ada Lovelace",
          domain: null,
          enrollmentId: null,
          metadata: expect.objectContaining({
            event: HACKATHON_EVENT_KEY,
            teamId: "team-1",
            teamName: "Team Ada",
            problemTitle: "Brief A",
            repoUrl: "https://github.com/a/b",
            liveUrl: "https://example.com",
          }),
        }),
        select: { certificateId: true },
      }),
    );
    expect(dualWriteCredential).toHaveBeenCalledWith(
      expect.any(Object),
      "ABT-HK-23456",
    );
  });
});

describe("ensureHackathonAwardCertificate", () => {
  it("rejects blank recipient names", async () => {
    await expect(
      ensureHackathonAwardCertificate({
        userId: "u1",
        variant: "winner",
        recipientName: "  ",
      }),
    ).resolves.toEqual({ ok: false, message: "Recipient name is required" });
    expect(findUniqueParticipant).not.toHaveBeenCalled();
  });

  it("rejects users who are not registered", async () => {
    findUniqueParticipant.mockResolvedValue(null);
    await expect(
      ensureHackathonAwardCertificate({
        userId: "u1",
        variant: "top5",
        recipientName: "Ada Lovelace",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Not registered for the hackathon",
    });
  });

  it("returns the matching award row idempotently without blocking other variants", async () => {
    findUniqueParticipant.mockResolvedValue(participant());
    findManyCertificates.mockResolvedValue([
      {
        certificateId: "ABT-HK-PART",
        metadata: { event: HACKATHON_EVENT_KEY },
      },
      {
        certificateId: "ABT-HK-WIN",
        metadata: { hackathonVariant: "winner" },
      },
    ]);

    await expect(
      ensureHackathonAwardCertificate({
        userId: "u1",
        variant: "winner",
        recipientName: "Ada Lovelace",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-HK-WIN", alreadyIssued: true },
    });
    expect(createCertificate).not.toHaveBeenCalled();
    expect(dualWriteCredential).toHaveBeenCalledWith(
      expect.any(Object),
      "ABT-HK-WIN",
    );
  });

  it("issues a top5 award even when participation and winner rows already exist", async () => {
    findUniqueParticipant.mockResolvedValue(
      participant({ submission: null }),
    );
    findManyCertificates.mockResolvedValue([
      { certificateId: "ABT-HK-PART", metadata: {} },
      {
        certificateId: "ABT-HK-WIN",
        metadata: { hackathonVariant: "winner" },
      },
    ]);
    generateCertificateId.mockResolvedValue("ABT-HK-TOP5X");
    createCertificate.mockResolvedValue({ certificateId: "ABT-HK-TOP5X" });

    await expect(
      ensureHackathonAwardCertificate({
        userId: "u1",
        variant: "top5",
        recipientName: "  Ada Lovelace  ",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { certificateId: "ABT-HK-TOP5X", alreadyIssued: false },
    });

    expect(createCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          certificateId: "ABT-HK-TOP5X",
          userId: "u1",
          type: CertificateType.HACKATHON,
          recipientName: "Ada Lovelace",
          issuedAt: HACKATHON_CERTIFICATE_ISSUED_AT,
          metadata: expect.objectContaining({
            event: HACKATHON_EVENT_KEY,
            teamId: "team-1",
            hackathonVariant: "top5",
            repoUrl: "",
            liveUrl: "",
            submittedAt: null,
          }),
        }),
      }),
    );
    expect(dualWriteCredential).toHaveBeenCalledWith(
      expect.any(Object),
      "ABT-HK-TOP5X",
    );
  });
});
