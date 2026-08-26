import { CertificateStatus, CertificateType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listForUser = vi.hoisted(() => vi.fn());
const ensureClaudeCertificate = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/repositories/credentials", () => ({
  listForUser,
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateIST: vi.fn(() => "09 Aug 2026"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/features/certificate/issue-certificate", () => ({
  ensureClaudeCertificate,
}));

import { getAchievements } from "@/features/certificate/get-achievements";

beforeEach(() => {
  vi.clearAllMocks();
  ensureClaudeCertificate.mockResolvedValue(undefined);
});

describe("getAchievements", () => {
  it("maps hackathon credentials to Participated + team/brief stats", async () => {
    listForUser.mockResolvedValue([
      {
        credentialId: "ABT-HK-23456",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        title: CertificateType.HACKATHON,
        recipientName: "Ada",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-09T12:00:00Z"),
        metadata: { teamName: "Team Ada", problemTitle: "Brief A" },
      },
    ]);

    await expect(getAchievements("user_1")).resolves.toEqual([
      {
        key: "ABT-HK-23456",
        title: "ViCoDathon 2026",
        subtitle: "India's AI Vibe Coding Hackathon",
        certificateId: "ABT-HK-23456",
        issuedOn: "09 Aug 2026",
        statusLabel: "Participated",
        stats: [
          { label: "Team", value: "Team Ada" },
          { label: "Brief", value: "Brief A" },
        ],
        status: "COMPLETED",
      },
    ]);
    expect(ensureClaudeCertificate).toHaveBeenCalledWith("user_1");
    expect(listForUser).toHaveBeenCalledWith("user_1");
  });

  it("falls back solo/empty brief and marks revoked", async () => {
    listForUser.mockResolvedValue([
      {
        credentialId: "ABT-HK-ABCDE",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        title: CertificateType.HACKATHON,
        recipientName: "Solo",
        status: CertificateStatus.REVOKED,
        issuedAt: new Date("2026-08-09T12:00:00Z"),
        metadata: {},
      },
    ]);

    const views = await getAchievements("user_1");
    expect(views[0]).toMatchObject({
      key: "ABT-HK-ABCDE",
      statusLabel: "Participated",
      status: "REVOKED",
      stats: [
        { label: "Team", value: "Solo entry" },
        { label: "Brief", value: "—" },
      ],
    });
  });

  it("maps placement awards to Winner/Top 5 labels and Placement stat", async () => {
    listForUser.mockResolvedValue([
      {
        credentialId: "ABT-HK-WINNR",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        title: CertificateType.HACKATHON,
        recipientName: "Ada",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-13T18:30:00Z"),
        metadata: {
          teamName: "Team Ada",
          problemTitle: "Brief A",
          hackathonVariant: "winner",
        },
      },
      {
        credentialId: "ABT-HK-TOP5X",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        title: CertificateType.HACKATHON,
        recipientName: "Five",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-13T18:30:00Z"),
        metadata: {
          teamName: "Team Five",
          problemTitle: "Brief B",
          hackathonVariant: "top5",
        },
      },
    ]);

    const views = await getAchievements("user_1");
    expect(views[0]).toMatchObject({
      statusLabel: "Winner",
      stats: [
        { label: "Placement", value: "Winner" },
        { label: "Team", value: "Team Ada" },
        { label: "Brief", value: "Brief A" },
      ],
    });
    expect(views[1]).toMatchObject({
      statusLabel: "Top 5",
      stats: [
        { label: "Placement", value: "Top 5" },
        { label: "Team", value: "Team Five" },
        { label: "Brief", value: "Brief B" },
      ],
    });
  });

  it("maps Claude challenge days/streak and survives ensureClaude failure", async () => {
    ensureClaudeCertificate.mockRejectedValue(new Error("issue failed"));
    listForUser.mockResolvedValue([
      {
        credentialId: "ABT-CC-23456",
        userId: "user_1",
        type: "COMPLETION",
        title: CertificateType.CLAUDE_CHALLENGE,
        recipientName: "Claude Grad",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-01T12:00:00Z"),
        metadata: { daysCompleted: 60, longestStreak: 12 },
      },
    ]);

    const views = await getAchievements("user_1");
    expect(views[0]).toMatchObject({
      title: "60-Day Claude Challenge",
      statusLabel: "Completed",
      stats: [
        { label: "Days completed", value: "60" },
        { label: "Longest streak", value: "12" },
      ],
      status: "COMPLETED",
    });
  });

  it("skips credentials whose title is not a CertificateType", async () => {
    listForUser.mockResolvedValue([
      {
        credentialId: "ABT-XX-23456",
        userId: "user_1",
        type: "OTHER",
        title: "not-a-certificate-type",
        recipientName: "X",
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-01T12:00:00Z"),
        metadata: {},
      },
    ]);

    await expect(getAchievements("user_1")).resolves.toEqual([]);
    expect(loggerError).toHaveBeenCalledWith(
      "Skipping credential with unmapped certificate title",
      expect.objectContaining({
        credentialId: "ABT-XX-23456",
        title: "not-a-certificate-type",
      }),
    );
  });
});
