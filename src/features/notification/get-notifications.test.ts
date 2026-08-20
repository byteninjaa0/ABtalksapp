import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  notificationFindMany,
  programCohortFindMany,
  notificationReadFindMany,
  enrollmentFindFirst,
  programMemberFindMany,
  hackathonParticipantFindFirst,
  workshopRegistrationFindMany,
  isProgramEnabled,
} = vi.hoisted(() => ({
  notificationFindMany: vi.fn(),
  programCohortFindMany: vi.fn(),
  notificationReadFindMany: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  programMemberFindMany: vi.fn(),
  hackathonParticipantFindFirst: vi.fn(),
  workshopRegistrationFindMany: vi.fn(),
  isProgramEnabled: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { findMany: notificationFindMany },
    programCohort: { findMany: programCohortFindMany },
    notificationRead: { findMany: notificationReadFindMany },
    enrollment: { findFirst: enrollmentFindFirst },
    programMember: { findMany: programMemberFindMany },
    hackathonParticipant: { findFirst: hackathonParticipantFindFirst },
    workshopRegistration: { findMany: workshopRegistrationFindMany },
  },
}));

vi.mock("@/lib/feature-flags", () => ({ isProgramEnabled }));

vi.mock("@/components/hackathon/hackathon-config", () => ({
  HACKATHON: {
    registrationOpen: false,
    kickoffUtc: "2099-01-01T00:00:00.000Z",
    deadlineUtc: "2099-01-02T00:00:00.000Z",
    registrationClosesUtc: "2099-01-01T00:00:00.000Z",
    kickoffLabel: "kickoff",
    deadlineLabel: "deadline",
    registrationClosesLabel: "closes",
  },
}));

vi.mock("@/components/workshop/events-data", () => ({
  EVENTS: [],
}));

import { getNotificationsForUser } from "@/features/notification/get-notifications";

function stubEmptyMembership() {
  enrollmentFindFirst.mockResolvedValue(null);
  programMemberFindMany.mockResolvedValue([]);
  hackathonParticipantFindFirst.mockResolvedValue(null);
  workshopRegistrationFindMany.mockResolvedValue([]);
  notificationReadFindMany.mockResolvedValue([]);
  programCohortFindMany.mockResolvedValue([]);
  isProgramEnabled.mockReturnValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubEmptyMembership();
});

describe("getNotificationsForUser", () => {
  it("filters admin announcements by audience membership", async () => {
    notificationFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "Everyone",
        body: null,
        href: "/dashboard",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-20T10:00:00.000Z"),
      },
      {
        id: "a2",
        title: "Challenge only",
        body: null,
        href: "/challenge",
        category: "CHALLENGE",
        audience: "CHALLENGE",
        publishedAt: new Date("2026-08-20T09:00:00.000Z"),
      },
      {
        id: "a3",
        title: "Hackathon only",
        body: null,
        href: "/hackathon",
        category: "HACKATHON",
        audience: "HACKATHON",
        publishedAt: new Date("2026-08-20T08:00:00.000Z"),
      },
    ]);

    const none = await getNotificationsForUser("u1");
    expect(none.items.map((i) => i.key)).toEqual(["admin:a1"]);
    expect(none.unreadCount).toBe(1);

    enrollmentFindFirst.mockResolvedValue({ id: "enr-1" });
    const challenge = await getNotificationsForUser("u1");
    expect(challenge.items.map((i) => i.key)).toEqual([
      "admin:a1",
      "admin:a2",
      "campus-ambassador:onboarding",
    ]);
  });

  it("merges sources, applies read state, and caps the feed at 5", async () => {
    enrollmentFindFirst.mockResolvedValue({ id: "enr-1" });
    notificationFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Newest admin",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-20T12:00:00.000Z"),
      },
      {
        id: "n2",
        title: "Older admin",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-19T12:00:00.000Z"),
      },
      {
        id: "n3",
        title: "Even older",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-18T12:00:00.000Z"),
      },
      {
        id: "n4",
        title: "Ancient",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-17T12:00:00.000Z"),
      },
      {
        id: "n5",
        title: "Dusty",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-16T12:00:00.000Z"),
      },
      {
        id: "n6",
        title: "Should drop",
        body: null,
        href: "/",
        category: "GENERAL",
        audience: "ALL",
        publishedAt: new Date("2026-08-15T12:00:00.000Z"),
      },
    ]);
    notificationReadFindMany.mockResolvedValue([
      { notificationKey: "admin:n1" },
      { notificationKey: "campus-ambassador:onboarding" },
    ]);

    const feed = await getNotificationsForUser("u1");
    expect(feed.items).toHaveLength(5);
    // campus-ambassador publishedAt is 2026-08-20T00:00Z — between n1 and n2.
    expect(feed.items.map((i) => i.key)).toEqual([
      "admin:n1",
      "campus-ambassador:onboarding",
      "admin:n2",
      "admin:n3",
      "admin:n4",
    ]);
    expect(feed.items[0]?.isRead).toBe(true);
    expect(feed.items[1]?.isRead).toBe(true);
    expect(feed.items[2]?.isRead).toBe(false);
    // n1 + campus ambassador are read → 3 unread in the capped feed.
    expect(feed.unreadCount).toBe(3);
    expect(feed.items.map((i) => i.key)).not.toContain("admin:n5");
    expect(feed.items.map((i) => i.key)).not.toContain("admin:n6");
  });

  it("includes the campus ambassador notice when challenge-enrolled and feed has room", async () => {
    enrollmentFindFirst.mockResolvedValue({ id: "enr-1" });
    notificationFindMany.mockResolvedValue([]);

    const feed = await getNotificationsForUser("u1");
    expect(feed.items.map((i) => i.key)).toEqual([
      "campus-ambassador:onboarding",
    ]);
    expect(feed.unreadCount).toBe(1);
  });
});
