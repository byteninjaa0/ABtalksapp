"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { NotificationBellButton } from "@/components/shared/notification-bell-button";
import { SiteSearchSlot } from "@/components/dashboard-hub/site-search-slot";
import { Wordmark } from "@/components/shared/wordmark";

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
  /** Custom header links (Claude). Desktop only (`md+`), same as hub section nav. */
  sectionNavItems?: HeaderSectionNavItem[];
};

const HUB_SECTION_NAV: HeaderSectionNavItem[] = [
  { href: "#your-challenge", label: "Your Challenges" },
  { href: "#prep-kit", label: "Prep Kit" },
  { href: "#domains", label: "Domains" },
  { href: "#events", label: "Events" },
];

/* Global header parts — defined once in globals.css (Design System v2 §6). */
const bellClassName = "abt-header-icon";

const navLinkClass = "abt-header-nav-link";

export function DashboardHeader({
  isAdmin,
  menuOpen,
  onMenuClick,
  showSectionNav = true,
  sectionNavItems,
}: DashboardHeaderProps) {
  const customNav = sectionNavItems && sectionNavItems.length > 0;
  const hubNav = !customNav && showSectionNav;

  return (
    <header className="abt-header">
      <div className="abt-header-inner">
        <div className="flex min-w-0 items-center gap-3">
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
            aria-label="Klymb AI dashboard"
          >
            <Wordmark size="sm" className="block h-6 w-auto brightness-0" />
          </Link>

          {customNav ? (
            <nav
              className="abt-header-nav hidden md:flex"
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
              className="abt-header-nav hidden md:flex"
              aria-label="Page sections"
            >
              {HUB_SECTION_NAV.map((item) => (
                <a key={item.href} href={item.href} className={navLinkClass}>
                  {item.label}
                </a>
              ))}
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
