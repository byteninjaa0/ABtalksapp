import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BRIDGE_SLAB_IDLE,
  BRIDGE_TINTS,
  type BridgeStoryKey,
} from "./bridge-stories";

type StageYs = [number, number, number];

type Geo = {
  y: [number, number, number];
  riseZ: number;
  riseX: number;
  scaleActive: number;
  scaleIdle: number;
  scrollEnd: string;
  stages: {
    candidates: StageYs;
    abtalks: StageYs;
    companies: StageYs;
  };
};

const KEYS: BridgeStoryKey[] = ["candidates", "abtalks", "companies"];

const SHADOW_REST = [
  "0 40px 55px rgba(0,0,0,0.08), 0 12px 20px rgba(0,0,0,0.04)",
  "0 25px 35px rgba(0,0,0,0.06), 0 8px 15px rgba(0,0,0,0.03)",
  "0 16px 24px rgba(0,0,0,0.05), 0 4px 10px rgba(0,0,0,0.03)",
] as const;

const SHADOW_ACTIVE =
  "0 48px 70px rgba(0,0,0,0.14), 0 14px 28px rgba(0,0,0,0.06)";

const DESKTOP_STAGES = {
  candidates: [130, 15, -145] as StageYs,
  abtalks: [145, 0, -145] as StageYs,
  companies: [145, -15, -130] as StageYs,
};

function scaleStages(factor: number): Geo["stages"] {
  const s = (n: number) => Math.round(n * factor);
  return {
    candidates: [
      s(DESKTOP_STAGES.candidates[0]),
      s(DESKTOP_STAGES.candidates[1]),
      s(DESKTOP_STAGES.candidates[2]),
    ],
    abtalks: [
      s(DESKTOP_STAGES.abtalks[0]),
      s(DESKTOP_STAGES.abtalks[1]),
      s(DESKTOP_STAGES.abtalks[2]),
    ],
    companies: [
      s(DESKTOP_STAGES.companies[0]),
      s(DESKTOP_STAGES.companies[1]),
      s(DESKTOP_STAGES.companies[2]),
    ],
  };
}

const DESKTOP: Geo = {
  y: [130, 0, -130],
  riseZ: 95,
  riseX: 25,
  scaleActive: 1.03,
  scaleIdle: 0.98,
  // Four stages, boundaries at 1/6 · 1/2 · 5/6 of the pin. Short enough that
  // one deliberate flick clears a boundary instead of stalling mid-stage.
  scrollEnd: "+=240%",
  stages: DESKTOP_STAGES,
};

const TABLET: Geo = {
  y: [104, 0, -104],
  riseZ: 76,
  riseX: 20,
  scaleActive: 1.03,
  scaleIdle: 0.98,
  scrollEnd: "+=210%",
  stages: scaleStages(0.8),
};

const MOBILE: Geo = {
  y: [85, 0, -85],
  riseZ: 62,
  riseX: 16,
  scaleActive: 1.03,
  scaleIdle: 0.98,
  scrollEnd: "+=180%",
  stages: scaleStages(0.65),
};

const ISO = { rotateX: 58, rotateZ: 45 } as const;
const EASE = "power3.inOut";
const COPY_EASE = "power2.out";

/* The timeline is a step machine, not a scrub track. Stage index === timeline
   time: 0 = stack at rest, 1/2/3 = that slab fully risen. Scroll only picks a
   stage; the slab always plays the whole transition, never a fraction of it. */
const STEPS = 3;
const STEP_DURATION = 0.85;
const STEP_DURATION_FAR = 1.1;

function query(root: HTMLElement, selector: string): HTMLElement | null {
  return root.querySelector(selector);
}

function cardEls(root: HTMLElement): HTMLElement[] | null {
  const cards = KEYS.map((key) => query(root, `[data-bridge-card="${key}"]`));
  if (cards.some((el) => !el)) return null;
  return cards as HTMLElement[];
}

function copyEls(root: HTMLElement): HTMLElement[] | null {
  const copies = KEYS.map((key) =>
    query(root, `[data-bridge-copy="${key}"]`),
  );
  if (copies.some((el) => !el)) return null;
  return copies as HTMLElement[];
}

function face(
  card: HTMLElement,
  name: "top" | "front" | "side" | "bottom",
): HTMLElement {
  return card.querySelector(`.hub-bridge-card-${name}`) as HTMLElement;
}

function setSlab(card: HTMLElement, color: string): void {
  card.style.setProperty("--hub-bridge-slab", color);
}

function restPose(geo: Geo, index: number) {
  return {
    xPercent: -50,
    yPercent: -50,
    x: 0,
    y: geo.y[index],
    z: 0,
    rotateX: ISO.rotateX,
    rotateZ: ISO.rotateZ,
    scale: 1,
    force3D: true,
  };
}

