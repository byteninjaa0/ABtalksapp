import { describe, expect, it } from "vitest";
import { matchQuestion } from "@/lib/chatbot-matcher";

describe("matchQuestion", () => {
  it("matches quick-question phrasing with confidence 1", () => {
    const result = matchQuestion("Is ABTalks free for students?");
    expect(result).toEqual({
      answer:
        "Yes! Community and every flagship program are free for participants.",
      confidence: 1.0,
    });
  });

  it("is case-insensitive and trims whitespace", () => {
    const result = matchQuestion("  WHAT IS THE CONTACT EMAIL  ");
    expect(result?.answer).toContain("team@abtalks.in");
    expect(result?.confidence).toBe(1.0);
  });

  it("maps numeric category selection to a guided reply", () => {
    const result = matchQuestion("5");
    expect(result).toEqual({
      answer:
        "You selected Claude Challenge. I can answer any questions you have about this topic!",
      confidence: 1.0,
    });
  });

  it("returns null for unknown free-text that is not a category number", () => {
    expect(matchQuestion("how do I reset my password?")).toBeNull();
    expect(matchQuestion("99")).toBeNull();
    expect(matchQuestion("")).toBeNull();
  });
});
