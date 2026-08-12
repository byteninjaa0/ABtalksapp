"use client";

import { useMemo, useState, useTransition } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { submitPracticeAttemptAction } from "@/app/actions/practice-actions";
import { PracticeTestResults } from "./practice-test-results";
import {
  usePyodideRunner,
  type CaseResult,
} from "./use-pyodide-runner";

export type WorkspaceTestCase = {
  ordinal: number;
  isSample: boolean;
  input: string;
  expected: string;
  explanation: string | null;
};

type Props = {
  problemId: string;
  slug: string;
  title: string;
  starterCode: string;
  maxScore: number;
  difficulty: string;
  testCases: WorkspaceTestCase[];
};

type SubmitSummary = {
  isFirstSolve: boolean;
  scoreAwarded: number;
  synergyAwarded: number;
  synergyCapped: boolean;
  status: string;
  testsPassed: number;
  testsTotal: number;
};

export function PracticeProblemWorkspace({
  problemId,
  starterCode,
  maxScore,
  difficulty,
  testCases,
}: Props) {
  const { status, errorMessage, run } = usePyodideRunner();
  const [code, setCode] = useState(starterCode);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitSummary, setSubmitSummary] = useState<SubmitSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const sampleCases = useMemo(
    () => testCases.filter((c) => c.isSample),
    [testCases],
  );
  const sampleOrdinals = useMemo(
    () => sampleCases.map((c) => c.ordinal),
    [sampleCases],
  );

  const ready = status === "ready" && !isPending;

  function statusLabel(): string {
    if (status === "booting") return "Preparing Python runtime…";
    if (status === "running") return "Running…";
    if (status === "timeout") return "Timed out";
    if (status === "error") return "Runtime error";
    return "Ready";
  }

  async function handleRun() {
    setLocalError(null);
    setSubmitSummary(null);
    const cases =
      sampleCases.length > 0
        ? sampleCases
        : testCases.slice(0, 1);
    const next = await run(
      code,
      cases.map((c) => ({
        ordinal: c.ordinal,
        input: c.input,
        expected: c.expected,
      })),
    );
    setResults(next);
  }

  function handleSubmit() {
    setLocalError(null);
    startTransition(async () => {
      const next = await run(
        code,
        testCases.map((c) => ({
          ordinal: c.ordinal,
          input: c.input,
          expected: c.expected,
        })),
      );
      setResults(next);

      const totalRuntime = next.reduce((sum, r) => sum + r.runtimeMs, 0);
      const result = await submitPracticeAttemptAction({
        problemId,
        sourceCode: code,
        reported: next.map((r) => ({
          ordinal: r.ordinal,
          passed: r.passed,
        })),
        runtimeMs: totalRuntime,
      });

      if (!result.ok) {
        setLocalError(result.message);
        setSubmitSummary(null);
        return;
      }

      setSubmitSummary({
        isFirstSolve: result.data.isFirstSolve,
        scoreAwarded: result.data.scoreAwarded,
        synergyAwarded: result.data.synergyAwarded,
        synergyCapped: result.data.synergyCapped,
        status: result.data.status,
        testsPassed: result.data.testsPassed,
        testsTotal: result.data.testsTotal,
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{difficulty}</Badge>
          <span className="text-sm text-muted-foreground">{maxScore} pts</span>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {statusLabel()}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <CodeMirror
          value={code}
          height="320px"
          extensions={[python()]}
          onChange={(value) => setCode(value)}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Trailing whitespace is ignored when comparing output.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => void handleRun()}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Run
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={handleSubmit}
          className={cn(buttonVariants())}
        >
          Submit
        </button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {localError ? (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      ) : null}

      {submitSummary ? (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          {submitSummary.status === "ACCEPTED" && submitSummary.isFirstSolve ? (
            submitSummary.synergyCapped ? (
              <p>
                Solved. Daily synergy cap reached, so no points this time; your
                practice score still counts. (+{submitSummary.scoreAwarded}{" "}
                practice score)
              </p>
            ) : (
              <p>
                Solved. +{submitSummary.scoreAwarded} practice score
                {submitSummary.synergyAwarded > 0
                  ? `, +${submitSummary.synergyAwarded} synergy`
                  : ""}
                .
              </p>
            )
          ) : submitSummary.status === "ACCEPTED" ? (
            <p>
              Accepted again ({submitSummary.testsPassed}/
              {submitSummary.testsTotal}). No additional score or synergy.
            </p>
          ) : (
            <p>
              {submitSummary.status.replaceAll("_", " ")} —{" "}
              {submitSummary.testsPassed}/{submitSummary.testsTotal} passed.
            </p>
          )}
        </div>
      ) : null}

      <PracticeTestResults results={results} sampleOrdinals={sampleOrdinals} />
    </div>
  );
}
