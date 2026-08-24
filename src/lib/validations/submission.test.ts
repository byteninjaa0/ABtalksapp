import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    submission: { findFirst, findMany: vi.fn() },
  },
}));

import {
  checkClaudeCommitDuplicate,
  getGithubUrlType,
} from "@/lib/validations/submission";
import { normalizeGithubUrl } from "@/features/submission/validate-github-url";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getGithubUrlType", () => {
  it("classifies commit vs repo vs invalid URLs", () => {
    expect(
      getGithubUrlType(
        "https://github.com/user/repo/commit/abc1234def",
      ),
    ).toBe("commit");
    expect(getGithubUrlType("https://github.com/user/repo")).toBe("repo");
    expect(getGithubUrlType("https://gitlab.com/user/repo")).toBeNull();
    expect(getGithubUrlType("not-a-url")).toBeNull();
  });
});

describe("normalizeGithubUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeGithubUrl("  https://github.com/a/b/  ")).toBe(
      "https://github.com/a/b",
    );
  });
});

describe("checkClaudeCommitDuplicate", () => {
  it("rejects when the same commit was used on another day", async () => {
    findFirst.mockResolvedValue({ dayNumber: 4 });

    const result = await checkClaudeCommitDuplicate(
      "https://github.com/user/repo/commit/abcdef1/",
      "enr_1",
      5,
    );

    expect(result).toEqual({
      ok: false,
      reason: "duplicate",
      message:
        "This commit URL was already submitted for Day 4. Push a new commit for this day.",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrollmentId: "enr_1",
          githubUrl: "https://github.com/user/repo/commit/abcdef1",
          dayNumber: { not: 5 },
        }),
      }),
    );
  });

  it("allows a commit that is not reused on another day", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      checkClaudeCommitDuplicate(
        "https://github.com/user/repo/commit/abcdef1",
        "enr_1",
        5,
      ),
    ).resolves.toEqual({ ok: true });
  });
});
