import { SubmissionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeStreakStats } from "@/features/submission/streak-utils";

const findMany = vi.fn();

function tx() {
  return {
    submission: { findMany },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeStreakStats", () => {
  it("clamps endDay to 1..60 and queries ON_TIME days only", async () => {
    findMany.mockResolvedValue([]);

    await computeStreakStats(tx() as never, {
      enrollmentId: "enr1",
      endDay: 99,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        enrollmentId: "enr1",
        dayNumber: { gte: 1, lte: 60 },
        status: SubmissionStatus.ON_TIME,
      },
      select: { dayNumber: true },
    });
  });

  it("uses yesterday as streak anchor when today is missing (grace)", async () => {
    // endDay=5 not submitted; consecutive 3-4 on time → current=2
    findMany.mockResolvedValue([{ dayNumber: 3 }, { dayNumber: 4 }]);

    await expect(
      computeStreakStats(tx() as never, { enrollmentId: "enr1", endDay: 5 }),
    ).resolves.toEqual({ currentStreak: 2, longestStreak: 2 });
  });

  it("anchors on today when today is on time", async () => {
    findMany.mockResolvedValue([
      { dayNumber: 1 },
      { dayNumber: 2 },
      { dayNumber: 3 },
    ]);

    await expect(
      computeStreakStats(tx() as never, { enrollmentId: "enr1", endDay: 3 }),
    ).resolves.toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it("breaks current streak on a gap but preserves longest", async () => {
    // days 1-2 and 4-5 on time; endDay=5 submitted → current=2, longest=2
    findMany.mockResolvedValue([
      { dayNumber: 1 },
      { dayNumber: 2 },
      { dayNumber: 4 },
      { dayNumber: 5 },
    ]);

    await expect(
      computeStreakStats(tx() as never, { enrollmentId: "enr1", endDay: 5 }),
    ).resolves.toEqual({ currentStreak: 2, longestStreak: 2 });
  });

  it("tracks longest across an earlier longer run", async () => {
    // 1-4 on time, gap at 5, 6-7 on time; endDay=7 → current=2, longest=4
    findMany.mockResolvedValue([
      { dayNumber: 1 },
      { dayNumber: 2 },
      { dayNumber: 3 },
      { dayNumber: 4 },
      { dayNumber: 6 },
      { dayNumber: 7 },
    ]);

    await expect(
      computeStreakStats(tx() as never, { enrollmentId: "enr1", endDay: 7 }),
    ).resolves.toEqual({ currentStreak: 2, longestStreak: 4 });
  });

  it("returns zeros when no on-time submissions exist", async () => {
    findMany.mockResolvedValue([]);

    await expect(
      computeStreakStats(tx() as never, { enrollmentId: "enr1", endDay: 4 }),
    ).resolves.toEqual({ currentStreak: 0, longestStreak: 0 });
  });
});
