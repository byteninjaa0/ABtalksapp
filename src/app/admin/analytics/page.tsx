import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { AnalyticsRangeFilter } from "@/components/admin/analytics-range-filter";
import {
  getAnalyticsData,
  type TimeRange,
} from "@/features/admin/get-analytics-data";

function parseRange(input: string | undefined): TimeRange {
  if (input === "weekly" || input === "monthly" || input === "daily") {
    return input;
  }
  return "daily";
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const data = await getAnalyticsData(range);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Registration, engagement, drop-off, and performance metrics.
        </p>
      </div>
      <AnalyticsRangeFilter value={range} />
      <AnalyticsDashboard data={data} />
    </div>
  );
}
