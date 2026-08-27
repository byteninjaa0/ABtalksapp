import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRAM_MEMBER_START_DAY } from "@/features/program/constants";
import { bootstrapMemberStartDay } from "@/features/program/bootstrap-start-day";

type MemberRow = {
  id: string;
  highestUnlockedDay: number;
  missionPoints: number;
  cleanPassCount: number;
  conceptPoints: number;
  commitPoints: number;
  projectPoints: number;
  cohort: { startsAt: Date; endsAt: Date };
};

const memberState = vi.hoisted(() => ({
  current: null as MemberRow | null,
}));

const findUniqueMember = vi.hoisted(() =>
  vi.fn(async () => memberState.current),
);
const findManyPassed = vi.hoisted(() => vi.fn());
const createMany = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn());
const updateMember = vi.hoisted(() =>
  vi.fn(async ({ data }: { data: Partial<MemberRow> }) => {
    if (!memberState.current) return {};
    memberState.current = { ...memberState.current, ...data };
    return memberState.current;
  }),
);

function tx() {
  return {
    programMember: {
      findUnique: findUniqueMember,
      update: updateMember,
    },
    programMissionSubmission: {
      findMany: findManyPassed,
      createMany,
      deleteMany,
    },
    programDay: { findMany: vi.fn() },
    programCommitDay: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
  };
}

const cohort = {
  startsAt: new Date("2026-08-09T18:30:00.000Z"),
  endsAt: new Date("2026-09-09T18:29:59.999Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  expect(PROGRAM_MEMBER_START_DAY).toBe(1);
  memberState.current = {
    id: "m1",
    highestUnlockedDay: 4,
    missionPoints: 30,
    cleanPassCount: 3,
    conceptPoints: 0,
    commitPoints: 0,
    projectPoints: 0,
    cohort,
  };
  findManyPassed.mockResolvedValue([
    {
      id: "w1",
      dayNumber: 1,
      payload: { waived: true, reason: "cohort_start_day" },
      pointsAwarded: 10,
    },
    {
      id: "w2",
      dayNumber: 2,
      payload: { waived: true, reason: "cohort_start_day" },
      pointsAwarded: 10,
    },
    {
      id: "w3",
      dayNumber: 3,
      payload: { waived: true, reason: "cohort_start_day" },
      pointsAwarded: 10,
    },
  ]);
  createMany.mockResolvedValue({ count: 0 });
  deleteMany.mockResolvedValue({ count: 3 });
});

describe("bootstrapMemberStartDay (START_DAY=1)", () => {
  it("retracts unused start-day waivers and drops unlock floor to Day 1", async () => {
    await bootstrapMemberStartDay(tx() as never, "m1");

    expect(createMany).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["w1", "w2", "w3"] } },
    });

    expect(updateMember).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: {
        highestUnlockedDay: 1,
        missionPoints: 0,
        cleanPassCount: 0,
      },
    });

    expect(updateMember).toHaveBeenLastCalledWith({
      where: { id: "m1" },
      data: { totalScore: 0 },
    });
    expect(memberState.current?.highestUnlockedDay).toBe(1);
    expect(memberState.current?.missionPoints).toBe(0);
  });

  it("keeps start-day waivers and existing unlock once an earned pass exists", async () => {
    memberState.current = {
      id: "m1",
      highestUnlockedDay: 5,
      missionPoints: 40,
      cleanPassCount: 4,
      conceptPoints: 0,
      commitPoints: 0,
      projectPoints: 0,
      cohort,
    };
    findManyPassed.mockResolvedValue([
      {
        id: "w1",
        dayNumber: 1,
        payload: { waived: true, reason: "cohort_start_day" },
        pointsAwarded: 10,
      },
      {
        id: "e2",
        dayNumber: 2,
        payload: { code: "mission" },
        pointsAwarded: 10,
      },
    ]);

    await bootstrapMemberStartDay(tx() as never, "m1");

    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMember).toHaveBeenCalledTimes(1);
    expect(updateMember).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { totalScore: 40 },
    });
  });

  it("no-ops when the member row is missing", async () => {
    memberState.current = null;
    await bootstrapMemberStartDay(tx() as never, "m1");
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMember).not.toHaveBeenCalled();
  });
});
