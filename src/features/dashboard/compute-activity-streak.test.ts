import { describe, expect, it } from "vitest";
import {
  STREAK_MILESTONES,
  computeActivityStreak,
} from "@/features/dashboard/compute-activity-streak";

function counts(...keys: string[]): Map<string, number> {
  return new Map(keys.map((k) => [k, 1]));
}

describe("computeActivityStreak", () => {
  it("returns empty state with no activity", () => {
    const result = computeActivityStreak(new Map(), "2026-08-25");
    expect(result).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
      todayCompleted: false,
      state: "empty",
      nextMilestone: STREAK_MILESTONES[0],
      daysToMilestone: STREAK_MILESTONES[0],
    });
    expect(result.week).toHaveLength(7);
    expect(result.week[0]?.label).toBe("Mon");
    // Week containing Tue 2026-08-25 starts Mon 2026-08-24.
    expect(result.week[0]?.date).toBe("2026-08-24");
  });

  it("extends current streak through yesterday grace when today is idle", () => {
    // Tue 2026-08-25; Mon+Sun active → grace keeps streak alive
    const result = computeActivityStreak(
      counts("2026-08-24", "2026-08-23"),
      "2026-08-25",
    );
    expect(result.todayCompleted).toBe(false);
    expect(result.currentStreak).toBe(2);
    expect(result.state).toBe("active");
    expect(result.week.find((d) => d.date === "2026-08-25")?.status).toBe(
      "today",
    );
  });

  it("marks broken inside the current week when the run ended mid-week", () => {
    // Week Mon 24–Sun 30. Active Mon only; Tue is today → break on Tue? No:
    // last active Mon 24, break day = Tue 25, but today=Wed 26 with no activity
    // → currentStreak 0, breakDate = Tue 25 which is in-week.
    const result = computeActivityStreak(counts("2026-08-24"), "2026-08-26");
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(1);
    expect(result.state).toBe("broken");
    expect(result.week.find((d) => d.date === "2026-08-25")?.status).toBe(
      "broken",
    );
  });

  it("walks back from today and reports next milestone gap", () => {
    const result = computeActivityStreak(
      counts(
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
        "2026-08-23",
        "2026-08-24",
        "2026-08-25",
      ),
      "2026-08-25",
    );
    expect(result.todayCompleted).toBe(true);
    expect(result.currentStreak).toBe(6);
    expect(result.longestStreak).toBe(6);
    expect(result.nextMilestone).toBe(7);
    expect(result.daysToMilestone).toBe(1);
    expect(result.state).toBe("active");
    // Week strip only covers Mon–Sun of the current week (24–30).
    expect(
      result.week.filter((d) => d.status === "complete").map((d) => d.date),
    ).toEqual(["2026-08-24", "2026-08-25"]);
  });

  it("ignores future-dated activity keys and zero counts", () => {
    const map = new Map<string, number>([
      ["2026-08-24", 2],
      ["2026-08-25", 0],
      ["2026-08-26", 5],
    ]);
    const result = computeActivityStreak(map, "2026-08-25");
    expect(result.totalActiveDays).toBe(1);
    expect(result.currentStreak).toBe(1);
    expect(result.todayCompleted).toBe(false);
  });
});
