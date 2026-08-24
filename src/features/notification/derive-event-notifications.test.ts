import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/hackathon/hackathon-config", () => ({
  HACKATHON: {
    registrationOpen: true,
    kickoffUtc: "2026-08-07T14:30:00.000Z",
    deadlineUtc: "2026-08-09T15:15:00.000Z",
    registrationClosesUtc: "2026-08-07T12:30:00.000Z",
    kickoffLabel: "Friday, 7 Aug · 8:00 PM IST",
    deadlineLabel: "Sunday, 9 Aug · 8:45 PM IST",
    registrationClosesLabel: "Registration closes Friday, 7 Aug · 6:00 PM IST",
  },
}));

vi.mock("@/components/workshop/events-data", () => ({
  EVENTS: [
    {
      id: "workshop-open",
      date: "2026-08-21",
      time: "6:00 PM IST",
      title: "Open Workshop",
      location: "Live · YouTube",
      register: true,
      registrationOpen: true,
    },
    {
      id: "workshop-closed",
      date: "2026-08-22",
      time: "6:00 PM IST",
      title: "Closed Workshop",
      location: "Live · Zoom",
      register: true,
      registrationOpen: false,
    },
  ],
}));

import { deriveEventNotifications } from "@/features/notification/derive-event-notifications";

const emptyMembership = {
  registeredWorkshopEventIds: new Set<string>(),
  isHackathonRegistered: false,
  joinedCohortIds: new Set<string>(),
  hasChallengeEnrollment: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deriveEventNotifications", () => {
  it("emits workshop reminders only inside the 7-day IST lead window", () => {
    // 14 Aug IST = 7 days before 21 Aug — window opens.
    const opens = deriveEventNotifications({
      now: new Date("2026-08-13T18:30:00.000Z"),
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(opens.map((n) => n.key)).toContain("workshop:workshop-open");
    expect(opens.map((n) => n.key)).not.toContain("workshop:workshop-closed");

    // 13 Aug IST — still outside the lead window.
    const tooEarly = deriveEventNotifications({
      now: new Date("2026-08-12T18:30:00.000Z"),
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(tooEarly.map((n) => n.key)).not.toContain("workshop:workshop-open");

    // Day after the event — expired.
    const after = deriveEventNotifications({
      now: new Date("2026-08-21T18:30:00.000Z"),
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(after.map((n) => n.key)).not.toContain("workshop:workshop-open");
  });

  it("suppresses workshops the user already registered for", () => {
    const items = deriveEventNotifications({
      now: new Date("2026-08-18T12:00:00.000Z"),
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      registeredWorkshopEventIds: new Set(["workshop-open"]),
    });
    expect(items.map((n) => n.key)).not.toContain("workshop:workshop-open");
  });

  it("shows registration only to non-participants while registration is open", () => {
    const beforeClose = new Date("2026-08-07T12:00:00.000Z");
    const open = deriveEventNotifications({
      now: beforeClose,
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(open.map((n) => n.key)).toContain("hackathon:registration");
    expect(open.map((n) => n.key)).not.toContain("hackathon:kickoff");

    const registered = deriveEventNotifications({
      now: beforeClose,
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      isHackathonRegistered: true,
    });
    expect(registered.map((n) => n.key)).not.toContain("hackathon:registration");
  });

  it("shows kickoff and deadline reminders only to participants inside their windows", () => {
    const kickoffWindow = deriveEventNotifications({
      now: new Date("2026-08-06T14:30:00.000Z"), // 24h before kickoff
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      isHackathonRegistered: true,
    });
    expect(kickoffWindow.map((n) => n.key)).toEqual(["hackathon:kickoff"]);

    const deadlineWindow = deriveEventNotifications({
      now: new Date("2026-08-09T10:00:00.000Z"), // ~5h before deadline
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      isHackathonRegistered: true,
    });
    expect(deadlineWindow.map((n) => n.key)).toEqual(["hackathon:deadline"]);

    const afterDeadline = deriveEventNotifications({
      now: new Date("2026-08-09T16:00:00.000Z"),
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      isHackathonRegistered: true,
    });
    expect(afterDeadline.map((n) => n.key)).toEqual([]);
  });

  it("advertises enrolling cohorts only when program is enabled and user has not joined", () => {
    const cohort = {
      id: "cohort-1",
      name: "Fall Cohort",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const now = new Date("2026-08-18T12:00:00.000Z");

    const disabled = deriveEventNotifications({
      now,
      enrollingCohorts: [cohort],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(disabled.map((n) => n.key)).not.toContain("cohort:cohort-1:enrolling");

    const open = deriveEventNotifications({
      now,
      enrollingCohorts: [cohort],
      programEnabled: true,
      ...emptyMembership,
    });
    expect(open.map((n) => n.key)).toContain("cohort:cohort-1:enrolling");
    expect(open.find((n) => n.key === "cohort:cohort-1:enrolling")?.href).toBe(
      "/program",
    );

    const joined = deriveEventNotifications({
      now,
      enrollingCohorts: [cohort],
      programEnabled: true,
      ...emptyMembership,
      joinedCohortIds: new Set(["cohort-1"]),
    });
    expect(joined.map((n) => n.key)).not.toContain("cohort:cohort-1:enrolling");

    const started = deriveEventNotifications({
      now: new Date("2026-09-02T00:00:00.000Z"),
      enrollingCohorts: [cohort],
      programEnabled: true,
      ...emptyMembership,
    });
    expect(started.map((n) => n.key)).not.toContain("cohort:cohort-1:enrolling");
  });

  it("emits Campus Ambassador onboarding only for challenge-enrolled users", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");

    const without = deriveEventNotifications({
      now,
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
    });
    expect(without.map((n) => n.key)).not.toContain(
      "campus-ambassador:onboarding",
    );

    const withEnrollment = deriveEventNotifications({
      now,
      enrollingCohorts: [],
      programEnabled: false,
      ...emptyMembership,
      hasChallengeEnrollment: true,
    });
    const item = withEnrollment.find(
      (n) => n.key === "campus-ambassador:onboarding",
    );
    expect(item).toMatchObject({
      title: "Complete Campus Ambassador onboarding",
      href: "https://abtalksca.netlify.app/",
      category: "CHALLENGE",
      publishedAt: "2026-08-20T00:00:00.000Z",
    });
  });
});
