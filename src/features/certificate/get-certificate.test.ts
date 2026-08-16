import { CertificateStatus, CertificateType, Domain } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: { findUnique },
  },
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateIST: vi.fn(() => "09 Aug 2026"),
}));

import { getPublicCertificate } from "@/features/certificate/get-certificate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicCertificate", () => {
  it("returns null for invalid or missing IDs", async () => {
    expect(await getPublicCertificate("not-a-cert")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();

    findUnique.mockResolvedValue(null);
    expect(await getPublicCertificate("ABT-HK-23456")).toBeNull();
  });

  it("maps hackathon metadata to Participated + team/brief details", async () => {
    findUnique.mockResolvedValue({
      certificateId: "ABT-HK-23456",
      recipientName: "Ada Lovelace",
      type: CertificateType.HACKATHON,
      status: CertificateStatus.ISSUED,
      domain: null,
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
      isRevoked: false,
    });
  });

  it("falls back solo/empty brief and marks revoked certificates", async () => {
    findUnique.mockResolvedValue({
      certificateId: "ABT-HK-ABCDE",
      recipientName: "Solo Dev",
      type: CertificateType.HACKATHON,
      status: CertificateStatus.REVOKED,
      domain: null,
      issuedAt: new Date("2026-08-09T12:00:00Z"),
      metadata: {},
    });

    const view = await getPublicCertificate("ABT-HK-ABCDE");
    expect(view).toMatchObject({
      statusLabel: "Participated",
      isRevoked: true,
      details: [
        { label: "Team", value: "Solo entry" },
        { label: "Brief", value: "—" },
      ],
    });
  });

  it("maps Claude challenge fields including track label", async () => {
    findUnique.mockResolvedValue({
      certificateId: "ABT-CC-23456",
      recipientName: "Claude Grad",
      type: CertificateType.CLAUDE_CHALLENGE,
      status: CertificateStatus.ISSUED,
      domain: Domain.CLAUDE,
      issuedAt: new Date("2026-08-01T12:00:00Z"),
      metadata: { daysCompleted: 60, longestStreak: 12 },
    });

    const view = await getPublicCertificate("ABT-CC-23456");
    expect(view).toMatchObject({
      statusLabel: "Completed",
      title: "60-Day Claude Challenge",
      details: [
        { label: "Track", value: "Claude AI Mastery" },
        { label: "Days completed", value: "60" },
        { label: "Longest streak", value: "12" },
      ],
      isRevoked: false,
    });
  });
});
