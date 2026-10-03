"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Award,
  Bot,
  Briefcase,
  ClipboardCheck,
  Grid3X3,
  LogIn,
  LogOut,
  Presentation,
  Shield,
  Store,
  User,
  Zap,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth-actions";
import { getOpenJobsCountAction } from "@/app/actions/job-actions";
import { cn } from "@/lib/utils";
import {
  NAV_ITEMS,
  SIDEBAR_BRAND_ROW_CLASS,
  SIDEBAR_FOOTER_ROW_CLASS,
  SIDEBAR_WIDTH_CLASS,
  HUB_NAV_ACTIVE_CLASS,
  HUB_NAV_IDLE_CLASS,
  type NavIconKey,
} from "./nav-items";

type NavIconProps = { className?: string; "aria-hidden"?: boolean };

function DashboardNavIcon({ className, "aria-hidden": ariaHidden }: NavIconProps) {
  return (
    <Image
      src="/dashboard-nav-icon.png"
      alt=""
      width={20}
      height={20}
      className={cn("size-5", className)}
      aria-hidden={ariaHidden}
    />
  );
}

const ICON_MAP: Record<
  NavIconKey,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  grid: Grid3X3,
  presentation: Presentation,
  store: Store,
  briefcase: Briefcase,
  award: Award,
  zap: Zap,
  user: User,
  clipboard: ClipboardCheck,
  bot: Bot,
};

const SIDEBAR_COLLAPSED_WIDTH_CLASS = "w-[72px]";
const SIDEBAR_TOGGLE_SRC = "/sidebar-toggle.webp";

type DashboardSidebarProps = {
  user: { name: string; email: string; image: string | null };
  mobileOpen: boolean;
  onNavigate: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Renders the Admin entry inside the mobile drawer (the header pill is md+ only). */
  isAdmin?: boolean;
  /**
   * False on the public routes that render this sidebar to signed-out
   * visitors (`/hackathon`). Every other DashboardShell route is gated by
   * middleware, so it stays true and nothing about them changes.
   */
  signedIn?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <Image
      src={SIDEBAR_TOGGLE_SRC}
      alt=""
      width={20}
      height={20}
      className={cn("size-4", className)}
      aria-hidden
    />
  );
}

