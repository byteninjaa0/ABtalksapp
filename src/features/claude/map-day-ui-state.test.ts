import { describe, expect, it } from "vitest";
import type { HeatmapCell } from "@/features/dashboard/get-heatmap-data";
import { mapHeatmapCellToUiState } from "@/features/claude/map-day-ui-state";

function cell(
  overrides: Partial<HeatmapCell> & Pick<HeatmapCell, "dayNumber" | "status">,
): HeatmapCell {
  return {
    date: "2026-08-27",
    isRelaxable: false,
    taskTitle: null,
    problemStatement: null,
    learningObjectives: [],
    resources: [],
    tags: [],
    difficulty: null,
    estimatedMinutes: null,
    githubUrl: null,
    linkedinUrl: null,
    submittedAt: null,
    adminName: null,
    actionReason: null,
    actionAt: null,
    ...overrides,
  };
}

describe("mapHeatmapCellToUiState", () => {
  it("marks on_time and late submissions as completed", () => {
    expect(mapHeatmapCellToUiState(cell({ dayNumber: 3, status: "on_time" }), 5)).toBe(
      "completed",
    );
    expect(mapHeatmapCellToUiState(cell({ dayNumber: 10, status: "late" }), 5)).toBe(
      "completed",
    );
  });

  it("locks days after the current challenge day", () => {
    expect(
      mapHeatmapCellToUiState(cell({ dayNumber: 6, status: "future" }), 5),
    ).toBe("locked");
  });

  it("treats today with no submission (heatmap future) as available", () => {
    expect(
      mapHeatmapCellToUiState(cell({ dayNumber: 5, status: "future" }), 5),
    ).toBe("available");
  });

  it("keeps relaxable and rejected past days available", () => {
    expect(
      mapHeatmapCellToUiState(
        cell({ dayNumber: 3, status: "missed", isRelaxable: true }),
        5,
      ),
    ).toBe("available");
    expect(
      mapHeatmapCellToUiState(cell({ dayNumber: 2, status: "rejected" }), 5),
    ).toBe("available");
  });

  it("closes the window for non-relaxable missed past days", () => {
    expect(
      mapHeatmapCellToUiState(cell({ dayNumber: 2, status: "missed" }), 5),
    ).toBe("window_closed");
  });
});
