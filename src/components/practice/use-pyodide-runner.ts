"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PRACTICE_BOOT_TIMEOUT_MS,
  PRACTICE_RUN_TIMEOUT_MS,
  PYODIDE_CDN_BASE,
} from "@/features/practice/constants";

export type PyodideRunnerStatus =
  | "booting"
  | "ready"
  | "running"
  | "timeout"
  | "error";

export type RunnerCase = {
  ordinal: number;
  input: string;
  expected: string;
};

export type CaseResult = {
  ordinal: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  runtimeMs: number;
  reason?: string;
};

type WorkerReadyMessage = { type: "ready" };
type WorkerBootErrorMessage = { type: "boot-error"; message: string };
type WorkerResultsMessage = {
  type: "results";
  results: {
    ordinal: number;
    stdout: string;
    stderr: string;
    runtimeMs: number;
  }[];
};

type WorkerMessage =
  | WorkerReadyMessage
  | WorkerBootErrorMessage
  | WorkerResultsMessage;

/** Normalize stdout/expected for comparison: rstrip lines, drop trailing blanks. */
export function normalizeOutput(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/\s+$/u, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function usePyodideRunner() {
  const [status, setStatus] = useState<PyodideRunnerStatus>("booting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResolveRef = useRef<((results: CaseResult[]) => void) | null>(
    null,
  );
  const pendingCasesRef = useRef<RunnerCase[] | null>(null);
  const generationRef = useRef(0);

  const clearRunTimer = useCallback(() => {
    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
      runTimerRef.current = null;
    }
  }, []);

  const clearBootTimer = useCallback(() => {
    if (bootTimerRef.current) {
      clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
  }, []);

  const spawnWorker = useCallback(() => {
    clearBootTimer();
    clearRunTimer();
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // Status updates from worker message handlers / boot timer only — avoid
    // synchronous setState when spawnWorker is invoked from an effect.
    setErrorMessage(null);
    const generation = ++generationRef.current;

    const worker = new Worker("/practice/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (generation !== generationRef.current) return;
      const data = event.data;
      if (data.type === "ready") {
        clearBootTimer();
        setStatus("ready");
        return;
      }
      if (data.type === "boot-error") {
        clearBootTimer();
        setStatus("error");
        setErrorMessage(data.message);
        return;
      }
      if (data.type === "results") {
        clearRunTimer();
        const cases = pendingCasesRef.current ?? [];
        const byOrdinal = new Map(data.results.map((r) => [r.ordinal, r]));
        const mapped: CaseResult[] = cases.map((c) => {
          const raw = byOrdinal.get(c.ordinal);
          if (!raw) {
            return {
              ordinal: c.ordinal,
              passed: false,
              stdout: "",
              stderr: "Missing result",
              runtimeMs: 0,
              reason: "Missing result",
            };
          }
          if (raw.stderr.trim().length > 0) {
            return {
              ordinal: c.ordinal,
              passed: false,
              stdout: raw.stdout,
              stderr: raw.stderr,
              runtimeMs: raw.runtimeMs,
              reason: raw.stderr,
            };
          }
          const passed =
            normalizeOutput(raw.stdout) === normalizeOutput(c.expected);
          return {
            ordinal: c.ordinal,
            passed,
            stdout: raw.stdout,
            stderr: raw.stderr,
            runtimeMs: raw.runtimeMs,
            reason: passed ? undefined : "Wrong answer",
          };
        });
        pendingCasesRef.current = null;
        const resolve = pendingResolveRef.current;
        pendingResolveRef.current = null;
        setStatus("ready");
        resolve?.(mapped);
      }
    };

    worker.onerror = (err) => {
      if (generation !== generationRef.current) return;
      clearBootTimer();
      clearRunTimer();
      setStatus("error");
      setErrorMessage(err.message || "Worker failed");
    };

    bootTimerRef.current = setTimeout(() => {
      if (generation !== generationRef.current) return;
      setStatus("error");
      setErrorMessage("Python runtime failed to start. Refresh and try again.");
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    }, PRACTICE_BOOT_TIMEOUT_MS);

    worker.postMessage({ type: "boot", indexURL: PYODIDE_CDN_BASE });
  }, [clearBootTimer, clearRunTimer]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStatus("booting");
      spawnWorker();
    });
    return () => {
      cancelled = true;
      generationRef.current += 1;
      clearBootTimer();
      clearRunTimer();
      pendingResolveRef.current = null;
      pendingCasesRef.current = null;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [spawnWorker, clearBootTimer, clearRunTimer]);

  const run = useCallback(
    (code: string, cases: RunnerCase[]): Promise<CaseResult[]> => {
      return new Promise((resolve) => {
        if (!workerRef.current || status !== "ready") {
          resolve(
            cases.map((c) => ({
              ordinal: c.ordinal,
              passed: false,
              stdout: "",
              stderr: "Runtime not ready",
              runtimeMs: 0,
              reason: "Runtime not ready",
            })),
          );
          return;
        }

        setStatus("running");
        setErrorMessage(null);
        pendingResolveRef.current = resolve;
        pendingCasesRef.current = cases;

        clearRunTimer();
        runTimerRef.current = setTimeout(() => {
          setStatus("timeout");
          setErrorMessage(
            "Timed out after 5s — check for an infinite loop",
          );
          const timedOut: CaseResult[] = cases.map((c) => ({
            ordinal: c.ordinal,
            passed: false,
            stdout: "",
            stderr: "Timed out after 5s — check for an infinite loop",
            runtimeMs: PRACTICE_RUN_TIMEOUT_MS,
            reason: "Timed out after 5s — check for an infinite loop",
          }));
          pendingCasesRef.current = null;
          const pending = pendingResolveRef.current;
          pendingResolveRef.current = null;
          pending?.(timedOut);
          setStatus("booting");
          spawnWorker();
        }, PRACTICE_RUN_TIMEOUT_MS);

        workerRef.current.postMessage({
          type: "run",
          code,
          cases: cases.map((c) => ({ ordinal: c.ordinal, input: c.input })),
        });
      });
    },
    [status, clearRunTimer, spawnWorker],
  );

  return { status, errorMessage, run };
}
