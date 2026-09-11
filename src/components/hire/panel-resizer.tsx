"use client";

import { useEffect, useRef, useState } from "react";
import {
  PANEL_MIN,
  clampPanelWidth,
  clearStoredPanelWidth,
  maxPanelWidth,
  readStoredPanelWidth,
  stepPanelWidth,
  writeStoredPanelWidth,
  type PanelStepKey,
} from "@/features/hire/review-panel";

/** Below this the panel is a fullscreen overlay, so there is nothing to drag. */
const DESK_QUERY = "(min-width: 1101px)";

const STEP_KEYS: PanelStepKey[] = ["ArrowLeft", "ArrowRight", "Home", "End"];

function isStepKey(key: string): key is PanelStepKey {
  return (STEP_KEYS as string[]).includes(key);
}

/**
 * The drag handle on the review panel's left edge.
 *
 * The width is written to `--hire-panel-w` on `:root` rather than onto the
 * panel: the grid track belongs to `.scout__body`, and a custom property set on
 * the document survives the panel unmounting when the recruiter closes it.
 *
 * `.is-resizing` on `.scout__body` kills the 280ms `grid-template-columns`
 * transition for the duration of the drag — with it left on, the column chases
 * the pointer a third of a second behind and the panel feels like elastic.
 *
 * State flows one way: user events set `width`, and a single effect pushes it
 * to the DOM. Nothing sets `width` from an effect, so there is no render
 * cascade on mount.
 */
export function PanelResizer() {
  const ref = useRef<HTMLDivElement>(null);
  // Lazily seeded from storage. Safe to read here rather than in an effect:
  // `desk` starts false, so this component renders nothing on the server and
  // nothing on the first client render — there is no markup to mismatch.
  const [width, setWidth] = useState<number | null>(() => {
    const stored = readStoredPanelWidth();
    // Re-clamp: it may have been saved on a wider window than this one.
    return stored == null ? null : clampPanelWidth(stored, window.innerWidth);
  });
  const [max, setMax] = useState(() => maxPanelWidth(0));
  const [desk, setDesk] = useState(false);

  // Push the width out to the document. This is the effect's proper job —
  // synchronising an external system with React state — and it sets no state.
  useEffect(() => {
    const root = document.documentElement;
    if (width == null) root.style.removeProperty("--hire-panel-w");
    else root.style.setProperty("--hire-panel-w", `${width}px`);
  }, [width]);

  // Subscribe to the window. Both the breakpoint and the effective ceiling
  // depend on it, and `aria-valuemax` has to report the width the drag can
  // really reach rather than the constant.
  useEffect(() => {
    const mql = window.matchMedia(DESK_QUERY);
    function sync() {
      setDesk(mql.matches);
      setMax(maxPanelWidth(window.innerWidth));
      setWidth((w) => (w == null ? w : clampPanelWidth(w, window.innerWidth)));
    }
    sync();
    mql.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mql.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  function body(): HTMLElement | null {
    return ref.current?.closest(".scout__body") ?? null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const host = body();
    if (!host) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    host.classList.add("is-resizing");
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const host = body();
    if (!host) return;
    // The panel is the right-hand track, so its width is whatever is left
    // between the pointer and the desk's right edge.
    setWidth(
      clampPanelWidth(host.getBoundingClientRect().right - e.clientX, window.innerWidth),
    );
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    body()?.classList.remove("is-resizing");
    if (width != null) writeStoredPanelWidth(width);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isStepKey(e.key)) return;
    e.preventDefault();
    const next = stepPanelWidth(width ?? max, e.key, window.innerWidth);
    setWidth(next);
    writeStoredPanelWidth(next);
  }

  /** Double-click resets to the CSS default, the usual splitter convention. */
  function onDoubleClick() {
    clearStoredPanelWidth();
    setWidth(null);
  }

  if (!desk) return null;

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize candidate panel"
      aria-valuenow={width ?? undefined}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={max}
      tabIndex={0}
      className="hire-detail__grip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
