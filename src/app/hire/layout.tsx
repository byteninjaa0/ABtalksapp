import type { ReactNode } from "react";
import Link from "next/link";
import { requireRecruiter } from "@/lib/program-auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HireLayout({ children }: { children: ReactNode }) {
  await requireRecruiter();

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              ABTalks Hire
            </p>
            <h1 className="font-display text-lg font-semibold">Scout</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/hire"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              New search
            </Link>
            <Link
              href="/talent"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Browse pool
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
