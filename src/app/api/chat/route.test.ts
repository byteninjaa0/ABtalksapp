import { describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(),
  },
}));

import { POST } from "@/app/api/chat/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat validation", () => {
  it("returns 400 when messages are missing or empty", async () => {
    const missing = await POST(jsonRequest({}));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: "Missing messages" });

    const empty = await POST(jsonRequest({ messages: [] }));
    expect(empty.status).toBe(400);
  });

  it("returns 400 when the last message is not from the user", async () => {
    const res = await POST(
      jsonRequest({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Last message must be from user",
    });
  });
});
