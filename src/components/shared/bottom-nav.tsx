"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Briefcase, Compass, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/mission", label: "Our Mission", Icon: Compass },
  { href: "/profile", label: "Profile", Icon: User },
] as const;

function isTabActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return (
      pathname === "/dashboard" || pathname.startsWith("/challenge/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  if (
    pathname === "/" ||
    /^\/(login|register|claude-signup|students)(\/|$)/.test(pathname)
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:hidden"
      aria-hidden={false}
    >
      <nav
        aria-label="Main navigation"
        className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-1 rounded-full border border-border/40 bg-card/70 px-2 py-1.5 shadow-lg shadow-black/10 backdrop-blur-xl dark:bg-card/60 dark:shadow-black/40"
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = isTabActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-spark relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-xs transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  className="absolute inset-0 rounded-full bg-primary/15"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              ) : null}
              <Icon className="relative size-5" aria-hidden />
              <span className="relative text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
