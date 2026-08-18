import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  collapseLocationDupes,
  searchColleges,
  splitLocationSuffix,
  tokenize,
  type CollegeSearchRow,
} from "@/features/college/search-colleges";

beforeEach(() => {
  vi.clearAllMocks();
});

function row(
  partial: Partial<CollegeSearchRow> & Pick<CollegeSearchRow, "id" | "name">,
): CollegeSearchRow {
  return {
    state: null,
    district: null,
    city: null,
    ...partial,
  };
}

describe("tokenize", () => {
  it("uppercases, strips punctuation, and caps at six tokens", () => {
    expect(tokenize("  iit-bombay!! ")).toEqual(["IIT", "BOMBAY"]);
    expect(tokenize("a b c d e f g h")).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("splitLocationSuffix", () => {
  it("splits a long stem with a short place suffix", () => {
    expect(splitLocationSuffix("ABES Engineering College, Ghaziabad")).toEqual({
      stem: "ABES Engineering College",
      place: "Ghaziabad",
    });
  });

  it("rejects short stems, empty places, and long place phrases", () => {
    expect(splitLocationSuffix("IIT, Delhi")).toBeNull();
    expect(splitLocationSuffix("ABES Engineering College,")).toBeNull();
    expect(
      splitLocationSuffix(
        "Some Long College Name Here, One Two Three Four Five",
      ),
    ).toBeNull();
  });
});

describe("collapseLocationDupes", () => {
  it("drops exact alnum-name twins in the same state (keeps first)", () => {
    const kept = collapseLocationDupes([
      row({
        id: "a1",
        name: "ABES Engineering College",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
      }),
      row({
        id: "a2",
        name: "ABES Engineering College",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
      }),
    ]);
    expect(kept.map((r) => r.id)).toEqual(["a1"]);
  });

  it("keeps identical names when states differ", () => {
    const kept = collapseLocationDupes([
      row({
        id: "g1",
        name: "Government Polytechnic",
        state: "Maharashtra",
        district: "Pune",
      }),
      row({
        id: "g2",
        name: "Government Polytechnic",
        state: "Karnataka",
        district: "Mysore",
      }),
    ]);
    expect(kept.map((r) => r.id).sort()).toEqual(["g1", "g2"]);
  });

  it("drops location-suffixed twin when stem exists and place matches", () => {
    const kept = collapseLocationDupes([
      row({
        id: "stem",
        name: "ABES Engineering College",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
        city: "Ghaziabad",
      }),
      row({
        id: "qualified",
        name: "ABES Engineering College, Ghaziabad",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
        city: "Ghaziabad",
      }),
    ]);
    expect(kept.map((r) => r.id)).toEqual(["stem"]);
  });

  it("keeps a location-suffixed name when no matching stem place exists", () => {
    const kept = collapseLocationDupes([
      row({
        id: "other",
        name: "ABES Engineering College",
        state: "Delhi",
        district: "South",
        city: "New Delhi",
      }),
      row({
        id: "qualified",
        name: "ABES Engineering College, Ghaziabad",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
        city: "Ghaziabad",
      }),
    ]);
    expect(kept.map((r) => r.id).sort()).toEqual(["other", "qualified"]);
  });
});

describe("searchColleges", () => {
  it("returns [] without querying when the first token is shorter than 2", async () => {
    await expect(searchColleges("a")).resolves.toEqual([]);
    await expect(searchColleges("  !  ")).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("collapses dupes from raw rows and maps to CollegeOption", async () => {
    queryRaw.mockResolvedValue([
      row({
        id: "stem",
        name: "ABES Engineering College",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
        city: "Ghaziabad",
      }),
      row({
        id: "qualified",
        name: "ABES Engineering College, Ghaziabad",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
        city: "Ghaziabad",
      }),
    ]);

    await expect(searchColleges("abes")).resolves.toEqual([
      {
        id: "stem",
        name: "ABES Engineering College",
        state: "Uttar Pradesh",
        district: "Ghaziabad",
      },
    ]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("fail-opens to [] when the database query throws", async () => {
    queryRaw.mockRejectedValue(new Error("db down"));
    await expect(searchColleges("iit")).resolves.toEqual([]);
  });
});
