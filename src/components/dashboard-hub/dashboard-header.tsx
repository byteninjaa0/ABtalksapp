"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { NotificationBellButton } from "@/components/shared/notification-bell-button";
import { SiteSearchSlot } from "@/components/dashboard-hub/site-search-slot";
import { cn } from "@/lib/utils";

export type HeaderSectionNavItem = {
  href: string;
  label: string;
};

type DashboardHeaderProps = {
  isAdmin: boolean;
  menuOpen: boolean;
  onMenuClick: () => void;
  /** Hub page section anchors. Default true. Ignored when sectionNavItems is set. */
  showSectionNav?: boolean;
  /** Custom header links (Claude). Desktop only (`lg+`), same as hub section nav. */
  sectionNavItems?: HeaderSectionNavItem[];
};

/** In page order, so the active underline moves left to right as you scroll. */
const HUB_SECTION_NAV: HeaderSectionNavItem[] = [
  { href: "#your-challenge", label: "Your Challenges" },
  { href: "#domains", label: "Domains" },
  { href: "#prep-kit", label: "Prep Kit" },
  { href: "#events", label: "Events" },
];

const HUB_SECTION_IDS = HUB_SECTION_NAV.map((item) => item.href.slice(1));

/** How far below the sticky header a section's top must pass to be current. */
const SPY_OFFSET_PX = 24;
/** Long enough for the smooth scroll a tab click starts to finish. */
const CLICK_LOCK_MS = 800;

/* Global header parts — defined once in globals.css (Design System v2 §6). */
const bellClassName = "abt-header-icon";

const navLinkClass = "abt-header-nav-link";

/**
 * Which hub section is on screen.
 *
 * The dashboard does not scroll the window: it scrolls inside
 * `.abt-content-scroll` (dashboard-shell), and this header renders inside that
 * element. The landing page's spy listens to `window`, which never fires here
 * — so this one binds to the scroller the header lives in.
 *
 * A section is current once its top passes just below the sticky header. At
 * the very bottom the last section wins, since a short final section can never
 * reach the line. Sections that are not on the page (Prep Kit is flag-gated)
 * are skipped. A tab click marks its section at once and holds it while the
 * smooth scroll it started runs, so the underline does not flicker through
 * every section in between.
 */
function useActiveSection(
  headerRef: RefObject<HTMLElement | null>,
  ids: string[],
  enabled: boolean,
): { active: string | null; select: (id: string) => void } {
  const [active, setActive] = useState<string | null>(null);
  const lockUntil = useRef(0);
  const recompute = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    const header = headerRef.current;
    const scroller =
      header?.closest<HTMLElement>(".abt-content-scroll") ?? null;
    let frame = 0;

    function compute() {
      frame = 0;
      if (Date.now() < lockUntil.current) return;
      // Document order, not `ids` order: the walk below keeps the last section
      // past the line, which is only right if the list runs top to bottom.
      const present = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
        .sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
        );
      const last = present[present.length - 1];
      if (!last) {
        setActive(null);
        return;
      }
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        : window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActive(last.id);
        return;
      }
      const line =
        (scroller?.getBoundingClientRect().top ?? 0) +
        (header?.offsetHeight ?? 0) +
        SPY_OFFSET_PX;
      let current: string | null = null;
      for (const el of present) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(compute);
    }

    recompute.current = schedule;
    const target: HTMLElement | Window = scroller ?? window;
    schedule();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      recompute.current = () => {};
    };
  }, [headerRef, ids, enabled]);

  const select = useCallback((id: string) => {
    lockUntil.current = Date.now() + CLICK_LOCK_MS;
    setActive(id);
    window.setTimeout(() => recompute.current(), CLICK_LOCK_MS + 50);
  }, []);

  return { active, select };
}

/**
 * Slides one underline to the active tab. Written straight to the element's
 * style rather than through state, so it costs no extra render per scroll.
 * Also keeps the active tab in view when the nav is scrolled sideways — with
 * `nav.scrollTo`, not `scrollIntoView`, which could move the page vertically.
 */