function cardPose(geo: Geo, y: number, active: boolean) {
  return {
    x: active ? geo.riseX : 0,
    y,
    z: active ? geo.riseZ : 0,
    scale: active ? geo.scaleActive : geo.scaleIdle,
    rotateX: ISO.rotateX,
    rotateZ: ISO.rotateZ,
    force3D: true,
  };
}

/* Keyed on timeline time (0..3), not scroll progress — the connector has to
   track the anchor while a step tween is playing, and scroll is idle then. */
function connectorKind(time: number): BridgeStoryKey | null {
  if (time < 0.2) return null;
  if (time < 1.5) return "candidates";
  if (time < 2.5) return "abtalks";
  return "companies";
}

function connectorPath(
  stage: HTMLElement,
  card: HTMLElement,
  copy: HTMLElement,
  kind: BridgeStoryKey,
): string {
  const sr = stage.getBoundingClientRect();
  const anchor = card.querySelector("[data-bridge-anchor]");
  const ar = (anchor ?? card).getBoundingClientRect();
  const pr = copy.getBoundingClientRect();
  const x0 = ar.left - sr.left;
  const y0 = ar.top - sr.top;
  const x1 = pr.left - sr.left + 4;
  const y1 = pr.top + Math.min(56, pr.height * 0.22) - sr.top;

  if (kind === "candidates") {
    const midX = x0 + (x1 - x0) * 0.55;
    return `M ${x0} ${y0} L ${midX} ${y1} L ${x1} ${y1}`;
  }
  if (kind === "abtalks") {
    const midX = x0 + (x1 - x0) * 0.38;
    return `M ${x0} ${y0} L ${midX} ${y1} L ${x1} ${y1}`;
  }
  const midX = x0 + (x1 - x0) * 0.42;
  return `M ${x0} ${y0} L ${midX} ${y1} L ${x1} ${y1}`;
}

function syncConnectorSvg(stage: HTMLElement, path: SVGPathElement): void {
  const svg = path.ownerSVGElement;
  if (!svg) return;
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
}

