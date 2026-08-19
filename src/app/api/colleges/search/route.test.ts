import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const searchColleges = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/features/college/search-colleges", () => ({
  searchColleges,
}));

import { GET } from "@/app/api/colleges/search/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function request(q?: string) {
  const url =
    q === undefined
      ? "http://localhost/api/colleges/search"
      : `http://localhost/api/colleges/search?q=${encodeURIComponent(q)}`;
  return new Request(url);
}

describe("GET /api/colleges/search", () => {
  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(request("iit"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      message: "Not authenticated",
    });
    expect(searchColleges).not.toHaveBeenCalled();
  });

  it("returns 400 when the query exceeds max length", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET(request("x".repeat(101)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(searchColleges).not.toHaveBeenCalled();
  });

  it("returns search results with private no-store cache headers", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    searchColleges.mockResolvedValue([
      {
        id: "c1",
        name: "IIT Bombay",
        state: "Maharashtra",
        district: "Mumbai",
      },
    ]);

    const res = await GET(request("  iit bombay  "));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(res.json()).resolves.toEqual({
      ok: true,
      data: [
        {
          id: "c1",
          name: "IIT Bombay",
          state: "Maharashtra",
          district: "Mumbai",
        },
      ],
    });
    expect(searchColleges).toHaveBeenCalledWith("iit bombay");
  });
});
