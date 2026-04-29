"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type LeaderboardRow = {
  userId: string;
  fullName: string;
  college: string;
  domain: "AI" | "DS" | "SE";
  daysCompleted: number;
  currentStreak: number;
  longestStreak: number;
  isReadyForInterview: boolean;
  rank: number;
  isViewer: boolean;
};

type Props = {
  rows: LeaderboardRow[];
  totalCount: number;
  colleges: string[];
  filters: {
    domain: "AI" | "DS" | "SE" | "ALL";
    college: string;
    search: string;
  };
};

function rankDisplay(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return rank;
}

function domainBadgeClass(domain: "AI" | "DS" | "SE"): string {
  if (domain === "AI") return "border-domains-ai/50 bg-domains-ai-bg text-domains-ai";
  if (domain === "DS") return "border-domains-ds/50 bg-domains-ds-bg text-domains-ds";
  return "border-domains-se/50 bg-domains-se-bg text-domains-se";
}

export function CommunityLeaderboard({
  rows,
  totalCount,
  colleges,
  filters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  function updateParams(next: {
    domain?: string | null;
    college?: string | null;
    search?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const domain = next.domain ?? filters.domain;
    const college = next.college ?? filters.college;
    const searchValue = next.search ?? filters.search;

    if (!domain || domain === "ALL") params.delete("lb_domain");
    else params.set("lb_domain", domain);

    if (!college) params.delete("lb_college");
    else params.set("lb_college", college);

    if (!searchValue) params.delete("lb_search");
    else params.set("lb_search", searchValue);

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      const trimmed = search.trim();
      if (trimmed !== filters.search) {
        updateParams({ search: trimmed });
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, filters.search]);

  const hasActiveFilters = useMemo(
    () => filters.domain !== "ALL" || !!filters.college || !!filters.search,
    [filters.college, filters.domain, filters.search],
  );

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>Community Leaderboard</CardTitle>
          <CardDescription>{totalCount} students total</CardDescription>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="w-full space-y-1 md:min-w-[160px] md:flex-1">
            <Label htmlFor="lb-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lb-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name"
                className="w-full pl-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:w-[340px] md:shrink-0">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Domain</Label>
              <Select
                value={filters.domain}
                onValueChange={(value) => updateParams({ domain: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Domains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Domains</SelectItem>
                  <SelectItem value="AI">AI</SelectItem>
                  <SelectItem value="DS">DS</SelectItem>
                  <SelectItem value="SE">SE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">College</Label>
              <Select
                value={filters.college || "ALL"}
                onValueChange={(value) =>
                  updateParams({ college: value === "ALL" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Colleges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Colleges</SelectItem>
                  {colleges.map((college) => (
                    <SelectItem key={college} value={college}>
                      {college}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {hasActiveFilters ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                updateParams({ domain: "ALL", college: "", search: "" });
              }}
              className="h-7 px-2 text-xs"
            >
              <X className="mr-1 size-3" />
              Clear filters
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-y-auto rounded-xl border border-border/60 md:h-[500px]">
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                No students match your search. Try different filters or clear them.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  updateParams({ domain: "ALL", college: "", search: "" });
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((row) => {
                const href = row.isViewer ? "/profile" : `/students/${row.userId}`;
                return (
                  <li key={row.userId}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
                        row.isViewer && "bg-primary/5",
                      )}
                    >
                      <span className="w-10 shrink-0 text-center font-display text-2xl font-bold text-muted-foreground">
                        {rankDisplay(row.rank)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium sm:text-base">
                          {row.fullName}
                          {row.isViewer ? (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="w-16 shrink-0 text-right">
                        <Badge variant="outline" className={domainBadgeClass(row.domain)}>
                          {row.domain}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {isPending ? (
          <p className="mt-2 text-xs text-muted-foreground">Updating leaderboard...</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
