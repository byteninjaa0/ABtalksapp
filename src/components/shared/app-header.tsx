"use client";

import { Domain } from "@prisma/client";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type AppHeaderUser = {
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  isAdmin?: boolean;
};

type Props = {
  user: AppHeaderUser;
  /** Student track; omit when user has no profile yet (e.g. OAuth before registration). */
  domain?: Domain | null;
};

function displayLabel(user: AppHeaderUser): string {
  return user.name?.trim() || user.email || "User";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function domainBadgeTitle(domain: Domain): string {
  switch (domain) {
    case Domain.AI:
      return "Artificial Intelligence";
    case Domain.DS:
      return "Data Science";
    case Domain.SE:
      return "Software Engineering";
    default:
      return domain;
  }
}

function domainBadgeClasses(domain: Domain): string {
  switch (domain) {
    case Domain.AI:
      return "border-domains-ai/50 bg-domains-ai-bg text-domains-ai";
    case Domain.DS:
      return "border-domains-ds/50 bg-domains-ds-bg text-domains-ds";
    case Domain.SE:
      return "border-domains-se/50 bg-domains-se-bg text-domains-se";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function AppHeader({ user, domain }: Props) {
  const router = useRouter();
  const label = displayLabel(user);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 py-3 pr-6 pl-6 shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-8">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="font-display text-xl font-bold tracking-tight text-foreground"
          >
            <span className="text-primary">A</span>BTalks
          </Link>
          {domain ? (
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full border px-3 py-1 text-sm font-bold tracking-wide",
                domainBadgeClasses(domain),
              )}
              title={domainBadgeTitle(domain)}
            >
              {domain}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          {user.isAdmin ? (
            <Link
              href="/admin"
              className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              Admin
            </Link>
          ) : null}
          <ThemeToggle />
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className={cn(
                "inline-flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/25 aria-expanded:bg-muted",
              )}
            >
              <Avatar className="size-9 ring-2 ring-border/80">
                {user.image ? (
                  <AvatarImage src={user.image} alt="" />
                ) : null}
                <AvatarFallback>{initials(label)}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
                <span className="max-w-[160px] truncate font-medium">{label}</span>
                <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Role: {user.role}
                    </span>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  window.location.href =
                    "mailto:sksohail.swaraj@gmail.com?subject=ABTalks Issue Report&body=Please describe the issue you're experiencing:%0D%0A%0D%0A";
                }}
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Report an Issue
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={signOutAction} className="p-1">
                <button
                  type="submit"
                  className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  Logout
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
