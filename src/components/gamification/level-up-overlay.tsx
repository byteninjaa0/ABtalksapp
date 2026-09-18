"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ProgressView } from "@/features/gamification/loaders";

const STORE_KEY = "abtalks-gamification-celebrated-level";

const BURST_COLORS = ["#FFFFFF", "#D4EBEC", "#18D39B", "#FFFFFF"];

const storeListeners = new Set<() => void>();

function readStore(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? "0";
  } catch {
    return "0";
  }
}

function writeStore(value: string): void {
  try {
    localStorage.setItem(STORE_KEY, value);
  } catch {}
  for (const listener of storeListeners) listener();
}

function subscribeToStore(onChange: () => void): () => void {
  storeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plan 151 §34 — the one loud moment. Full-bleed primary teal, a ring that
 * fills, and a burst made of the same squares as the activity grid. Reduced
 * motion gets the same panel with no animation at all.
 */
export function LevelUpOverlay({ progress }: { progress: ProgressView }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Read the "already celebrated" mark as an external store rather than with
  // state-in-an-effect: the server renders nothing, and the client decides once
  // it is hydrated, so there is no flash for someone who already saw it.
  const celebrated = useSyncExternalStore(subscribeToStore, readStore, () => null);

  const open =
    celebrated !== null &&
    progress.levelIsFresh &&
    progress.level >= 2 &&
    progress.level > Number(celebrated);

  const close = useCallback(() => {
    writeStore(String(progress.level));
  }, [progress.level]);

  // An older level-up (or an account that levelled before this shipped) is
  // recorded silently, so it never surfaces late.
  useEffect(() => {
    if (celebrated === null || progress.levelIsFresh) return;
    if (progress.level > Number(celebrated)) writeStore(String(progress.level));
  }, [celebrated, progress.levelIsFresh, progress.level]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The burst: squares flying out of the ring, fading as they go.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rand = seeded(7);
    const parts = Array.from({ length: 64 }, (_, i) => ({
      ang: i * 2.39996 + rand() * 0.4,
      sp: 90 + rand() * 210,
      sz: 5 + rand() * 9,
      delay: rand() * 0.25,
      rot: rand() * 6,
      color: BURST_COLORS[i % BURST_COLORS.length],
    }));
    const cx = w / 2;
    const cy = h / 2 - 40;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        const local = (t - p.delay) / 1.7;
        if (local <= 0 || local >= 1) continue;
        alive = true;
        const eased = 1 - Math.pow(1 - local, 3);
        const r = eased * p.sp;
        const x = cx + Math.cos(p.ang) * r;
        const y = cy + Math.sin(p.ang) * r + local * local * 50;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot + local * 2);
        ctx.globalAlpha = (1 - local) * 0.95;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz, 3);
        ctx.fill();
        ctx.restore();
      }
      if (alive || t < 0.4) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  const next = progress.next;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#03535F] px-6 text-center text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="levelup-title"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      />
      <div className="relative flex flex-col items-center">
        <div className="relative size-44">
          <svg viewBox="0 0 176 176" className="size-44 -rotate-90" aria-hidden>
            <circle cx="88" cy="88" r="80" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="10" />
            <circle
              cx="88"
              cy="88"
              r="80"
              fill="none"
              stroke="#18D39B"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="502.65"
              strokeDashoffset="0"
              className="motion-safe:[animation:levelup-ring_1s_ease-out_both]"
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-display text-6xl font-bold">
            {progress.level}
          </span>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#18D39B]">
          Level up
        </p>
        <h2 id="levelup-title" className="mt-1.5 font-display text-4xl font-bold">
          {progress.levelName}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/90">
          Unlocked by checked work — the platform verified every point behind it.
        </p>

        {next ? (
          <div className="mt-6 max-w-sm rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm leading-relaxed">
            Next · <span className="font-semibold">{next.name}</span>
            <br />
            {next.gates.length > 0
              ? next.gates.map((g) => g.label).join(" · ")
              : `${next.xpRemaining.toLocaleString("en-IN")} XP to go`}
          </div>
        ) : null}

        <button
          ref={closeRef}
          type="button"
          onClick={close}
          className="mt-7 h-11 rounded-xl bg-white px-6 text-sm font-semibold text-[#03535F] hover:bg-[#EEF6F6]"
        >
          Keep building
        </button>
      </div>

      <style>{`@keyframes levelup-ring { from { stroke-dashoffset: 502.65 } to { stroke-dashoffset: 0 } }`}</style>
    </div>
  );
}