function updateConnector(
  stage: HTMLElement,
  cards: HTMLElement[],
  copies: HTMLElement[],
  path: SVGPathElement,
  time: number,
): void {
  try {
    const kind = connectorKind(time);
    if (!kind) {
      path.style.opacity = "0";
      return;
    }
    syncConnectorSvg(stage, path);
    const index = KEYS.indexOf(kind);
    path.setAttribute(
      "d",
      connectorPath(stage, cards[index], copies[index], kind),
    );
    const length = path.getTotalLength();
    if (length <= 0) {
      path.style.opacity = "0";
      return;
    }
    const drawn =
      kind === "candidates"
        ? Math.min(1, Math.max(0, (time - 0.2) / 0.45))
        : 1;
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length * (1 - drawn)}`;
    path.style.opacity = "0.95";
  } catch {
    path.style.opacity = "0";
  }
}

function buildTimeline(root: HTMLElement, geo: Geo): void {
  const pin = query(root, "[data-bridge-pin]");
  const stage = query(root, "[data-bridge-stage]");
  const path = root.querySelector("[data-bridge-connector-path]");
  const cards = cardEls(root);
  const copies = copyEls(root);
  if (!pin || !stage || !path || !cards || !copies) return;

  const svgPath = path as SVGPathElement;
  const intro = query(root, '[data-bridge-copy="intro"]');

  cards.forEach((card, index) => {
    setSlab(card, BRIDGE_SLAB_IDLE);
    gsap.set(card, restPose(geo, index));
    gsap.set(face(card, "bottom"), { boxShadow: SHADOW_REST[index] });
  });
  gsap.set(copies, { opacity: 0, y: 24 });
  if (intro) gsap.set(intro, { opacity: 1, y: 0 });
  gsap.set(svgPath, { opacity: 0 });

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: EASE },
    onUpdate() {
      updateConnector(stage, cards, copies, svgPath, tl.time());
    },
  });

  tl.addLabel("rest", 0);
  tl.addLabel("candidates", 1);
  tl.addLabel("abtalks", 2);
  tl.addLabel("companies", 3);

  // t 0 → 1   rest → Candidates
  tl.to(
    cards[0],
    { ...cardPose(geo, geo.stages.candidates[0], true), duration: 1 },
    0,
  )
    .to(cards[0], { "--hub-bridge-slab": BRIDGE_TINTS.candidates, duration: 1 }, 0)
    .to(face(cards[0], "bottom"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 0)
    .to(
      cards[1],
      { ...cardPose(geo, geo.stages.candidates[1], false), duration: 1 },
      0,
    )
    .to(
      cards[2],
      { ...cardPose(geo, geo.stages.candidates[2], false), duration: 1 },
      0,
    )
    .to(
      copies[0],
      { opacity: 1, y: 0, duration: 0.55, ease: COPY_EASE },
      0.2,
    );
  if (intro) {
    tl.to(intro, { opacity: 0, y: -12, duration: 0.35 }, 0);
  }

  // t 1 → 2   Candidates → ABTalks
  tl.to(
    cards[0],
    { ...cardPose(geo, geo.stages.abtalks[0], false), duration: 1 },
    1,
  )
    .to(cards[0], { "--hub-bridge-slab": BRIDGE_SLAB_IDLE, duration: 1 }, 1)
    .to(face(cards[0], "bottom"), { boxShadow: SHADOW_REST[0], duration: 1 }, 1)
    .to(
      cards[1],
      { ...cardPose(geo, geo.stages.abtalks[1], true), duration: 1 },
      1,
    )
    .to(cards[1], { "--hub-bridge-slab": BRIDGE_TINTS.abtalks, duration: 1 }, 1)
    .to(face(cards[1], "bottom"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 1)
    .to(
      cards[2],
      { ...cardPose(geo, geo.stages.abtalks[2], false), duration: 1 },
      1,
    )
    .to(copies[0], { opacity: 0, y: 12, duration: 0.4, ease: COPY_EASE }, 1)
    .to(
      copies[1],
      { opacity: 1, y: 0, duration: 0.55, ease: COPY_EASE },
      1.15,
    );

  // t 2 → 3   ABTalks → Companies
  tl.to(
    cards[0],
    { ...cardPose(geo, geo.stages.companies[0], false), duration: 1 },
    2,
  )
    .to(
      cards[1],
      { ...cardPose(geo, geo.stages.companies[1], false), duration: 1 },
      2,
    )
    .to(cards[1], { "--hub-bridge-slab": BRIDGE_SLAB_IDLE, duration: 1 }, 2)
    .to(face(cards[1], "bottom"), { boxShadow: SHADOW_REST[1], duration: 1 }, 2)
    .to(
      cards[2],
      { ...cardPose(geo, geo.stages.companies[2], true), duration: 1 },
      2,
    )
    .to(cards[2], { "--hub-bridge-slab": BRIDGE_TINTS.companies, duration: 1 }, 2)
    .to(face(cards[2], "bottom"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 2)
    .to(copies[1], { opacity: 0, y: 12, duration: 0.4, ease: COPY_EASE }, 2)
    .to(
      copies[2],
      { opacity: 1, y: 0, duration: 0.55, ease: COPY_EASE },
      2.15,
    );

  let current = -1;
  let step: gsap.core.Tween | null = null;

  // Arrow, not a declaration: a hoisted `function` would drop the null-guard
  // narrowing on stage/cards/copies above.
  const goToStage = (index: number, immediate: boolean): void => {
    const next = Math.min(STEPS, Math.max(0, index));
    if (next === current && !immediate) return;

    const distance = current < 0 ? 1 : Math.abs(next - current);
    current = next;
    step?.kill();
    step = null;

    if (immediate) {
      tl.time(next);
      updateConnector(stage, cards, copies, svgPath, tl.time());
      return;
    }

    // Always run the transition end-to-end. Scroll chooses the destination,
    // it does not scrub the slab — so a slab is never left half out.
    step = tl.tweenTo(next, {
      duration: distance > 1 ? STEP_DURATION_FAR : STEP_DURATION,
      ease: EASE,
      overwrite: true,
    });
  };

  ScrollTrigger.create({
    trigger: pin,
    pin: true,
    pinSpacing: true,
    start: "top top",
    end: geo.scrollEnd,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    // Parks the scrollbar on a stage so you can never rest between two states.
    snap: {
      snapTo: 1 / STEPS,
      duration: { min: 0.2, max: 0.6 },
      delay: 0.04,
      ease: "power2.inOut",
    },
    onToggle(self) {
      const value = self.isActive ? "transform" : "";
      cards.forEach((card) => {
        card.style.willChange = value;
      });
    },
    onUpdate(self) {
      goToStage(Math.round(self.progress * STEPS), false);
    },
    onRefresh(self) {
      goToStage(Math.round(self.progress * STEPS), true);
    },
  });
}

export function createBridgeTimeline(root: HTMLElement): void {
  gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();

  mm.add("(min-width: 1024px)", () => {
    buildTimeline(root, DESKTOP);
  });

  mm.add("(min-width: 768px) and (max-width: 1023px)", () => {
    buildTimeline(root, TABLET);
  });

  mm.add("(max-width: 767px)", () => {
    buildTimeline(root, MOBILE);
  });

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
}
