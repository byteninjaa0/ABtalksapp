import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { parseHackathonMasterCohort } from "@/features/hackathon/get-master-students";

describe("parseHackathonMasterCohort", () => {
  it("accepts old/new and defaults everything else to all", () => {
    expect(parseHackathonMasterCohort("old")).toBe("old");
    expect(parseHackathonMasterCohort("new")).toBe("new");
    expect(parseHackathonMasterCohort("all")).toBe("all");
    expect(parseHackathonMasterCohort(undefined)).toBe("all");
    expect(parseHackathonMasterCohort("weird")).toBe("all");
  });
});
