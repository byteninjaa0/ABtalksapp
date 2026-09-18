"use client";

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

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col">
      <nav className="flex-1 space-y-6">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.id}>
            {group.label ? (
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

      <div className="mt-auto space-y-3 border-t border-[#E9E9E9] pt-4">
        <p className="px-4 text-xs leading-5 text-[#8F8F8F]">
          View As is not enabled. Sign in as the person you need to inspect.
        </p>
        <Link
          href="/"
          className="block px-4 text-xs font-medium text-[#03535F] hover:underline"
        >
          ← Back to ABTalks
        </Link>
      </div>
    </aside>
  );
}
