"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  ClipboardList,
  Code2,
  Coins,
  FileText,
  FolderSearch,
  Gift,
  GraduationCap,
  LayoutDashboard,
  Link2,
  Mail,
  Megaphone,
  Menu,
  Package,
  Presentation,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  ADMIN_NAV_GROUPS,
  isAdminNavActive,
  type AdminNavIcon,
} from "@/features/admin/admin-nav";
import { cn } from "@/lib/utils";

const iconMap: Record<AdminNavIcon, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  search: Search,
  students: Users,
  recruiters: UserPlus,
  credits: Coins,
  assessments: ClipboardList,
  jobs: Briefcase,
  communications: Mail,
  audit: ScrollText,
  delivery: Send,
  settings: Settings,
  notifications: Bell,
  submissions: FileText,
  content: BookOpen,
  analytics: BarChart3,
  ambassadors: Megaphone,
  referrals: Gift,
  hackathonLinks: Link2,
  redemptions: Package,
  dataRequests: ShieldCheck,
  program: GraduationCap,
  cohort: GraduationCap,
  hackathon: Code2,
  workshop: Presentation,
  "mock-interview": Presentation,
  talentProjects: FolderSearch,
  platformAdmins: ShieldCheck,
  hire: Briefcase,
  gamification: Trophy,
};

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="mb-2 flex items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-card"
        aria-label="Open admin menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close admin menu"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col border-r bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">
                Platform Admin
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-accent"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto">
              {ADMIN_NAV_GROUPS.map((group) => (
                <div key={group.id}>
                  {group.id !== "console" && group.label ? (
                    <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">
                      {group.label}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = iconMap[item.icon];
                      const isActive = isAdminNavActive(pathname, item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "abt-nav-item gap-3 px-4",
                            isActive ? "abt-nav-active" : "abt-nav-idle",
                          )}
                        >
                          <Icon className="size-5 shrink-0" aria-hidden />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="mt-4 border-t border-[#E9E9E9] pt-4 text-xs font-medium text-[#03535F] hover:underline"
            >
              ← Back to ABTalks
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
