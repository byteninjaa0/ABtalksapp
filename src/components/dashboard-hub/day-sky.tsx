"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { IST } from "@/lib/date-utils";
import "./day-sky.css";

/* ─── Sky palette across the IST day ─────────────────────────
   Each stop is a minute-of-day; colours are interpolated linearly
   between neighbours so the sky drifts rather than jumps. */

type Palette = {
  top: string;
  mid: string;
  low: string;
  back: string;
  front: string;
  glow: string;
};

const STOPS: { m: number; p: Palette }[] = [
  { m: 0, p: { top: "#020714", mid: "#0a1c42", low: "#1e4180", back: "#2d5294", front: "#16306a", glow: "#c7dcff" } },
  { m: 300, p: { top: "#060d22", mid: "#162a5a", low: "#4a64a3", back: "#4a63a0", front: "#2b4278", glow: "#ffd9e6" } },
  { m: 375, p: { top: "#f1d6e6", mid: "#c5a3de", low: "#8c9deb", back: "#7e8fe4", front: "#5a62c8", glow: "#ffe3ef" } },
  { m: 480, p: { top: "#fff0d0", mid: "#ffd9a0", low: "#ffc28a", back: "#f9d2ab", front: "#f2b186", glow: "#fff3c4" } },
  { m: 720, p: { top: "#ffe49b", mid: "#ffca7a", low: "#ffae6c", back: "#f8cea2", front: "#efa676", glow: "#fff6d8" } },
  { m: 960, p: { top: "#ffd585", mid: "#ffb46c", low: "#ff9a62", back: "#f5bd90", front: "#ea9166", glow: "#ffe6b8" } },
  // Evening: orange → coral red → pink, deepening into a rose afterglow.
  { m: 1100, p: { top: "#d9466f", mid: "#f06a66", low: "#ffa15e", back: "#ec8a78", front: "#cc5a6c", glow: "#ffc39a" } },
  // Dusk runs ~70 min in small steps so sunset melts into night instead of
  // jumping: afterglow → purple dusk → indigo blue hour → early night → night.
  { m: 1140, p: { top: "#a8375f", mid: "#d9505f", low: "#f28a6a", back: "#b8566a", front: "#823d5c", glow: "#ffb08a" } },
  { m: 1175, p: { top: "#4a2a5e", mid: "#8a3f6e", low: "#d0707a", back: "#7a4a70", front: "#4f3160", glow: "#ffb8a0" } },
  { m: 1205, p: { top: "#141b45", mid: "#2c2f6e", low: "#6a5a95", back: "#45477e", front: "#2c2f5c", glow: "#d6d8ff" } },
  { m: 1240, p: { top: "#060d25", mid: "#0f2150", low: "#2a4a88", back: "#35579a", front: "#1c3874", glow: "#c7dcff" } },
  { m: 1270, p: { top: "#020714", mid: "#0a1c42", low: "#1e4180", back: "#2d5294", front: "#16306a", glow: "#c7dcff" } },
  { m: 1440, p: { top: "#020714", mid: "#0a1c42", low: "#1e4180", back: "#2d5294", front: "#16306a", glow: "#c7dcff" } },
];

const DEMO_MS = 10_000;
const SUNRISE = 360; // 06:00
const SUNSET = 1125; // 18:45

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function brightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function paletteAt(minute: number) {
  const i = STOPS.findIndex((s) => s.m > minute);
  const a = STOPS[Math.max(0, i - 1)];
  const b = STOPS[i === -1 ? STOPS.length - 1 : i];
  const t = b.m === a.m ? 0 : (minute - a.m) / (b.m - a.m);
  const keys = Object.keys(a.p) as (keyof Palette)[];
  const colors = Object.fromEntries(keys.map((k) => [k, mix(a.p[k], b.p[k], t)])) as Palette;
  const light =
    (brightness(a.p.top) + brightness(a.p.mid)) / 2 * (1 - t) +
    (brightness(b.p.top) + brightness(b.p.mid)) / 2 * t;
  return { colors, light };
}