export function DashboardSidebar({
  user,
  mobileOpen,
  onNavigate,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  isAdmin = false,
  signedIn = true,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const displayName = user.name.trim() || user.email || "User";
  const isCollapsed = collapsible && collapsed;

  /**
   * Open-job count for the Jobs badge.
   *
   * `null` until it arrives, and the badge renders nothing in that state —
   * a "0" that turns into "7" a moment later reads as jobs disappearing.
   * Re-read on navigation and when the tab regains focus, the same way the
   * notification bell refreshes, so applying for the last open role or an
   * admin closing one is reflected without a reload.
   */
  const [openJobs, setOpenJobs] = useState<number | null>(null);

  const loadOpenJobs = useCallback(() => {
    if (!signedIn) return;
    void getOpenJobsCountAction().then((res) => {
      if (res.ok) setOpenJobs(res.data.count);
    });
  }, [signedIn]);

  useEffect(() => {
    loadOpenJobs();
  }, [loadOpenJobs, pathname]);

  useEffect(() => {
    if (!signedIn) return;
    window.addEventListener("focus", loadOpenJobs);
    return () => window.removeEventListener("focus", loadOpenJobs);
  }, [loadOpenJobs, signedIn]);

  function renderNav(compact: boolean) {
    return (
      <nav
        className={cn("flex-1 space-y-1 py-4", compact ? "px-2" : "px-4")}
        aria-label="Main"
      >
        {NAV_ITEMS.map(({ label, href, icon }) => {
          const Icon = ICON_MAP[icon];
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={compact ? label : undefined}
              aria-label={compact ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "abt-nav-item",
                // px-3/gap-2.5 rather than px-4/gap-3: the 250px column leaves
                // 154px for the label at px-4, and "Events And Workshops" needs
                // ~144px at 14px — close enough that it wrapped to a second
                // line and made that row taller than the rest. This buys 10px.
                compact ? "justify-center px-2" : "gap-2.5 px-3",
                active ? HUB_NAV_ACTIVE_CLASS : HUB_NAV_IDLE_CLASS,
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {/* `whitespace-nowrap` so a long label can never wrap this row to
                  two lines; `truncate` keeps the failure mode contained to an
                  ellipsis inside the column rather than text spilling out. */}
              <span
                className={cn(
                  "min-w-0 truncate whitespace-nowrap",
                  compact && "sr-only",
                )}
              >
                {label}
              </span>
              {/* Only Jobs carries a count today. Hidden while collapsed —
                  there is no room beside a centred icon — and hidden at zero,
                  because an empty board is not news worth a badge. */}
              {href === "/jobs" && !compact && openJobs !== null && openJobs > 0 ? (
                <span className="abt-nav-count" aria-hidden>
                  {openJobs}
                </span>
              ) : null}
              {href === "/jobs" && openJobs !== null && openJobs > 0 ? (
                <span className="sr-only">{`, ${openJobs} open`}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  function renderFooter(compact: boolean) {
    // A signed-out visitor has no name, no avatar and nothing to sign out of —
    // showing the tile would render a stranger back to themselves as "User".
    if (!signedIn) {
      return (
        <div
          className={cn(
            "mt-auto",
            compact
              ? "flex shrink-0 flex-col items-center gap-3 border-t border-[#E0E0E0] p-3"
              : "flex shrink-0 flex-col justify-center border-t border-[#E0E0E0] p-4",
          )}
        >
          <Link
            href="/login"
            onClick={onNavigate}
            title={compact ? "Log in" : undefined}
            aria-label={compact ? "Log in" : undefined}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-[#E0E0E0] text-sm font-medium text-[#4B4B4B] transition-[border-color,background-color,color] duration-200 ease-[var(--ease-spark)] hover:border-[#03535F] hover:bg-[#03535F]/10 hover:text-[#03535F]",
              compact ? "size-9 p-0" : "w-full px-3 py-2",
            )}
          >
            <LogIn className="size-4" aria-hidden />
            <span className={cn(compact && "sr-only")}>Log in</span>
          </Link>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "mt-auto",
          compact
            ? "flex shrink-0 flex-col items-center gap-3 border-t border-[#E0E0E0] p-3"
            : SIDEBAR_FOOTER_ROW_CLASS,
        )}
      >
        <div
          className={cn(
            "flex items-center",
            compact ? "justify-center" : "gap-3",
          )}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E9E9E9] text-xs font-semibold text-[#353535]"
              aria-hidden
            >
              {initials(displayName)}
            </span>
          )}
          {!compact ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-black">
                {displayName}
              </p>
              <p className="truncate text-xs text-[#4B4B4B]">{user.email}</p>
            </div>
          ) : null}
        </div>
        <form action={signOutAction} className={cn(!compact && "mt-3")}>
          <button
            type="submit"
            title={compact ? "Sign out" : undefined}
            aria-label={compact ? "Sign out" : undefined}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-[#E0E0E0] text-sm font-medium text-[#4B4B4B] transition-[border-color,background-color,color] duration-200 ease-[var(--ease-spark)] hover:border-[#03535F] hover:bg-[#03535F]/10 hover:text-[#03535F]",
              compact ? "size-9 p-0" : "w-full px-3 py-2",
            )}
          >
            <LogOut className="size-4" aria-hidden />
            <span className={cn(compact && "sr-only")}>Sign out</span>
          </button>
        </form>
      </div>
    );
  }

  const expandedContent = (
    <>
      <div className={cn(SIDEBAR_BRAND_ROW_CLASS, "justify-start gap-2")}>
        {collapsible && onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="abt-sidebar-toggle hidden size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F] md:inline-flex"
          >
            <SidebarToggleIcon className="size-5" />
          </button>
        ) : null}
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="inline-flex h-8 items-center"
        >
          <Image
            src="/abtalks-logo.png"
            alt="ABTalks"
            width={120}
            height={32}
            className="block h-7 w-auto brightness-0"
          />
        </Link>
      </div>
      {renderNav(false)}
      {/* Drawer-only: below `md` the header drops its Admin pill, so this is
          the only route into /admin on a phone. `md:hidden` keeps it out of the
          desktop sidebar, where the header pill still shows. */}
      {isAdmin ? (
        <div className="px-4 pb-2 md:hidden">
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn("abt-nav-item gap-2.5 px-3", HUB_NAV_IDLE_CLASS)}
          >
            <Shield className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate whitespace-nowrap">Admin</span>
          </Link>
        </div>
      ) : null}
      {renderFooter(false)}
    </>
  );

  const collapsedContent = (
    <>
      <div className="flex h-[55px] shrink-0 items-center justify-center border-b border-[#E9E9E9]">
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={false}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="abt-sidebar-toggle flex size-9 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]"
          >
            <SidebarToggleIcon className="size-5" />
          </button>
        ) : (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            aria-label="ABTalks dashboard"
            className="relative block h-6 w-[28px] overflow-hidden"
          >
            <Image
              src="/abtalks-logo.png"
              alt=""
              width={120}
              height={32}
              className="absolute left-0 top-1/2 h-6 w-auto max-w-none -translate-y-1/2 brightness-0"
            />
          </Link>
        )}
      </div>
      {renderNav(true)}
      {renderFooter(true)}
    </>
  );

  const desktopWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_CLASS
    : SIDEBAR_WIDTH_CLASS;

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden border-r border-[#E9E9E9] bg-white md:flex",
          "transition-[width] duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width]",
          desktopWidth,
        )}
      >
        <div className="relative h-full w-full">
          <div
            aria-hidden={isCollapsed}
            className={cn(
              "absolute inset-0 flex flex-col overflow-y-auto transition-[opacity] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              isCollapsed
                ? "pointer-events-none opacity-0"
                : "opacity-100 delay-[140ms]",
            )}
          >
            {expandedContent}
          </div>
          <div
            aria-hidden={!isCollapsed}
            className={cn(
              "absolute inset-0 flex flex-col overflow-y-auto transition-[opacity] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              isCollapsed
                ? "opacity-100 delay-[140ms]"
                : "pointer-events-none opacity-0",
            )}
          >
            {collapsedContent}
          </div>
        </div>
      </aside>

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto border-r border-[#E9E9E9] bg-white transition-transform duration-200 md:hidden",
          SIDEBAR_WIDTH_CLASS,
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {expandedContent}
      </aside>
    </>
  );
}
