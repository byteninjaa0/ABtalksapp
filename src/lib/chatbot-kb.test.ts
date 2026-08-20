import { describe, expect, it } from "vitest";
import {
  CHAT_FALLBACK_MESSAGE,
  buildProcessedKb,
  chunkMarkdown,
  retrieveTopChunks,
  scoreQuery,
  tokenize,
} from "@/lib/chatbot-kb";

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops short tokens", () => {
    expect(tokenize("Hello, AI! 60 days of GenAI")).toEqual([
      "hello",
      "days",
      "genai",
    ]);
  });
});

describe("chunkMarkdown", () => {
  it("splits on ##/### headings and keeps the header with body text", () => {
    const md = `# Title

## Overview
This overview section has enough characters to pass the length gate.

### Details
More detail content that is definitely longer than twenty chars.
`;
    const chunks = chunkMarkdown(md, "faq.md");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.source).toBe("faq.md");
    expect(chunks[0]?.text).toContain("## Overview");
    expect(chunks.some((c) => c.text.includes("### Details"))).toBe(true);
  });

  it("drops tiny fragments under the length threshold", () => {
    const md = `## Tiny
hi

## Real section
This section contains enough text to become a retrieval chunk.
`;
    const chunks = chunkMarkdown(md, "tiny.md");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("Real section");
  });
});

describe("BM25 retrieval", () => {
  const docs = chunkMarkdown(
    `## Claude Challenge
The Claude Challenge is a 60-day GenAI challenge. Participants post daily updates with tags.

## Contact
Email the team at team@abtalks.in for support questions about ABTalks programs.
`,
    "kb.md",
  );
  const { chunks, idf } = buildProcessedKb(docs);

  it("scores matching chunks above unrelated ones", () => {
    const query = tokenize("claude challenge genai tags");
    const claude = chunks.find((c) => c.text.includes("Claude Challenge"))!;
    const contact = chunks.find((c) => c.text.includes("Contact"))!;
    expect(scoreQuery(query, claude, idf)).toBeGreaterThan(
      scoreQuery(query, contact, idf),
    );
  });

  it("returns top chunks for an in-KB query and nothing for noise", () => {
    const hits = retrieveTopChunks(
      "How does the Claude Challenge work?",
      chunks,
      idf,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.text).toMatch(/Claude Challenge/i);

    const miss = retrieveTopChunks("zzzz qqqq xxxx", chunks, idf);
    expect(miss).toEqual([]);
  });

  it("exposes the stable fallback copy used when retrieval misses", () => {
    expect(CHAT_FALLBACK_MESSAGE).toContain("team@abtalks.in");
  });
});
