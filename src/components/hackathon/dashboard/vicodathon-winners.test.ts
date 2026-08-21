import { describe, expect, it } from "vitest";
import {
  VICODATHON_WINNERS,
  type WinnerMember,
  type WinnerPlace,
} from "@/components/hackathon/dashboard/vicodathon-winners";

const PLACE_LABELS: Record<WinnerPlace["place"], string> = {
  1: "1st Place",
  2: "2nd Place",
  3: "3rd Place",
  4: "4th Place",
  5: "5th Place",
};

const ALLOWED_ROLES = new Set<WinnerMember["role"]>([
  "Solo",
  "Team Leader",
  "Member",
]);

const FORBIDDEN_KEY = /email|phone|mobile|teamCode|team_code|whatsapp/i;

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

describe("VICODATHON_WINNERS roster invariants", () => {
  it("lists exactly places 1–5 with matching public place labels", () => {
    expect(VICODATHON_WINNERS).toHaveLength(5);
    expect(VICODATHON_WINNERS.map((row) => row.place).sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const row of VICODATHON_WINNERS) {
      expect(row.placeLabel).toBe(PLACE_LABELS[row.place]);
      expect(row.entryLabel.trim().length).toBeGreaterThan(0);
      expect(row.problemStatement.trim().length).toBeGreaterThan(0);
    }
  });

  it("never carries phone, email, or team-code fields (plan 076 guardrail)", () => {
    const keys = collectKeys(VICODATHON_WINNERS);
    expect(keys.filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);

    const blob = JSON.stringify(VICODATHON_WINNERS);
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/\+?\d[\d\s-]{8,}\d/);
  });

  it("only uses Solo / Team Leader / Member roles and keeps team leaders unique", () => {
    for (const row of VICODATHON_WINNERS) {
      for (const member of row.members) {
        expect(ALLOWED_ROLES.has(member.role)).toBe(true);
        expect(member.fullName.trim().length).toBeGreaterThan(0);
      }

      if (row.members.length > 1) {
        const leaders = row.members.filter((m) => m.role === "Team Leader");
        expect(leaders).toHaveLength(1);
      }
    }
  });
});
