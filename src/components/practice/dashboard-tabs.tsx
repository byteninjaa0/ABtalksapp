"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = { enrollmentId: string | null };

export function DashboardTabs({ enrollmentId }: Props) {
  const pathname = usePathname();
  const practiceActive = pathname === "/dashboard/practice" || pathname.startsWith("/dashboard/practice/");

  const overviewHref = enrollmentId
    ? `/dashboard?challenge=${encodeURIComponent(enrollmentId)}`
    : "/dashboard";

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex gap-2 border-b border-border/60 pb-3"
    >
      <Link
        href={overviewHref}
        className={cn(
          buttonVariants({ variant: practiceActive ? "ghost" : "secondary", size: "sm" }),
          !practiceActive && "pointer-events-none",
        )}
        aria-current={!practiceActive ? "page" : undefined}
      >
        Overview
      </Link>
      <Link
        href="/dashboard/practice"
        className={cn(
          buttonVariants({ variant: practiceActive ? "secondary" : "ghost", size: "sm" }),
          practiceActive && "pointer-events-none",
        )}
        aria-current={practiceActive ? "page" : undefined}
      >
        Practice
      </Link>
    </nav>
  );
}
