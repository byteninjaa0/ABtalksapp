import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BRIDGE_SLAB_IDLE,
  BRIDGE_TINTS,
  type BridgeStoryKey,
} from "./bridge-stories";

type Geo = {
  y: [number, number, number];
  riseY: number;
  riseZ: number;
  riseX: number;
  compress: number;
  scaleActive: number;
  scaleIdle: number;
  scrollEnd: string;
};

const KEYS: BridgeStoryKey[] = ["candidates", "abtalks", "companies"];

const SHADOW_REST = [
  "0 40px 55px rgba(0,0,0,0.08), 0 12px 20px rgba(0,0,0,0.04)",
  "0 25px 35px rgba(0,0,0,0.06), 0 8px 15px rgba(0,0,0,0.03)",
  "0 16px 24px rgba(0,0,0,0.05), 0 4px 10px rgba(0,0,0,0.03)",
] as const;

const SHADOW_ACTIVE =
  "0 48px 70px rgba(0,0,0,0.14), 0 14px 28px rgba(0,0,0,0.06)";

const DESKTOP: Geo = {
  y: [168, 0, -168],
  riseY: -52,
  riseZ: 180,
  riseX: 40,
  compress: 32,
  scaleActive: 1.05,
  scaleIdle: 0.96,
  scrollEnd: "+=400%",
};

const TABLET: Geo = {
  y: [132, 0, -132],
  riseY: -40,
  riseZ: 140,
  riseX: 24,
  compress: 24,
  scaleActive: 1.04,
  scaleIdle: 0.96,
  scrollEnd: "+=320%",
};

const MOBILE: Geo = {
  y: [100, 0, -100],
  riseY: -28,
  riseZ: 90,
  riseX: 0,
  compress: 18,
  scaleActive: 1.04,
  scaleIdle: 0.97,
  scrollEnd: "+=220%",
};

const ISO = { rotateX: 58, rotateZ: 45 } as const;
const EASE = "power3.inOut";

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

