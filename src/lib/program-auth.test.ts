import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    programMember: { findMany },
    programCohort: { findUnique },
    recruiterProfile: { findUnique },
  },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import {
  generateProgramJoinCode,
  getCohortByJoinCode,
  normalizeJoinCode,
  resolveProgramMemberForUser,
} from "@/lib/program-auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeJoinCode", () => {
  it("trims, uppercases, and strips non-alphanumerics", () => {
    expect(normalizeJoinCode("  ab-cd_12  ")).toBe("ABCD12");
  });
});

describe("generateProgramJoinCode", () => {
  it("returns an 8-char code from the unambiguous alphabet", () => {
    const code = generateProgramJoinCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });
});

describe("getCohortByJoinCode", () => {
  it("returns null for codes shorter than 4 after normalization", async () => {
    await expect(getCohortByJoinCode("ab!")).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("resolveProgramMemberForUser", () => {
  const cohort = {
    id: "c1",
    name: "Cohort",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01"),
    endsAt: null,
    capacity: 100,
    resultsPublishedAt: null,
    joinCode: "ABCD1234",
  };

  it("prefers ENROLLED over COMPLETED, then newest enrolledAt", async () => {
    findMany.mockResolvedValue([
      {
        id: "m-old-enrolled",
        status: "ENROLLED",
        fullName: "Ada",
        highestUnlockedDay: 3,
        cohortId: "c1",
        enrolledAt: new Date("2026-01-01"),
        cohort,
      },
      {
        id: "m-completed",
        status: "COMPLETED",
        fullName: "Ada",
        highestUnlockedDay: 31,
        cohortId: "c1",
        enrolledAt: new Date("2026-02-01"),
        cohort,
      },
      {
        id: "m-new-enrolled",
        status: "ENROLLED",
        fullName: "Ada",
        highestUnlockedDay: 5,
        cohortId: "c1",
        enrolledAt: new Date("2026-03-01"),
        cohort,
      },
    ]);

    const resolved = await resolveProgramMemberForUser("user_1");
    expect(resolved?.member.id).toBe("m-new-enrolled");
    expect(resolved?.member.status).toBe("ENROLLED");
  });

  it("returns null when the user has no qualifying memberships", async () => {
    findMany.mockResolvedValue([]);
    await expect(resolveProgramMemberForUser("user_1")).resolves.toBeNull();
  });
});
