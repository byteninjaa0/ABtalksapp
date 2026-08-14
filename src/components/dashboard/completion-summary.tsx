import Link from "next/link";
import { CheckCircle2, Flame } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  domainLabel: string;
  daysCompleted: number;
  totalDays: number;
  longestStreak: number;
  hasCertificate: boolean;
};

export function CompletionSummary({
  domainLabel,
  daysCompleted,
  totalDays,
  longestStreak,
  hasCertificate,
}: Props) {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2
            className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <CardTitle className="font-display text-2xl">
            60 days complete
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/60 bg-muted/25 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {domainLabel}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {daysCompleted}/{totalDays}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Flame className="size-3.5 text-orange-500" aria-hidden />
              Longest streak
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {longestStreak}
            </p>
          </div>
        </div>

        {hasCertificate ? (
          <Link
            href="/achievements"
            className="focus-spark flex w-full items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <span>
              Your certificate is ready · Download or share the link
            </span>
          </Link>
        ) : (
          <p className="rounded-xl border border-border/60 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
            Certificate is being issued
          </p>
        )}
      </CardContent>
    </Card>
  );
}
