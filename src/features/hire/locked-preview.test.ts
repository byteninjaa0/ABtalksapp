import { describe, expect, it } from "vitest";
import {
  buildLockedPreviewCards,
  isLockedPreview,
} from "@/features/hire/locked-preview";
import type { JobSpec } from "@/lib/validations/hire";

const baseSpec: JobSpec = {
  title: "Backend engineer",
  mustHaveStack: ["Node", "Postgres"],
  minExperience: 2,
};

describe("buildLockedPreviewCards", () => {
  it("returns no cards without a title or stack", () => {
    expect(buildLockedPreviewCards({} as JobSpec)).toEqual([]);
    expect(buildLockedPreviewCards({ title: "   " } as JobSpec)).toEqual([]);
  });

  it("builds deterministic SAMPLE: refs that stay off the whitelist", () => {
    const a = buildLockedPreviewCards(baseSpec);
    const b = buildLockedPreviewCards(baseSpec);
    expect(a).toHaveLength(3);
    expect(b).toEqual(a);
    for (const card of a) {
      expect(card.candidateRef.startsWith("SAMPLE:")).toBe(true);
      expect(card.locked).toBe(true);
      expect(isLockedPreview(card)).toBe(true);
      expect(card.programMemberId).toBeNull();
      expect(card.preview.email).toContain("@example.com");
    }
  });

  it("caps count and stays stable when count is truncated", () => {
    expect(buildLockedPreviewCards(baseSpec, 1)).toHaveLength(1);
    expect(buildLockedPreviewCards(baseSpec, 99)).toHaveLength(3);
    expect(buildLockedPreviewCards(baseSpec, 0)).toEqual([]);
  });
});
