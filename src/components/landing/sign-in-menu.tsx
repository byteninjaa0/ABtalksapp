"use client";

import Link from "next/link";
import { ChevronDown, GraduationCap, Briefcase } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Two doors behind one Sign in button.
 *
 * The choice only decides which copy is shown and where a successful sign-in
 * lands. It grants nothing: recruiter access comes from a verified seat looked
 * up server-side, so picking "For recruiters" here gets a candidate no further
 * than picking the other one.
 */
export function SignInMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(buttonVariants({ variant: "ghost" }), "h-10 gap-1.5")}
      >
        Sign in
        <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* Base UI requires group parts to live inside a Group — a bare
            DropdownMenuLabel throws MenuGroupRootContext is missing at runtime,
            which type-checks and builds perfectly well. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            How are you joining?
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={<Link href="/login" />}
          className="cursor-pointer gap-2.5 py-2.5"
        >
          <GraduationCap
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="flex flex-col">
            <span className="font-medium">For candidates</span>
            <span className="text-xs text-muted-foreground">
              Build proof of work and get discovered
            </span>
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/talent/register" />}
          className="cursor-pointer gap-2.5 py-2.5"
        >
          <Briefcase
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="flex flex-col">
            <span className="font-medium">For recruiters</span>
            <span className="text-xs text-muted-foreground">
              Register, or sign in with your work email
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
