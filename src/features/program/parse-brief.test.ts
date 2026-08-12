import { describe, expect, it } from "vitest";
import { parseBriefMd } from "@/features/program/parse-brief";

const STRUCTURED = `## Mission: Build the ingest pipeline
Wire the cron to pull commits and store them.

### Your repo layout
\`\`\`
src/
  ingest.ts
\`\`\`

### Build steps
1. Create the Prisma model
2. Add the cron route
3. Verify dry-run mode

### Submit your answers
Answer briefly.
1. Which table stores commits?
2. How do you skip a day?
`;

describe("parseBriefMd", () => {
  it("falls back to full markdown when headings are missing", () => {
    const result = parseBriefMd("Just a freeform brief with no sections.");
    expect(result).toEqual({
      missionTitle: null,
      missionBodyMd: "Just a freeform brief with no sections.",
      repoLayoutMd: null,
      buildSteps: [],
      submitIntroMd: null,
      submitQuestions: [],
    });
  });

  it("parses mission title, build steps, and submit questions", () => {
    const result = parseBriefMd(STRUCTURED);
    expect(result.missionTitle).toBe("Build the ingest pipeline");
    expect(result.missionBodyMd).toContain("Wire the cron");
    expect(result.repoLayoutMd).toContain("ingest.ts");
    expect(result.buildSteps).toEqual([
      "Create the Prisma model",
      "Add the cron route",
      "Verify dry-run mode",
    ]);
    expect(result.submitIntroMd).toBe("Answer briefly.");
    expect(result.submitQuestions).toEqual([
      "Which table stores commits?",
      "How do you skip a day?",
    ]);
  });
});
