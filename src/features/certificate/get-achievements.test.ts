import { CertificateStatus, CertificateType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const ensureClaudeCertificate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: { findMany },
  },
}));

vi.mock("@/lib/date-utils", () => ({
  formatDateIST: vi.fn(() => "09 Aug 2026"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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
  it("maps hackathon certs to Participated + team/brief stats", async () => {
    findMany.mockResolvedValue([
      {
        id: "row_hk",
        certificateId: "ABT-HK-23456",
        type: CertificateType.HACKATHON,
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-09T12:00:00Z"),
        metadata: { teamName: "Team Ada", problemTitle: "Brief A" },
      },
    ]);

    await expect(getAchievements("user_1")).resolves.toEqual([
      {
        key: "row_hk",
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
  });

  it("falls back solo/empty brief and marks revoked", async () => {
    findMany.mockResolvedValue([
      {
        id: "row_revoked",
        certificateId: "ABT-HK-ABCDE",
        type: CertificateType.HACKATHON,
        status: CertificateStatus.REVOKED,
        issuedAt: new Date("2026-08-09T12:00:00Z"),
        metadata: {},
      },
    ]);

    const views = await getAchievements("user_1");
    expect(views[0]).toMatchObject({
      statusLabel: "Participated",
      status: "REVOKED",
      stats: [
        { label: "Team", value: "Solo entry" },
        { label: "Brief", value: "—" },
      ],
    });
  });

  it("maps placement awards to Winner/Top 5 labels and Placement stat", async () => {
    findMany.mockResolvedValue([
      {
        id: "row_win",
        certificateId: "ABT-HK-WINNR",
        type: CertificateType.HACKATHON,
        status: CertificateStatus.ISSUED,
        issuedAt: new Date("2026-08-13T18:30:00Z"),
        metadata: {
          teamName: "Team Ada",
          problemTitle: "Brief A",
          hackathonVariant: "winner",
        },
      },
      {
        id: "row_top5",
        certificateId: "ABT-HK-TOP5X",
        type: CertificateType.HACKATHON,
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
    findMany.mockResolvedValue([
      {
        id: "row_cc",
        certificateId: "ABT-CC-23456",
        type: CertificateType.CLAUDE_CHALLENGE,
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
});
