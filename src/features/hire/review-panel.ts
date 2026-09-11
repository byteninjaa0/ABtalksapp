/**
 * The candidate review panel's resize maths and its next/previous contract.
 *
 * Pure and DOM-free on purpose. The panel itself is a grid column styled in
 * `hire-scout.css` and driven by a pointer drag, none of which is testable
 * without a browser — so the parts that can actually be got wrong (the bounds,
 * the keyboard step, where the arrows stop) live here instead, and
 * `review-panel.test.ts` asserts them directly.
 *
 * The only impure pair, `readStoredPanelWidth` / `writeStoredPanelWidth`, is
 * guarded the same way `evidence-cache.ts` guards its own storage writes.
 */

/** Namespaced with the other `abtalks-hire-*` keys the desk already owns. */
export const PANEL_WIDTH_KEY = "abtalks-hire-panel-w";

export const PANEL_MIN = 360;
export const PANEL_MAX = 720;
export const PANEL_STEP = 16;

/**
 * The panel may not take more than this share of the window.
 *
 * Without it, a 720px panel on a 1280px laptop leaves the results 560px — and
 * "results stay visible" is the whole point of the ticket, so the ceiling is a
 * requirement rather than a nicety.
 */
const PANEL_MAX_VIEWPORT_SHARE = 0.6;

/** The widest the panel may actually get on a window this size. */
export function maxPanelWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return PANEL_MAX;
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(viewportWidth * PANEL_MAX_VIEWPORT_SHARE)));
}

/**
 * Round and pin a candidate width inside the bounds for this window.
 *
 * Only NaN falls back to the floor — it is the one input carrying no
 * information. +/-Infinity is just an out-of-range number and clamps to the
 * ceiling or the floor like any other, which is what a drag flung past the
 * edge of the screen should do.
 */
export function clampPanelWidth(px: number, viewportWidth: number): number {
  if (Number.isNaN(px)) return PANEL_MIN;
  return Math.min(Math.max(Math.round(px), PANEL_MIN), maxPanelWidth(viewportWidth));
}

export type PanelStepKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * Keyboard resize.
 *
 * The grip sits on the panel's LEFT edge, so left widens and right narrows —
 * the key moves the handle, not the width.
 */
export function stepPanelWidth(
  px: number,
  key: PanelStepKey,
  viewportWidth: number,
): number {
  const from = clampPanelWidth(px, viewportWidth);
  switch (key) {
    case "ArrowLeft":
      return clampPanelWidth(from + PANEL_STEP, viewportWidth);
    case "ArrowRight":
      return clampPanelWidth(from - PANEL_STEP, viewportWidth);
    case "Home":
      return PANEL_MIN;
    case "End":
      return maxPanelWidth(viewportWidth);
  }
}

export function readStoredPanelWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return null;
    const px = Number.parseInt(raw, 10);
    return Number.isFinite(px) ? px : null;
  } catch {
    // Private mode or blocked storage — the panel just opens at its default.
    return null;
  }
}

export function writeStoredPanelWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(px)));
  } catch {
    // As above: losing the preference is not worth breaking the drag over.
  }
}

export function clearStoredPanelWidth(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PANEL_WIDTH_KEY);
  } catch {
    // Nothing to do — the default width applies either way.
  }
}

/**
 * Where the panel's arrows go, or `null` when there is nowhere to go.
 *
 * `null` is what disables the button, so the ends of the result set and an
 * unknown candidate (`index === -1`, e.g. the open card was filtered out by
 * "Hide rejected") all have to return it.
 */
export function neighbourIndex(
  length: number,
  index: number,
  dir: -1 | 1,
): number | null {
  if (!Number.isInteger(length) || length <= 0) return null;
  if (!Number.isInteger(index) || index < 0 || index >= length) return null;
  const next = index + dir;
  return next >= 0 && next < length ? next : null;
}
