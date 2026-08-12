"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CaseResult } from "./use-pyodide-runner";

type Props = {
  results: CaseResult[];
  sampleOrdinals?: number[];
};

export function PracticeTestResults({ results, sampleOrdinals }: Props) {
  if (results.length === 0) return null;

  const sampleSet = sampleOrdinals ? new Set(sampleOrdinals) : null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Trailing whitespace is ignored when comparing output.
      </p>
      <ul className="space-y-2">
        {results.map((row) => {
          const isSample = sampleSet?.has(row.ordinal) ?? false;
          return (
            <li
              key={row.ordinal}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                row.passed
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  Case {row.ordinal}
                  {isSample ? " (sample)" : ""}
                </span>
                <Badge variant={row.passed ? "secondary" : "destructive"}>
                  {row.passed ? "Passed" : row.stderr ? "Runtime error" : "Failed"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {row.runtimeMs} ms
                </span>
              </div>
              {!row.passed && row.reason ? (
                <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p>
              ) : null}
              {!row.passed && row.stdout ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/60 p-2 text-xs">
                  {row.stdout}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
