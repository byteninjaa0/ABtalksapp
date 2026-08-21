import { CertificateType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueParticipant,
  findFirstCertificate,
  createCertificate,
  generateCertificateId,
} = vi.hoisted(() => ({
  findUniqueParticipant: vi.fn(),
  findFirstCertificate: vi.fn(),
  createCertificate: vi.fn(),
  generateCertificateId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    hackathonParticipant: { findUnique: findUniqueParticipant },
    certificate: {
      findFirst: findFirstCertificate,
      create: createCertificate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/features/certificate/generate-certificate-id", () => ({
  generateCertificateId,
}));

import {
  HACKATHON_EVENT_KEY,
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
          updatedAt: overrides?.submission?.updatedAt ?? new Date("2026-08-09T12:00:00Z"),
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
  });
});
