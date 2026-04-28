"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TimeRange } from "@/features/admin/get-analytics-data";

export function AnalyticsRangeFilter({ value }: { value: TimeRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("range", next);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="w-fit"
    >
      <TabsList>
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="weekly">Weekly</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
