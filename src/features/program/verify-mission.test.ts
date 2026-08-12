import { describe, expect, it } from "vitest";
import {
  encodeRepoContentsPath,
  normalizeOutput,
  parseRepo,
} from "@/features/program/verify-mission";

describe("parseRepo", () => {
  it("parses owner/repo and strips a trailing .git", () => {
    expect(parseRepo("https://github.com/abtalks/program-starter")).toEqual({
      owner: "abtalks",
      repo: "program-starter",
    });
    expect(parseRepo("https://github.com/abtalks/program-starter.git")).toEqual(
      {
        owner: "abtalks",
        repo: "program-starter",
      },
    );
  });

  it("rejects non-https GitHub URLs and path extras", () => {
    expect(parseRepo("http://github.com/a/b")).toBeNull();
    expect(parseRepo("https://gitlab.com/a/b")).toBeNull();
    expect(parseRepo("https://github.com/a/b/tree/main")).toBeNull();
    expect(parseRepo("not-a-url")).toBeNull();
  });
});

describe("encodeRepoContentsPath", () => {
  it("encodes each segment but keeps path separators", () => {
    expect(encodeRepoContentsPath("src/my file.ts")).toBe("src/my%20file.ts");
    expect(encodeRepoContentsPath("a/b/c")).toBe("a/b/c");
  });
});

describe("normalizeOutput", () => {
  it("trims outer whitespace and trailing spaces per line", () => {
    expect(normalizeOutput("  hello  \nworld   \n")).toBe("hello\nworld");
  });
});
