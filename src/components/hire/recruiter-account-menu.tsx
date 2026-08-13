"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecruiterAccountSnapshot } from "@/features/hire/recruiter-account-types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Sent",
  IN_REVIEW: "In review",
  CONTACT_SHARED: "Contact shared",
  DECLINED: "Declined",
  CLOSED: "Closed",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function RecruiterAccountMenu({
  account,
}: {
  account: RecruiterAccountSnapshot;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="Open recruiter menu"
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-sm outline-none",
          "hover:bg-muted aria-expanded:bg-muted",
        )}
      >
        <Avatar className="size-8 ring-1 ring-border">
          <AvatarFallback>{initials(account.fullName)}</AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
          <span className="max-w-[140px] truncate font-medium">
            {account.fullName}
          </span>
          <span className="max-w-[160px] truncate text-xs text-muted-foreground">
            {account.company}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {account.fullName}
              </span>
              <span className="truncate text-xs">
                {account.company}
                {account.email ? ` · ${account.email}` : ""}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Wishlist
            {account.cartCount > 0 ? ` (${account.cartCount})` : ""}
          </DropdownMenuLabel>
          {account.cart.length === 0 ? (
            <p className="px-1.5 py-1.5 text-xs text-muted-foreground">
              No candidates saved yet.
            </p>
          ) : (
            account.cart.map((item) => (
              <DropdownMenuItem
                key={item.memberId}
                render={<Link href={`/talent/members/${item.memberId}`} />}
                className="cursor-pointer"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{item.publicId}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.jobRole}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuItem
            render={<Link href="/talent/shortlist" />}
            className="cursor-pointer text-primary"
          >
            {account.cartCount > account.cart.length
              ? `View all ${account.cartCount} in cart`
              : "Open cart"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Requests
            {account.requestCount > 0 ? ` (${account.requestCount})` : ""}
          </DropdownMenuLabel>
          {account.requests.length === 0 ? (
            <p className="px-1.5 py-1.5 text-xs text-muted-foreground">
              No introductions requested yet.
            </p>
          ) : (
            account.requests.map((item) => (
              <DropdownMenuItem
                key={item.id}
                render={<Link href="/hire/requests" />}
                className="cursor-pointer"
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.publicId}</span>
                    {item.jobRole && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.jobRole}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuItem
            render={<Link href="/hire/requests" />}
            className="cursor-pointer text-primary"
          >
            {account.requestCount > account.requests.length
              ? `View all ${account.requestCount} requests`
              : "Open requests"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <form action={signOutAction} className="p-1">
          <button
            type="submit"
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