function face(card: HTMLElement, name: "top" | "front" | "side"): HTMLElement {
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

function activePose(geo: Geo, index: number) {
  return {
    x: geo.riseX,
    y: geo.y[index] + geo.riseY,
    z: geo.riseZ,
    scale: geo.scaleActive,
    rotateX: ISO.rotateX,
    rotateZ: ISO.rotateZ,
    force3D: true,
  };
}

function idlePose(geo: Geo, index: number, yShift: number) {
  return {
    x: 0,
    y: geo.y[index] + yShift,
    z: 0,
    scale: geo.scaleIdle,
    rotateX: ISO.rotateX,
    rotateZ: ISO.rotateZ,
    force3D: true,
  };
}

function connectorKind(progress: number): BridgeStoryKey | null {
  if (progress < 0.08) return null;
  if (progress < 0.375) return "candidates";
  if (progress < 0.625) return "abtalks";
  return "companies";
}

function connectorPath(
  stage: HTMLElement,
  card: HTMLElement,
  copy: HTMLElement,
  kind: BridgeStoryKey,
): string {
  const sr = stage.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const pr = copy.getBoundingClientRect();
  const x0 = cr.left + cr.width * 0.72 - sr.left;
  const y0 = cr.top + cr.height * 0.48 - sr.top;
  const x1 = pr.left - sr.left + 4;
  const y1 = pr.top + Math.min(56, pr.height * 0.22) - sr.top;

  if (kind === "candidates") {
    const mid = x0 + (x1 - x0) * 0.55;
    return `M ${x0} ${y0} L ${mid} ${y0} L ${x1} ${y0}`;
  }
  if (kind === "abtalks") {
    const mid = x0 + (x1 - x0) * 0.38;
    return `M ${x0} ${y0} L ${mid} ${y1} L ${x1} ${y1}`;
  }
  const mid = x0 + (x1 - x0) * 0.42;
  return `M ${x0} ${y0} L ${mid} ${y1} L ${x1} ${y1}`;
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
  progress: number,
): void {
  try {
    const kind = connectorKind(progress);
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
        ? Math.min(1, Math.max(0, (progress - 0.08) / 0.12))
        : 1;
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length * (1 - drawn)}`;
    path.style.opacity = "0.95";
  } catch {
    path.style.opacity = "0";
  }
}

function buildTimeline(root: HTMLElement, geo: Geo): gsap.core.Timeline | null {
  const pin = query(root, "[data-bridge-pin]");
  const stage = query(root, "[data-bridge-stage]");
  const path = root.querySelector("[data-bridge-connector-path]");
  const cards = cardEls(root);
  const copies = copyEls(root);
  if (!pin || !stage || !path || !cards || !copies) return null;

  const svgPath = path as SVGPathElement;
  const intro = query(root, '[data-bridge-copy="intro"]');

  cards.forEach((card, index) => {
    setSlab(card, BRIDGE_SLAB_IDLE);
    gsap.set(card, restPose(geo, index));
    gsap.set(face(card, "top"), { boxShadow: SHADOW_REST[index] });
  });
  gsap.set(copies, { opacity: 0, y: 16 });
  if (intro) gsap.set(intro, { opacity: 1, y: 0 });
  gsap.set(svgPath, { opacity: 0 });

  const tl = gsap.timeline({
    defaults: { ease: EASE },
    scrollTrigger: {
      trigger: pin,
      pin: true,
      pinSpacing: true,
      start: "top top",
      end: geo.scrollEnd,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle(self) {
        const value = self.isActive ? "transform" : "";
        cards.forEach((card) => {
          card.style.willChange = value;
        });
      },
      onUpdate(self) {
        updateConnector(stage, cards, copies, svgPath, self.progress);
      },
    },
  });

  // 0.00 → 0.25  Candidates
  tl.to(cards[0], { ...activePose(geo, 0), duration: 1 }, 0)
    .to(cards[0], { "--hub-bridge-slab": BRIDGE_TINTS.candidates, duration: 1 }, 0)
    .to(face(cards[0], "top"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 0)
    .to(cards[1], { ...idlePose(geo, 1, -geo.compress), duration: 1 }, 0)
    .to(cards[2], { ...idlePose(geo, 2, -geo.compress * 0.45), duration: 1 }, 0)
    .to(copies[0], { opacity: 1, y: 0, duration: 0.55 }, 0.2);
  if (intro) {
    tl.to(intro, { opacity: 0, y: -12, duration: 0.35 }, 0);
  }

  // 0.25 → 0.50  ABTalks
  tl.to(cards[0], { ...idlePose(geo, 0, geo.compress), duration: 1 }, 1)
    .to(cards[0], { "--hub-bridge-slab": BRIDGE_SLAB_IDLE, duration: 1 }, 1)
    .to(face(cards[0], "top"), { boxShadow: SHADOW_REST[0], duration: 1 }, 1)
    .to(cards[1], { ...activePose(geo, 1), duration: 1 }, 1)
    .to(cards[1], { "--hub-bridge-slab": BRIDGE_TINTS.abtalks, duration: 1 }, 1)
    .to(face(cards[1], "top"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 1)
    .to(cards[2], { ...idlePose(geo, 2, -geo.compress), duration: 1 }, 1)
    .to(copies[0], { opacity: 0, y: 12, duration: 0.4 }, 1)
    .to(copies[1], { opacity: 1, y: 0, duration: 0.55 }, 1.15);

  // 0.50 → 0.75  Companies
  tl.to(cards[0], { ...idlePose(geo, 0, geo.compress * 1.1), duration: 1 }, 2)
    .to(cards[1], { ...idlePose(geo, 1, geo.compress * 0.55), duration: 1 }, 2)
    .to(cards[1], { "--hub-bridge-slab": BRIDGE_SLAB_IDLE, duration: 1 }, 2)
    .to(face(cards[1], "top"), { boxShadow: SHADOW_REST[1], duration: 1 }, 2)
    .to(cards[2], { ...activePose(geo, 2), duration: 1 }, 2)
    .to(cards[2], { "--hub-bridge-slab": BRIDGE_TINTS.companies, duration: 1 }, 2)
    .to(face(cards[2], "top"), { boxShadow: SHADOW_ACTIVE, duration: 1 }, 2)
    .to(copies[1], { opacity: 0, y: 12, duration: 0.4 }, 2)
    .to(copies[2], { opacity: 1, y: 0, duration: 0.55 }, 2.15);

  // 0.75 → 1.00  hold
  tl.to(pin, { duration: 1 }, 3);

  return tl;
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
