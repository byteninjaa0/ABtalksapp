"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  useEffect(() => {
    document.body.classList.toggle("landing-page", isLanding);
    return () => document.body.classList.remove("landing-page");
  }, [isLanding]);

  // Design System v2 is light-only: every route, Marketplace and Hackathon
  // included, renders on the one forest-green light theme.
  return (
    <main className="theme-klymb-light theme-klymb-brand flex-1">
      {children}
    </main>
  );
}