/**
 * Position on an arc: 0 → rising edge, 1 → setting edge (percent units).
 * `rise` is how far above the horizon (80%) the peak sits.
 */
function arc(t: number, rise: number) {
  return { x: 4 + 92 * t, y: 80 - rise * Math.sin(Math.PI * t) };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Ease-in-out on 0–1 (no hard start/stop to a fade). */
function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

/* ─── Moon phase ─────────────────────────────────────────────
   Phase for today's IST date (taken at IST noon, so it is stable
   for the whole day and identical on server and client).
   0 = new, 0.5 = full; waxing is lit on the right. */

const SYNODIC_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC

function moonPhaseToday(): number {
  const [y, mo, d] = formatInTimeZone(new Date(), IST, "yyyy-M-d").split("-").map(Number);
  const istNoonMs = Date.UTC(y, mo - 1, d, 6, 30); // 12:00 IST
  const days = (istNoonMs - KNOWN_NEW_MOON_MS) / 86_400_000;
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}

/** Lit portion of a moon of radius r (centred at r,r) as an SVG path. */
function moonLitPath(phase: number, r: number): string {
  const k = Math.cos(2 * Math.PI * phase); // 1 new → -1 full
  const rx = Math.round(r * Math.abs(k) * 10) / 10;
  const waxing = phase < 0.5;
  const crescent = k > 0;
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  return `M ${r} 0 A ${r} ${r} 0 0 ${outerSweep} ${r} ${2 * r} A ${rx} ${r} 0 0 ${innerSweep} ${r} 0 Z`;
}

/* Near-side surface in a 60×60 box, traced from a full-moon photo
   (north up): Crisium upper right, Imbrium/Procellarum on the left,
   Copernicus mid-left and Tycho low-centre with their ray systems.
   Each mare is a few overlapping ellipses so edges read irregular. */
const MARIA = [
  // Oceanus Procellarum
  { cx: 11.5, cy: 30, rx: 7.5, ry: 11.5, o: 0.55 },
  { cx: 8, cy: 22, rx: 4, ry: 5, o: 0.45 },
  // Mare Imbrium
  { cx: 18.5, cy: 14.5, rx: 7.2, ry: 5.9, o: 0.62 },
  { cx: 14, cy: 17, rx: 4, ry: 3.5, o: 0.5 },
  // Mare Frigoris
  { cx: 26, cy: 7.3, rx: 11, ry: 1.5, o: 0.42 },
  // Mare Serenitatis
  { cx: 32.3, cy: 12.4, rx: 4.9, ry: 4.1, o: 0.66 },
  // Mare Vaporum / Sinus Medii
  { cx: 27.7, cy: 24.5, rx: 4, ry: 3.2, o: 0.5 },
  // Mare Tranquillitatis
  { cx: 40, cy: 18, rx: 4.9, ry: 3.9, o: 0.62 },
  { cx: 44, cy: 21.5, rx: 3, ry: 2.6, o: 0.55 },
  // Mare Crisium
  { cx: 46.8, cy: 10.4, rx: 3.1, ry: 2.8, o: 0.72 },
  // Mare Fecunditatis / Nectaris
  { cx: 48.6, cy: 25.8, rx: 3.5, ry: 4.2, o: 0.55 },
  { cx: 44.5, cy: 29.5, rx: 2.3, ry: 2.2, o: 0.5 },
  // Mare Nubium / Cognitum
  { cx: 23, cy: 39, rx: 7, ry: 5.2, o: 0.5 },
  { cx: 17, cy: 35, rx: 4, ry: 3.5, o: 0.45 },
  // Mare Humorum
  { cx: 12.6, cy: 41.5, rx: 2.6, ry: 2.5, o: 0.55 },
  // Links that join the seas into one continuous dark band
  { cx: 25.5, cy: 16, rx: 4.5, ry: 3.5, o: 0.45 },
  { cx: 36.5, cy: 17, rx: 3.5, ry: 3, o: 0.5 },
  { cx: 22, cy: 30, rx: 4, ry: 4.5, o: 0.4 },
  { cx: 17, cy: 22, rx: 3.5, ry: 3, o: 0.45 },
] as const;

/* Bright ray craters — r is the crater, reach is how far the streaks go. */
const TYCHO = { cx: 33.4, cy: 45, r: 0.95 };
const COPERNICUS = { cx: 19.7, cy: 25.8, r: 1.05 };
const ARISTARCHUS = { cx: 8.5, cy: 23.6, r: 0.55 };
const RAY_CRATERS = [
  { ...TYCHO, rays: 22, reach: 18, o: 0.42 },
  { ...COPERNICUS, rays: 20, reach: 8, o: 0.36 },
  { ...ARISTARCHUS, rays: 10, reach: 4.5, o: 0.3 },
  { cx: 13, cy: 29.3, r: 0.6, rays: 10, reach: 4.5, o: 0.22 }, // Kepler
  { cx: 52.8, cy: 31.5, r: 0.6, rays: 8, reach: 4, o: 0.2 }, // Langrenus
] as const;

const CRATERS = [
  { cx: 18.8, cy: 7.8, r: 1.1, dark: true }, // Plato
  { cx: 29, cy: 49.5, r: 1.2, dark: false },
  { cx: 38.5, cy: 51.5, r: 1.1, dark: false },
  { cx: 24.5, cy: 53, r: 0.9, dark: false },
  { cx: 44, cy: 45, r: 1, dark: false },
  { cx: 50, cy: 39, r: 0.8, dark: false },
  { cx: 34, cy: 30, r: 0.7, dark: false },
  { cx: 39.5, cy: 36, r: 0.8, dark: false },
  { cx: 23, cy: 19.5, r: 0.6, dark: false },
  { cx: 36.5, cy: 5.5, r: 0.8, dark: false },
  { cx: 43, cy: 7, r: 0.6, dark: false },
  { cx: 7.5, cy: 37.5, r: 0.7, dark: false },
] as const;

/* Fine speckle — tiny craters scattered across the disc. */
const SPECKLE = Array.from({ length: 70 }, (_, i) => {
  const a = i * 2.39996; // golden angle → even, deterministic spread
  const d = Math.sqrt((i + 0.5) / 70) * 28;
  return {
    cx: Math.round((30 + Math.cos(a) * d) * 10) / 10,
    cy: Math.round((30 + Math.sin(a) * d) * 10) / 10,
    r: 0.15 + (i % 5) * 0.06,
  };
});

/** Deterministic radial streaks for a ray crater, as one path. */
function rayPath(cx: number, cy: number, n: number, reach: number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.17;
    const len = reach * (0.45 + ((i * 7) % 11) / 20);
    const x = Math.round((cx + Math.cos(a) * len) * 10) / 10;
    const y = Math.round((cy + Math.sin(a) * len) * 10) / 10;
    d += `M${cx} ${cy}L${x} ${y}`;
  }
  return d;
}

