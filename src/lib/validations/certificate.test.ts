import { describe, expect, it } from "vitest";
import { certificateIdSchema } from "@/lib/validations/certificate";

describe("certificateIdSchema", () => {
  it("accepts Claude and hackathon IDs (case-insensitive, trimmed)", () => {
    expect(certificateIdSchema.parse("ABT-CC-23456")).toBe("ABT-CC-23456");
    expect(certificateIdSchema.parse("  abt-hk-abcde  ")).toBe("ABT-HK-ABCDE");
  });

  it("rejects ambiguous Crockford characters and wrong shape", () => {
    expect(certificateIdSchema.safeParse("ABT-HK-01ILO").success).toBe(false);
    expect(certificateIdSchema.safeParse("ABT-CC-2345").success).toBe(false);
    expect(certificateIdSchema.safeParse("ABT-H-ABCDE").success).toBe(false);
    expect(certificateIdSchema.safeParse("").success).toBe(false);
  });
});
