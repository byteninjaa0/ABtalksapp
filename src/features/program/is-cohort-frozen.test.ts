import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    programMember: { count },
  },
}));

import {
  PROGRAM_HOLD_OPEN_COHORT_NAME,
  PROGRAM_TOTAL_DAYS,
} from "@/features/program/constants";
import {
  isCohortFrozen,
  isCohortPastEndsAt,
} from "@/features/program/progression";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isCohortPastEndsAt", () => {
  it("freezes ordinary cohorts once endsAt has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    expect(
      isCohortPastEndsAt({ endsAt: new Date("2026-08-20T00:00:00.000Z") }),
    ).toBe(true);
    expect(
      isCohortPastEndsAt({ endsAt: new Date("2026-08-21T00:00:00.000Z") }),
    ).toBe(false);
  });
});

describe("isCohortFrozen", () => {
  const usCohort = {
    id: "cohort-us",
    name: PROGRAM_HOLD_OPEN_COHORT_NAME,
    status: "ACTIVE" as const,
    endsAt: new Date("2026-08-19T23:50:00.000Z"),
  };

  it("keeps the hold-open US cohort unfrozen while any enrolled member lacks Day 31", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    count.mockResolvedValue(3);

    await expect(isCohortFrozen(usCohort)).resolves.toBe(false);
    expect(count).toHaveBeenCalledWith({
      where: {
        cohortId: "cohort-us",
        status: { in: ["ENROLLED", "COMPLETED"] },
        missionSubmissions: {
          none: { dayNumber: PROGRAM_TOTAL_DAYS, passed: true },
        },
      },
    });
  });

  it("freezes the hold-open US cohort only when every enrolled member has passed Day 31", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    count.mockResolvedValue(0);

    await expect(isCohortFrozen(usCohort)).resolves.toBe(true);
    await expect(
      isCohortFrozen({ ...usCohort, status: "ENROLLING" }),
    ).resolves.toBe(true);
  });

  it("does not apply hold-open to other cohorts or archived US status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));

    await expect(
      isCohortFrozen({
        id: "cohort-india",
        name: "AI Cohort India Aug 26",
        status: "ACTIVE",
        endsAt: new Date("2026-08-19T23:50:00.000Z"),
      }),
    ).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();

    await expect(
      isCohortFrozen({ ...usCohort, status: "ARCHIVED" }),
    ).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });
});
