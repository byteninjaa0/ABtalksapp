import { describe, expect, it } from "vitest";
import { toWinAnsiSafe } from "@/features/certificate/render-certificate-pdf";

describe("toWinAnsiSafe", () => {
  it("normalizes curly quotes, dashes, and whitespace", () => {
    expect(toWinAnsiSafe("  Ada\u2019s  \u201Cwork\u201D  ")).toBe("Ada's \"work\"");
    expect(toWinAnsiSafe("Jean\u2013Luc")).toBe("Jean-Luc");
  });

  it("strips characters outside WinAnsi and collapses space", () => {
    expect(toWinAnsiSafe("Rahul \u0915\u0941\u092E\u093E\u0930")).toBe("Rahul");
    expect(toWinAnsiSafe("\u0915\u0941\u092E\u093E\u0930")).toBe("");
  });
});
