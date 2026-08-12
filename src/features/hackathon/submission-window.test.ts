import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isHackathonPreviewEnabled: vi.fn(() => false),
}));

vi.mock("@/components/hackathon/hackathon-config", () => ({
  HACKATHON: {
    kickoffUtc: "2026-08-07T14:30:00Z",
    deadlineUtc: "2026-08-09T15:15:00Z",
  },
}));

import { isHackathonPreviewEnabled } from "@/lib/feature-flags";
import { getSubmissionWindow } from "@/features/hackathon/submission-window";

const kickoffMs = Date.parse("2026-08-07T14:30:00Z");
const deadlineMs = Date.parse("2026-08-09T15:15:00Z");

afterEach(() => {
  vi.mocked(isHackathonPreviewEnabled).mockReturnValue(false);
});

describe("getSubmissionWindow", () => {
  it("is locked before kickoff without preview", () => {
    expect(getSubmissionWindow(kickoffMs - 1)).toEqual({
      unlocked: false,
      closed: false,
      editable: false,
      previewing: false,
    });
  });

  it("unlocks at kickoff and stays editable until the deadline", () => {
    expect(getSubmissionWindow(kickoffMs)).toEqual({
      unlocked: true,
      closed: false,
      editable: true,
      previewing: false,
    });
    expect(getSubmissionWindow(deadlineMs - 1)).toMatchObject({
      unlocked: true,
      closed: false,
      editable: true,
    });
  });

  it("closes at the deadline (no longer editable)", () => {
    expect(getSubmissionWindow(deadlineMs)).toEqual({
      unlocked: true,
      closed: true,
      editable: false,
      previewing: false,
    });
  });

  it("preview unlocks early but does not bypass the deadline", () => {
    vi.mocked(isHackathonPreviewEnabled).mockReturnValue(true);
    expect(getSubmissionWindow(kickoffMs - 60_000)).toEqual({
      unlocked: true,
      closed: false,
      editable: true,
      previewing: true,
    });
    expect(getSubmissionWindow(deadlineMs)).toEqual({
      unlocked: true,
      closed: true,
      editable: false,
      previewing: false,
    });
  });
});
