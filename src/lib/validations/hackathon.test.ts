import { describe, expect, it } from "vitest";
import {
  hackathonSubmissionSchema,
  teamCodeSchema,
} from "@/lib/validations/hackathon";

describe("teamCodeSchema", () => {
  it("normalizes to uppercase 6-char alphanumeric codes", () => {
    expect(teamCodeSchema.parse(" ab12cd ")).toBe("AB12CD");
  });

  it("rejects wrong length or symbols", () => {
    expect(teamCodeSchema.safeParse("ABC").success).toBe(false);
    expect(teamCodeSchema.safeParse("ABC-12").success).toBe(false);
  });
});

describe("hackathonSubmissionSchema", () => {
  const valid = {
    problemId: "HACKPS2608001",
    repoUrl: "https://github.com/abtalks/demo-project",
    liveUrl: "",
    aiLogUrl: "",
  };

  it("accepts a public GitHub repo URL and empty optional URLs", () => {
    const parsed = hackathonSubmissionSchema.parse(valid);
    expect(parsed.repoUrl).toBe(valid.repoUrl);
    expect(parsed.liveUrl).toBe("");
    expect(parsed.aiLogUrl).toBe("");
  });

  it("allows a trailing slash on the repo URL", () => {
    const parsed = hackathonSubmissionSchema.parse({
      ...valid,
      repoUrl: "https://github.com/abtalks/demo-project/",
    });
    expect(parsed.repoUrl).toBe("https://github.com/abtalks/demo-project/");
  });

  it("rejects non-GitHub or nested repo paths", () => {
    expect(
      hackathonSubmissionSchema.safeParse({
        ...valid,
        repoUrl: "https://gitlab.com/abtalks/demo",
      }).success,
    ).toBe(false);
    expect(
      hackathonSubmissionSchema.safeParse({
        ...valid,
        repoUrl: "https://github.com/abtalks/demo/tree/main",
      }).success,
    ).toBe(false);
  });

  it("validates optional live/ai log URLs when provided", () => {
    expect(
      hackathonSubmissionSchema.safeParse({
        ...valid,
        liveUrl: "https://demo.example.com",
        aiLogUrl: "https://docs.google.com/document/d/abc",
      }).success,
    ).toBe(true);

    expect(
      hackathonSubmissionSchema.safeParse({
        ...valid,
        liveUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("requires a problemId", () => {
    expect(
      hackathonSubmissionSchema.safeParse({
        ...valid,
        problemId: "",
      }).success,
    ).toBe(false);
  });
});
