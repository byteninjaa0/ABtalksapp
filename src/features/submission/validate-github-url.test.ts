import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    submission: { findMany },
  },
}));

import { validateGithubUrl } from "@/features/submission/validate-github-url";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("validateGithubUrl", () => {
  it("rejects non-GitHub URLs before hitting the database", async () => {
    await expect(
      validateGithubUrl("https://gitlab.com/a/b", "user_1"),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_format",
      message: "Must be a valid GitHub repo URL",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a URL already used outside the allowSlot", async () => {
    findMany.mockResolvedValue([
      { userId: "other", enrollmentId: "enr_other", dayNumber: 1 },
    ]);

    await expect(
      validateGithubUrl("https://github.com/a/b/", "user_1", {
        enrollmentId: "enr_1",
        dayNumber: 2,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "duplicate",
      message: "This URL has been submitted by another student",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { githubUrl: "https://github.com/a/b" },
      }),
    );
  });

  it("allows the same URL when allowSlot matches the only existing row", async () => {
    findMany.mockResolvedValue([
      { userId: "user_1", enrollmentId: "enr_1", dayNumber: 2 },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200 }),
    );

    await expect(
      validateGithubUrl("https://github.com/a/b", "user_1", {
        enrollmentId: "enr_1",
        dayNumber: 2,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects unreachable URLs when HEAD fails", async () => {
    findMany.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404 }),
    );

    await expect(
      validateGithubUrl("https://github.com/a/missing", "user_1"),
    ).resolves.toEqual({
      ok: false,
      reason: "unreachable",
      message: "URL did not return a valid response",
    });
  });

  it("rejects when fetch throws (timeout/network)", async () => {
    findMany.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("timeout")),
    );

    await expect(
      validateGithubUrl("https://github.com/a/b", "user_1"),
    ).resolves.toEqual({
      ok: false,
      reason: "unreachable",
      message: "URL did not return a valid response",
    });
  });
});