/** Four-point sparkle centred on (cx, cy). */
function sparklePath(cx: number, cy: number, s: number): string {
  const t = s * 0.18;
  return `M${cx} ${cy - s}Q${cx + t} ${cy - t} ${cx + s} ${cy}Q${cx + t} ${cy + t} ${cx} ${cy + s}Q${cx - t} ${cy + t} ${cx - s} ${cy}Q${cx - t} ${cy - t} ${cx} ${cy - s}Z`;
}

function Moon({ phase, style }: { phase: number; style: CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const lit = moonLitPath(phase, 30);
  return (
    <svg className="dsky__moon" viewBox="0 0 60 60" style={style}>
      <defs>
        <clipPath id={`${uid}-lit`}>
          <path d={lit} />
        </clipPath>
        {/* Bright southern highlands, gently darker limb. */}
        <radialGradient id={`${uid}-face`} cx="58%" cy="62%" r="62%">
          <stop offset="0%" stopColor="#fbfbf9" />
          <stop offset="65%" stopColor="#e6e7e8" />
          <stop offset="100%" stopColor="#b9bdc3" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id={`${uid}-ray`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
      </defs>

      {/* Earthshine on the unlit side. */}
      <circle cx="30" cy="30" r="30" fill="rgba(200, 215, 235, 0.08)" />

      <g clipPath={`url(#${uid}-lit)`}>
        <circle cx="30" cy="30" r="30" fill={`url(#${uid}-face)`} />

        <g fill="#a7abb1" filter={`url(#${uid}-soft)`}>
          {MARIA.map(({ o, ...m }) => (
            <ellipse key={`${m.cx}-${m.cy}`} {...m} opacity={o} />
          ))}
        </g>

        <g fill="#c0c3c8" opacity="0.5">
          {SPECKLE.map((c) => (
            <circle key={`${c.cx}-${c.cy}`} {...c} />
          ))}
        </g>

        {/* Ray systems. */}
        <g stroke="#ffffff" strokeLinecap="round" filter={`url(#${uid}-ray)`}>
          {RAY_CRATERS.map((c) => (
            <path
              key={`${c.cx}-${c.cy}`}
              d={rayPath(c.cx, c.cy, c.rays, c.reach)}
              strokeWidth="0.35"
              opacity={c.o}
            />
          ))}
        </g>

        {CRATERS.map((c) => (
          <g key={`${c.cx}-${c.cy}`}>
            <circle cx={c.cx} cy={c.cy} r={c.r} fill={c.dark ? "#b2b5ba" : "#c8cbcf"} opacity="0.8" />
            <circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          </g>
        ))}

        {/* Bright ray-crater cores with a soft halo. */}
        {RAY_CRATERS.map((c) => (
          <g key={`core-${c.cx}-${c.cy}`}>
            <circle cx={c.cx} cy={c.cy} r={c.r * 2.4} fill={`url(#${uid}-halo)`} opacity="0.55" />
            <circle cx={c.cx} cy={c.cy} r={c.r} fill="#ffffff" />
            <circle cx={c.cx + c.r * 0.15} cy={c.cy + c.r * 0.15} r={c.r * 0.45} fill="#dcdee1" />
          </g>
        ))}
      </g>

      {/* Sparkles on the big craters (twinkle via CSS). */}
      <g clipPath={`url(#${uid}-lit)`} fill="#ffffff">
        <path className="dsky__glint" d={sparklePath(TYCHO.cx, TYCHO.cy, 4.2)} />
        <path
          className="dsky__glint dsky__glint--late"
          d={sparklePath(COPERNICUS.cx, COPERNICUS.cy, 3.2)}
        />
        <path
          className="dsky__glint dsky__glint--later"
          d={sparklePath(ARISTARCHUS.cx, ARISTARCHUS.cy, 2.2)}
        />
      </g>
    </svg>
  );
}

/* Moon timeline (minutes past midnight, night rolled past 1440):
   quick rise after sunset, a slow drift across the peak from 20:00
   to 02:00, then a quick set before sunrise. Returns arc progress 0–1. */
const MOON_STAGES = [
  { m: SUNSET, t: 0 },
  { m: 1200, t: 0.42 }, // 20:00 — reaches the peak band
  { m: 1560, t: 0.58 }, // 02:00 — leaves it
  { m: SUNRISE + 1440, t: 1 },
] as const;

function moonArcAt(nightMinute: number): number {
  if (nightMinute <= MOON_STAGES[0].m) return 0;
  for (let i = 1; i < MOON_STAGES.length; i++) {
    const a = MOON_STAGES[i - 1];
    const b = MOON_STAGES[i];
    if (nightMinute <= b.m) return a.t + ((nightMinute - a.m) / (b.m - a.m)) * (b.t - a.t);
  }
  return 1;
}

/* ─── Hills ──────────────────────────────────────────────────
   Five overlapping ridges, far → near. Each has its own vertical
   gradient (lighter crest, deeper base) so every ridge's edge reads
   against the one behind it. Colours come from --hill-* in CSS. */

const HILLS = [
  {
    name: "far",
    d: "M0 72 C 200 30 420 18 640 46 C 860 74 1080 36 1280 26 C 1360 22 1410 28 1440 32 V200 H0 Z",
  },
  {
    name: "back",
    d: "M0 108 C 180 66 380 58 600 90 C 820 122 1040 80 1240 68 C 1340 62 1400 70 1440 76 V200 H0 Z",
  },
  {
    name: "mid",
    d: "M0 124 C 240 96 460 100 700 130 C 920 158 1160 112 1440 104 V200 H0 Z",
  },
  {
    name: "front",
    d: "M0 158 C 260 128 520 134 780 158 C 1020 180 1240 146 1440 140 V200 H0 Z",
  },
  // Lightest, nearest dune — tinted by the sky, fading into the page colour.
  {
    name: "base",
    // Overshoots both sides so its blurred edge never shows at the screen edge.
    d: "M-60 178 C 220 156 470 158 720 174 C 960 190 1210 166 1500 162 V240 H-60 Z",
  },
] as const;

function Hills() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg className="dsky__hills" viewBox="0 0 1440 200" preserveAspectRatio="none">
      <defs>
        {HILLS.map((h) => (
          <linearGradient key={h.name} id={`${uid}-${h.name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: `var(--hill-${h.name}-crest)` }} />
            <stop
              offset={h.name === "base" ? "100%" : "55%"}
              style={{ stopColor: `var(--hill-${h.name}-base)` }}
            />
          </linearGradient>
        ))}
        {/* The nearest dune has no hard edge — it's a soft mist into the page. */}
        <filter id={`${uid}-mist`} x="-10%" y="-60%" width="120%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {HILLS.map((h) => (
        <path
          key={h.name}
          className={`dsky__hill dsky__hill--${h.name}`}
          d={h.d}
          fill={`url(#${uid}-${h.name})`}
          filter={h.name === "base" ? `url(#${uid}-mist)` : undefined}
        />
      ))}
    </svg>
  );
}

/* ─── Birds & clouds ──────────────────────────────────────── */

/** A gull in a 100×40 box: left wing swept up, long right wing, tapered. */
const GULL_PATH =
  "M0 0 C 16 8 32 18 48 32 C 62 20 80 12 104 10 C 84 16 68 24 52 38 L 48 38 C 34 24 18 12 0 0 Z";

/* Flat, minimal clouds in the same language as the gulls: crisp white
   silhouettes, no gradients or shadows. A soft translucent streak sits
   behind a gently lumpy body. Shapes live in a 240×64 box. */
const CLOUD_STREAK =
  "M4 56 C 44 46 104 43 162 46 C 198 48 226 52 238 56 C 196 61 62 61 4 56 Z";
const CLOUD_BODY =
  "M30 52 C 20 52 18 42 28 40 C 30 30 44 26 54 32 C 62 18 86 16 96 30 C 104 22 122 24 126 36 C 138 32 152 36 154 46 C 162 46 168 49 168 52 Z";

/* Each cloud drifts left → right on its own loop; negative delays start
   them mid-journey so the sky is never empty on load. */
const CLOUDS = [
  { top: 24, width: 220, dur: 150, delay: -22, flip: false }, // ~15% across, below the greeting
  { top: 4, width: 280, dur: 120, delay: -60, flip: true }, // ~50% across
  { top: 14, width: 190, dur: 180, delay: -144, flip: false }, // ~80% across
] as const;

function Cloud({ flip, style }: { flip: boolean; style: CSSProperties }) {
  return (
    <svg className="dsky__cloud" viewBox="0 0 240 64" style={style}>
      <g transform={flip ? "translate(240 0) scale(-1 1)" : undefined}>
        <path className="dsky__cloud-streak" d={CLOUD_STREAK} />
        <path className="dsky__cloud-body" d={CLOUD_BODY} />
      </g>
    </svg>
  );
}

/* ─── Shooting stars ─────────────────────────────────────── */

type ShootingStar = { id: number; top: number; left: number; angle: number };

const SHOOTING_EVERY_MS = 120_000;
const SHOOTING_FIRST_MS = 6_000;

/** Random start in the upper sky (right of the greeting) and a random
 *  downward heading, either down-left or down-right. */
function randomShootingStar(id: number): ShootingStar {
  const heading = Math.random() < 0.5 ? 20 + Math.random() * 40 : 120 + Math.random() * 40;
  return {
    id,
    top: 4 + Math.random() * 30,
    left: 38 + Math.random() * 54,
    // The streak's head leads along -x, so rotate half a turn from the heading.
    angle: heading + 180,
  };
}

function istMinuteNow(): number {
  const [h, m] = formatInTimeZone(new Date(), IST, "H:m").split(":").map(Number);
  return h * 60 + m;
}

/* Fixed star field (percent positions) so SSR and client match. */
const STARS = [
  [6, 14, 2], [14, 36, 1.5], [22, 10, 2.5], [31, 28, 1.5], [38, 8, 2],
  [46, 22, 1.5], [53, 12, 2.5], [61, 30, 1.5], [67, 6, 2], [74, 20, 1.5],
  [81, 34, 2], [88, 12, 2.5], [94, 26, 1.5], [18, 52, 1.5], [57, 48, 1.5],
  [72, 44, 2], [42, 40, 1.5], [90, 46, 1.5],
] as const;

type DaySkySectionProps = {
  /** IST minute-of-day computed on the server, so the first paint matches. */
  initialMinute: number;
  /** Dev time override is active — hold `initialMinute` instead of following the clock. */
  frozen?: boolean;
  /** Dev demo — loop the whole day every DEMO_MS. */
  demo?: boolean;
  className?: string;
  children: ReactNode;
};

export function DaySkySection({
  initialMinute,
  frozen = false,
  demo = false,
  className,
  children,
}: DaySkySectionProps) {
  const [liveMinute, setLiveMinute] = useState(initialMinute);
  const sectionRef = useRef<HTMLElement>(null);

  // Publish where the greeting text ends (--text-bottom, px from the top of
  // the sky) so CSS can keep the moon below it on phones, whatever the
  // name length or line wrapping.
  useEffect(() => {
    const section = sectionRef.current;
    const text = section?.querySelector<HTMLElement>("[data-sky-text]");
    if (!section || !text) return;
    const update = () => {
      const bottom = text.getBoundingClientRect().bottom - section.getBoundingClientRect().top;
      section.style.setProperty("--text-bottom", `${Math.round(bottom)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(text);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  const [moonPhase] = useState(moonPhaseToday);
  const [shooting, setShooting] = useState<ShootingStar | null>(null);
  const minute = frozen ? initialMinute : liveMinute;

  useEffect(() => {
    if (!demo) return;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      setLiveMinute((((now - start) % DEMO_MS) / DEMO_MS) * 1440);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [demo]);

  useEffect(() => {
    if (frozen || demo) return;
    const tick = () => setLiveMinute(istMinuteNow());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [frozen, demo]);

  const { colors, light } = paletteAt(minute);
  const dark = light < 0.5;

  const sunUp = minute >= SUNRISE && minute <= SUNSET;
  const sunT = (minute - SUNRISE) / (SUNSET - SUNRISE);
  const sun = arc(clamp01(sunT), 62);

  const starOpacity = clamp01((0.45 - light) / 0.25);
  const isNight = starOpacity > 0.5;

  // One shooting star every 2 minutes while it's properly dark, at a random
  // spot and angle. The first follows shortly after night begins.
  useEffect(() => {
    if (!isNight) return;
    let n = 0;
    const fire = () => setShooting(randomShootingStar(++n));
    const first = setTimeout(fire, SHOOTING_FIRST_MS);
    const every = setInterval(fire, SHOOTING_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [isNight]);
  // Illuminated fraction — a near-new moon simply isn't drawn (moonless night).
  const moonLit = (1 - Math.cos(2 * Math.PI * moonPhase)) / 2;
  const showMoon = !sunUp && moonLit > 0.03 && starOpacity > 0;
  // Mirror of the sun: rises at the right edge after sunset, crosses the
  // whole sky and sets at the left edge before sunrise. The westward half
  // of the arc sags lower so the moon passes *under* the greeting text.
  // CSS turns --moon-lift into the height (lower arc on phones).
  const nightMinute = minute < SUNRISE ? minute + 1440 : minute;
  const moonT = moonArcAt(nightMinute);
  const moonSag = moonT > 0.5 ? 1 - (moonT - 0.5) * 0.7 : 1;
  const moonStyle = {
    opacity: starOpacity,
    "--moon-x": `${Math.round((96 - 92 * moonT) * 100) / 100}%`,
    "--moon-lift": Math.round(Math.sin(Math.PI * moonT) * moonSag * 1000) / 1000,
  } as CSSProperties;
  // Birds drift through the morning only, after sunrise (05:30–10:30, peak 08:00).
  const birdOpacity = clamp01(1 - Math.abs(minute - 480) / 150);
  // Clouds drift through the afternoon (10:00–18:00, fullest ~14:00).
  // Eased two-hour ramps in (10:00→12:00) and out (16:00→18:00).
  const cloudOpacity =
    smoothstep(clamp01((minute - 600) / 120)) * smoothstep(clamp01((1080 - minute) / 120));

  const style = {
    "--sky-top": colors.top,
    "--sky-mid": colors.mid,
    "--sky-low": colors.low,
    "--sky-back": colors.back,
    "--sky-front": colors.front,
    "--sky-glow": colors.glow,
    "--hero-ink": dark ? "#FFFFFF" : "#000000",
    "--hero-ink-soft": dark ? "rgba(255, 255, 255, 0.82)" : "#4B4B4B",
  } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      className={`dsky${demo ? " dsky--demo" : ""} ${className ?? ""}`}
      style={style}
    >
      <div className="dsky__scene" aria-hidden="true">
        <div className="dsky__sky" />

        <div className="dsky__stars" style={{ opacity: starOpacity }}>
          {STARS.map(([x, y, s], i) => (
            <span
              key={i}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: s,
                height: s,
                animationDelay: `${(i % 6) * 0.7}s`,
              }}
            />
          ))}
          {/* Occasional shooting star (night only, via the stars layer). */}
          {isNight && shooting ? (
            <span
              key={shooting.id}
              className="dsky__shooting"
              style={
                {
                  top: `${shooting.top}%`,
                  left: `${shooting.left}%`,
                  "--shoot-angle": `${shooting.angle}deg`,
                } as CSSProperties
              }
            />
          ) : null}
        </div>

        {birdOpacity > 0 ? (
          <svg className="dsky__birds" viewBox="0 0 200 110" style={{ opacity: birdOpacity }}>
            {/* Gulls: swept, tapering wings; the big one leads, a small one trails. */}
            <path className="dsky__bird" d={GULL_PATH} transform="translate(78 2)" />
            <path
              className="dsky__bird dsky__bird--small"
              d={GULL_PATH}
              transform="translate(6 58) scale(0.62)"
            />
          </svg>
        ) : null}

        {sunUp ? (
          <div className="dsky__sun" style={{ left: `${sun.x}%`, top: `${sun.y}%` }} />
        ) : null}

        {cloudOpacity > 0 ? (
          <div className="dsky__clouds" style={{ opacity: cloudOpacity }}>
            {CLOUDS.map((c) => (
              <Cloud
                key={`${c.top}-${c.width}`}
                flip={c.flip}
                style={
                  {
                    top: `${c.top}%`,
                    width: c.width,
                    "--cloud-dur": `${c.dur}s`,
                    "--cloud-delay": `${c.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        {/* Fixed in the upper right; shows today's real phase, night only. */}
        {showMoon ? (
          <Moon phase={moonPhase} style={moonStyle} />
        ) : null}

        <Hills />
      </div>

      {children}
    </section>
  );
}