function useSlidingIndicator(
  navRef: RefObject<HTMLElement | null>,
  barRef: RefObject<HTMLElement | null>,
  activeId: string | null,
) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;
    const navEl: HTMLElement = nav;
    const barEl: HTMLElement = bar;

    function place() {
      const link = activeId
        ? navEl.querySelector<HTMLElement>(`a[href="#${activeId}"]`)
        : null;
      if (!link) {
        barEl.style.opacity = "0";
        return;
      }
      barEl.style.opacity = "1";
      barEl.style.width = `${link.offsetWidth}px`;
      barEl.style.transform = `translateX(${link.offsetLeft}px)`;

      const left = link.offsetLeft;
      const right = left + link.offsetWidth;
      if (left < navEl.scrollLeft || right > navEl.scrollLeft + navEl.clientWidth) {
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        navEl.scrollTo({
          left: Math.max(0, left - 16),
          behavior: reduce ? "auto" : "smooth",
        });
      }
    }

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [navRef, barRef, activeId]);
}

export function DashboardHeader({
  isAdmin,
  menuOpen,
  onMenuClick,
  showSectionNav = true,
  sectionNavItems,
}: DashboardHeaderProps) {
  const customNav = sectionNavItems && sectionNavItems.length > 0;
  const hubNav = !customNav && showSectionNav;

  const headerRef = useRef<HTMLElement>(null);
  const hubNavRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const { active, select } = useActiveSection(
    headerRef,
    HUB_SECTION_IDS,
    hubNav,
  );
  useSlidingIndicator(hubNavRef, indicatorRef, active);

  return (
    <header ref={headerRef} className="abt-header">
      <div className="abt-header-inner">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            className="abt-header-icon md:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={onMenuClick}
          >
            <Menu aria-hidden />
          </button>

          {/* Mobile only: the desktop sidebar already carries the wordmark, so
              below `md` the header is the only place the brand can live. */}
          <Link
            href="/dashboard"
            className="inline-flex h-8 shrink-0 items-center md:hidden"
            aria-label="ABTalks dashboard"
          >
            <Image
              src="/abtalks-logo.png"
              alt="ABTalks"
              width={120}
              height={32}
              className="block h-6 w-auto brightness-0"
            />
          </Link>

          {/* Section navs appear from `lg`, and shrink and scroll sideways
              rather than overflow. From `md` the header also carries a fixed
              250px search beside a 250px sidebar, so between 768px and ~1100px
              four uppercase, non-wrapping links pushed the search and bell
              out of the bar. */}
          {customNav ? (
            <nav
              className="abt-header-nav no-scrollbar hidden min-w-0 overflow-x-auto lg:flex"
              aria-label="Page sections"
            >
              {sectionNavItems.map((item) => (
                <a key={item.href} href={item.href} className={navLinkClass}>
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}

          {hubNav ? (
            <nav
              ref={hubNavRef}
              className="abt-header-nav no-scrollbar relative hidden min-w-0 overflow-x-auto lg:flex"
              aria-label="Page sections"
            >
              {HUB_SECTION_NAV.map((item) => {
                const id = item.href.slice(1);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      navLinkClass,
                      "aria-[current=location]:text-[#03535F]",
                    )}
                    // "location", not "page": these are sections of one page.
                    aria-current={active === id ? "location" : undefined}
                    onClick={() => select(id)}
                  >
                    {item.label}
                  </a>
                );
              })}
              <span
                ref={indicatorRef}
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 rounded-full bg-[#03535F] opacity-0 transition-[transform,width,opacity] duration-300 ease-[var(--ease-spark)] motion-reduce:transition-none"
              />
            </nav>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Search and the Admin pill are desktop-only — on a phone the bar is
              logo + hamburger + bell, and Admin moves into the drawer. */}
          <div className="hidden md:flex md:items-center">
            <SiteSearchSlot />
          </div>
          <NotificationBellButton className={bellClassName} />
          {isAdmin ? (
            <Link href="/admin" className="abt-header-cta hidden md:inline-flex">
              Admin
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
