import { CertificateStatus, CertificateType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getByPublicId = vi.hoisted(() => vi.fn());

vi.mock("@/repositories/credentials", () => ({
  getByPublicId,
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateIST: vi.fn(() => "09 Aug 2026"),
}));

import {
  getPublicCertificate,
  publicCertificateFromCredential,
} from "@/features/certificate/get-certificate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicCertificate", () => {
  it("returns null for invalid or missing IDs", async () => {
    expect(await getPublicCertificate("not-a-cert")).toBeNull();
    expect(getByPublicId).not.toHaveBeenCalled();

    getByPublicId.mockResolvedValue(null);
    expect(await getPublicCertificate("ABT-HK-23456")).toBeNull();
    expect(getByPublicId).toHaveBeenCalledWith("ABT-HK-23456");
  });

  it("maps hackathon metadata to Participated + team/brief details", async () => {
    getByPublicId.mockResolvedValue({
      credentialId: "ABT-HK-23456",
      userId: "user_1",
      type: CertificateType.HACKATHON,
      title: CertificateType.HACKATHON,
      recipientName: "Ada Lovelace",
      status: CertificateStatus.ISSUED,
      issuedAt: new Date("2026-08-09T12:00:00Z"),
      metadata: {
        teamName: "Team Ada",
        problemTitle: "Brief A",
      },
    });

    await expect(getPublicCertificate("abt-hk-23456")).resolves.toEqual({
      certificateId: "ABT-HK-23456",
      recipientName: "Ada Lovelace",
      type: CertificateType.HACKATHON,
      title: "ViCoDathon 2026",
      subtitle: "India's AI Vibe Coding Hackathon",
      issuedOn: "09 Aug 2026",
      statusLabel: "Participated",
      details: [
        { label: "Team", value: "Team Ada" },
        { label: "Brief", value: "Brief A" },
      ],
      hackathonVariant: null,
      isRevoked: false,
    });
  });

  it("maps placement award metadata to Winner label + variant", async () => {
    getByPublicId.mockResolvedValue({
      credentialId: "ABT-HK-W2N3R",
      userId: "user_1",
      type: CertificateType.HACKATHON,
      title: CertificateType.HACKATHON,
      recipientName: "Ada Lovelace",
      status: CertificateStatus.ISSUED,
      issuedAt: new Date("2026-08-13T18:30:00Z"),
      metadata: {
        teamName: "Team Ada",
        problemTitle: "Brief A",
        hackathonVariant: "winner",
      },
    });

    await expect(getPublicCertificate("ABT-HK-W2N3R")).resolves.toMatchObject({
      statusLabel: "Winner",
      hackathonVariant: "winner",
      details: [
        { label: "Team", value: "Team Ada" },
        { label: "Brief", value: "Brief A" },
      ],
    });
  });

  it("falls back solo/empty brief and marks revoked certificates", async () => {
    getByPublicId.mockResolvedValue({
      credentialId: "ABT-HK-ABCDE",
      userId: "user_1",
      type: CertificateType.HACKATHON,
      title: CertificateType.HACKATHON,
      recipientName: "Solo Dev",
      status: CertificateStatus.REVOKED,
      issuedAt: new Date("2026-08-09T12:00:00Z"),
      metadata: {},
    });

    const view = await getPublicCertificate("ABT-HK-ABCDE");
    expect(view).toMatchObject({
      statusLabel: "Participated",
      hackathonVariant: null,
      isRevoked: true,
      details: [
        { label: "Team", value: "Solo entry" },
        { label: "Brief", value: "—" },
      ],
    });
  });

  it("maps Claude challenge fields including track label", async () => {
    getByPublicId.mockResolvedValue({
      credentialId: "ABT-CC-23456",
      userId: "user_1",
      type: "COMPLETION",
      title: CertificateType.CLAUDE_CHALLENGE,
      recipientName: "Claude Grad",
      status: CertificateStatus.ISSUED,
      issuedAt: new Date("2026-08-01T12:00:00Z"),
      metadata: { daysCompleted: 60, longestStreak: 12 },
    });

    const view = await getPublicCertificate("ABT-CC-23456");
    expect(view).toMatchObject({
      statusLabel: "Completed",
      title: "60-Day Claude Challenge",
      hackathonVariant: null,
      details: [
        { label: "Track", value: "Claude AI Mastery" },
        { label: "Days completed", value: "60" },
        { label: "Longest streak", value: "12" },
      ],
      isRevoked: false,
    });
  });
});

describe("publicCertificateFromCredential", () => {
  it("returns null when Credential.title is not a CertificateType", () => {
    expect(
      publicCertificateFromCredential({
        credentialId: "ABT-XX-23456",
        userId: "user_1",
        type: "OTHER",
        title: "garbage",
        recipientName: "X",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date(),
        metadata: {},
      }),
    ).toBeNull();
  });
});
