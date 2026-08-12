import { describe, expect, it } from "vitest";
import { toCSV } from "@/lib/csv";

describe("toCSV", () => {
  it("returns empty string for no rows", () => {
    expect(toCSV([])).toBe("");
  });

  it("emits headers and escapes commas / quotes / newlines", () => {
    const csv = toCSV([
      { name: 'Ada "Lovelace"', city: "London, UK", note: "line1\nline2" },
      { name: "Grace", city: "DC", note: null },
    ]);
    expect(csv).toBe(
      [
        "name,city,note",
        '"Ada ""Lovelace""","London, UK","line1\nline2"',
        "Grace,DC,",
      ].join("\n"),
    );
  });

  it("serializes Date values as ISO strings", () => {
    const csv = toCSV([{ when: new Date("2026-08-12T00:00:00.000Z") }]);
    expect(csv).toBe("when\n2026-08-12T00:00:00.000Z");
  });
});
