"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  AArrowDown,
  AArrowUp,
  ArrowLeftRight,
  CheckCircle2,
  Columns2,
  LayoutTemplate,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Rows2,
  Send,
} from "lucide-react";
import type {
  CodeLanguageId,
  TestRunResult,
} from "@/features/code-runner/languages";
import { cn } from "@/lib/utils";
import { TestResults } from "./test-results";

const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[240px] animate-pulse bg-[#F4F4F4]" />
  ),
});

export type RunOutcome =
  | { ok: true; data: TestRunResult }
  | { ok: false; message: string };

/**
 * What a Submit came back with. `result` is null when nothing was run (for
 * example the question was already solved). `note` is shown above the results.
 */
export type SubmitOutcome =
  | {
      ok: true;
      data: { result: TestRunResult | null; note: string; solved: boolean };
    }
  | { ok: false; message: string };

/** One saved submission, ready to show. Plain data from the caller. */
export type WorkspaceSubmission = {
  languageLabel: string;
  submittedAtLabel: string;
  code: string;
};

type CodeInput = { language: CodeLanguageId; code: string };
/** `customInput` is set when the learner asked to run against their own input. */
type RunInput = CodeInput & { customInput?: string };

type CodeWorkspaceProps = {
  /** Shown on the left of the top bar, usually a breadcrumb. */
  header?: React.ReactNode;
  /** The problem statement, rendered by the caller (usually on the server). */
  statement: React.ReactNode;
  languages: { id: CodeLanguageId; label: string }[];
  starterCode: Partial<Record<CodeLanguageId, string>>;
  defaultLanguage: CodeLanguageId;
  /** Namespaces the per-language drafts kept in this browser. */
  storageKey: string;
  initialCode?: CodeInput | null;
  onRun: (input: RunInput) => Promise<RunOutcome>;
  /** Omit to hide Submit entirely. */
  onSubmit?: (input: CodeInput) => Promise<SubmitOutcome>;
  /** True when the caller already knows this question is solved. */
  solved?: boolean;
  /** Pass to show the Submissions tab. Omit to hide it. */
  submissions?: WorkspaceSubmission[];
  /** Pass to offer "Custom input". `example` shows the expected format. */
  customInput?: { example: string; hint: string };
};

type MobileTab = "problem" | "code" | "result";

type RunState =
  | { kind: "idle" }
  | { kind: "running"; action: "run" | "submit" }
  | {
      kind: "done";
      scope: "sample" | "all" | "custom";
      result: TestRunResult | null;
      note: string | null;
    }
  | { kind: "error"; message: string };

// ── Drafts (per question, per language, this browser only) ──────────────────

const DRAFT_SAVE_DELAY_MS = 500;

function draftKey(storageKey: string, language: CodeLanguageId): string {
  return `abt:code:${storageKey}:${language}`;
}

function readDraft(storageKey: string, language: CodeLanguageId): string | null {
  try {
    return window.localStorage.getItem(draftKey(storageKey, language));
  } catch {
    return null;
  }
}

function writeDraft(storageKey: string, language: CodeLanguageId, code: string) {
  try {
    window.localStorage.setItem(draftKey(storageKey, language), code);
  } catch {
    // Private mode or a full quota: the draft simply is not kept.
  }
}

function subscribeToNothing(): () => void {
  return () => {};
}

// ── Layout preferences (shared by every workspace in this browser) ──────────

type LayoutPrefs = {
  showStatement: boolean;
  /** Statement on the right, editor on the left. */
  swapped: boolean;
  /** Where the result panel sits relative to the editor. */
  resultSide: "bottom" | "right";
  fontSize: number;
  /** Statement width, percent of the workspace. */
  split: number;
  /** Editor share of the code column, percent. */
  editorSplit: number;
};

const DEFAULT_PREFS: LayoutPrefs = {
  showStatement: true,
  swapped: false,
  resultSide: "bottom",
  fontSize: 14,
  split: 42,
  editorSplit: 62,
};
const PREFS_KEY = "abt:code:layout";
const FONT_MIN = 12;
const FONT_MAX = 20;

const prefsListeners = new Set<() => void>();
let prefsRaw: string | null = null;
let prefsValue: LayoutPrefs = DEFAULT_PREFS;
/** Used when storage is unavailable, so the controls still work this visit. */
let prefsMemory: string | null = null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function parsePrefs(raw: string | null): LayoutPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof LayoutPrefs, unknown>>;
    const num = (v: unknown, fallback: number, min: number, max: number) =>
      typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
    return {
      showStatement: p.showStatement !== false,
      swapped: p.swapped === true,
      resultSide: p.resultSide === "right" ? "right" : "bottom",
      fontSize: num(p.fontSize, DEFAULT_PREFS.fontSize, FONT_MIN, FONT_MAX),
      split: num(p.split, DEFAULT_PREFS.split, 25, 65),
      editorSplit: num(p.editorSplit, DEFAULT_PREFS.editorSplit, 30, 85),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function getPrefs(): LayoutPrefs {
  let raw = prefsMemory;
  try {
    raw = window.localStorage.getItem(PREFS_KEY) ?? prefsMemory;
  } catch {
    // Storage blocked: fall back to this visit's memory.
  }
  if (raw !== prefsRaw) {
    prefsRaw = raw;
    prefsValue = parsePrefs(raw);
  }
  return prefsValue;
}

function savePrefs(patch: Partial<LayoutPrefs>) {
  const next = JSON.stringify({ ...getPrefs(), ...patch });
  prefsMemory = next;
  try {
    window.localStorage.setItem(PREFS_KEY, next);
  } catch {
    // Kept in memory only.
  }
  prefsListeners.forEach((listener) => listener());
}

function subscribePrefs(listener: () => void): () => void {
  prefsListeners.add(listener);
  return () => prefsListeners.delete(listener);
}

function serverPrefs(): LayoutPrefs {
  return DEFAULT_PREFS;
}

/**
 * Statement beside a code editor with Run, optional Submit and a result panel.
 *
 * Reusable: it has no idea where the question, the tests or the runner live.
 * The caller supplies `onRun` and, if it wants one, `onSubmit`. Drafts and
 * layout choices stay in this browser and nowhere else.
 */
export function CodeWorkspace({
  header,
  statement,
  languages,
  starterCode,
  defaultLanguage,
  storageKey,
  initialCode = null,
  onRun,
  onSubmit,
  solved = false,
  submissions,
  customInput,
}: CodeWorkspaceProps) {
  const [language, setLanguage] = useState<CodeLanguageId>(
    initialCode?.language ?? defaultLanguage,
  );
  // What the learner has typed in this visit, per language.
  const [edits, setEdits] = useState<Partial<Record<CodeLanguageId, string>>>(
    {},
  );
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [tab, setTab] = useState<MobileTab>("problem");
  const [panel, setPanel] = useState<"result" | "submissions">("result");
  // Set the moment a Submit is accepted, before the caller's data catches up.
  const [solvedNow, setSolvedNow] = useState(false);
  const isSolved = solved || solvedNow;
  const [useCustom, setUseCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  // A divider being dragged: shown live, saved when the pointer is released.
  const [drag, setDrag] = useState<{
    kind: "main" | "inner";
    value: number;
  } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, serverPrefs);
  const split = drag?.kind === "main" ? drag.value : prefs.split;
  const editorSplit = drag?.kind === "inner" ? drag.value : prefs.editorSplit;

  const fallbackFor = (lang: CodeLanguageId) =>
    initialCode?.language === lang ? initialCode.code : (starterCode[lang] ?? "");

  // A draft saved in this browser wins over the starter code. Read through
  // useSyncExternalStore so the server render (no storage) and the first
  // client render agree.
  const storedDraft = useSyncExternalStore(
    subscribeToNothing,
    () => readDraft(storageKey, language),
    () => null,
  );
  const code = edits[language] ?? storedDraft ?? fallbackFor(language);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function editCode(next: string) {
    setEdits((current) => ({ ...current, [language]: next }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => writeDraft(storageKey, language, next),
      DRAFT_SAVE_DELAY_MS,
    );
  }

  function changeLanguage(next: CodeLanguageId) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    writeDraft(storageKey, language, code);
    setLanguage(next);
  }

  function resetCode() {
    const starter = starterCode[language] ?? "";
    setEdits((current) => ({ ...current, [language]: starter }));
    writeDraft(storageKey, language, starter);
  }

  const running = run.kind === "running";
  const canRun = !running && code.trim().length > 0;

  async function runCode() {
    if (!canRun) return;
    const custom =
      customInput && useCustom && customText.trim().length > 0
        ? customText
        : undefined;
    setRun({ kind: "running", action: "run" });
    setTab("result");
    setPanel("result");
    const outcome = await onRun({ language, code, customInput: custom });
    setRun(
      outcome.ok
        ? {
            kind: "done",
            scope: custom === undefined ? "sample" : "custom",
            result: outcome.data,
            note: null,
          }
        : { kind: "error", message: outcome.message },
    );
  }

  async function submitCode() {
    if (!onSubmit || !canRun) return;
    setRun({ kind: "running", action: "submit" });
    setTab("result");
    setPanel("result");
    const outcome = await onSubmit({ language, code });
    if (!outcome.ok) {
      setRun({ kind: "error", message: outcome.message });
      return;
    }
    if (outcome.data.solved) setSolvedNow(true);
    setRun({
      kind: "done",
      scope: "all",
      result: outcome.data.result,
      note: outcome.data.note,
    });
  }

  // Ctrl/Cmd + Enter runs. Captured before the editor sees it, so it does not
  // also insert a blank line.
  function onKeyDownCapture(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      void runCode();
    }
  }

  function startDrag(e: React.PointerEvent, kind: "main" | "inner") {
    const box = (kind === "main" ? mainRef : innerRef).current;
    if (!box) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const horizontal = kind === "main" || prefs.resultSide === "right";
    const swapped = prefs.swapped;
    let latest: number | null = null;

    const move = (ev: PointerEvent) => {
      let share = horizontal
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      if (kind === "main" && swapped) share = 1 - share;
      latest =
        kind === "main" ? clamp(share * 100, 25, 65) : clamp(share * 100, 30, 85);
      setDrag({ kind, value: latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      if (latest !== null) {
        savePrefs(kind === "main" ? { split: latest } : { editorSplit: latest });
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const sideBySide = prefs.resultSide === "right";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3",
        drag ? "select-none" : "",
      )}
      onKeyDownCapture={onKeyDownCapture}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">{header}</div>
        <div className="flex items-center gap-0.5 rounded-xl border border-[#E0E0E0] bg-white p-1">
          <span className="hidden items-center gap-0.5 lg:flex">
            <ToolButton
              label={prefs.showStatement ? "Hide the problem" : "Show the problem"}
              pressed={!prefs.showStatement}
              onClick={() => savePrefs({ showStatement: !prefs.showStatement })}
            >
              {prefs.showStatement ? (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              )}
            </ToolButton>
            <ToolButton
              label="Swap the problem and the editor"
              pressed={prefs.swapped}
              onClick={() => savePrefs({ swapped: !prefs.swapped })}
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label={
                sideBySide
                  ? "Put the result below the editor"
                  : "Put the result beside the editor"
              }
              pressed={sideBySide}
              onClick={() =>
                savePrefs({ resultSide: sideBySide ? "bottom" : "right" })
              }
            >
              {sideBySide ? (
                <Rows2 className="size-4" aria-hidden="true" />
              ) : (
                <Columns2 className="size-4" aria-hidden="true" />
              )}
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-[#E0E0E0]" aria-hidden="true" />
          </span>
          <ToolButton
            label="Smaller text"
            disabled={prefs.fontSize <= FONT_MIN}
            onClick={() => savePrefs({ fontSize: prefs.fontSize - 1 })}
          >
            <AArrowDown className="size-4" aria-hidden="true" />
          </ToolButton>
          <span
            className="w-10 text-center text-xs font-medium tabular-nums text-[#4B4B4B]"
            aria-label={`Editor text size ${prefs.fontSize} pixels`}
          >
            {prefs.fontSize}px
          </span>
          <ToolButton
            label="Larger text"
            disabled={prefs.fontSize >= FONT_MAX}
            onClick={() => savePrefs({ fontSize: prefs.fontSize + 1 })}
          >
            <AArrowUp className="size-4" aria-hidden="true" />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-[#E0E0E0]" aria-hidden="true" />
          <ToolButton
            label="Reset the layout"
            onClick={() => savePrefs(DEFAULT_PREFS)}
          >
            <LayoutTemplate className="size-4" aria-hidden="true" />
          </ToolButton>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex gap-1 rounded-xl border border-[#E0E0E0] bg-white p-1 lg:hidden"
      >
        {(
          [
            ["problem", "Problem"],
            ["code", "Code"],
            ["result", "Result"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
              tab === id
                ? "bg-[#E7F2F3] text-[#03535F]"
                : "text-[#4B4B4B] hover:text-[#03535F]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={mainRef}
        style={
          {
            "--ws-split": `${split}%`,
            "--ws-editor": `${editorSplit}%`,
          } as React.CSSProperties
        }
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          prefs.swapped ? "lg:flex-row-reverse" : "lg:flex-row",
        )}
      >
        <section
          aria-label="Problem"
          className={cn(
            "min-h-0 overflow-y-auto rounded-2xl border border-[#E0E0E0] bg-white p-5 lg:flex-none lg:basis-[var(--ws-split)]",
            tab === "problem" ? "block" : "hidden",
            prefs.showStatement ? "lg:block" : "lg:hidden",
          )}
        >
          {statement}
        </section>

        {prefs.showStatement ? (
          <Divider
            vertical
            label="Resize the problem and the editor"
            active={drag?.kind === "main"}
            onPointerDown={(e) => startDrag(e, "main")}
          />
        ) : null}

        <div
          ref={innerRef}
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            sideBySide ? "lg:flex-row" : "",
            tab === "problem" ? "hidden lg:flex" : "flex",
          )}
        >
          <section
            aria-label="Code"
            className={cn(
              "min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E0E0E0] bg-white lg:flex-none lg:basis-[var(--ws-editor)]",
              tab === "result" ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E0E0E0] px-3 py-2">
              <label className="sr-only" htmlFor={`${storageKey}-language`}>
                Language
              </label>
              <select
                id={`${storageKey}-language`}
                value={language}
                onChange={(e) => changeLanguage(e.target.value as CodeLanguageId)}
                disabled={running}
                className="h-9 rounded-lg border border-[#E0E0E0] bg-white px-2 text-sm font-medium text-black focus-visible:outline-2 focus-visible:outline-[#03535F]"
              >
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={resetCode}
                disabled={running}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[#4B4B4B] hover:text-[#03535F] disabled:opacity-50"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset
              </button>
              <button
                type="button"
                onClick={runCode}
                disabled={!canRun}
                title="Run (Ctrl + Enter)"
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E0E0E0] bg-white px-3 text-sm font-semibold text-black transition-colors hover:border-[#03535F] hover:text-[#03535F] disabled:opacity-60"
              >
                {run.kind === "running" && run.action === "run" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="size-4" aria-hidden="true" />
                )}
                {run.kind === "running" && run.action === "run"
                  ? "Running..."
                  : "Run"}
              </button>
              {onSubmit && isSolved ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Solved
                </span>
              ) : null}
              {onSubmit ? (
                <button
                  type="button"
                  onClick={submitCode}
                  disabled={!canRun}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#03535F] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#076573] disabled:opacity-60"
                >
                  {run.kind === "running" && run.action === "submit" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  {run.kind === "running" && run.action === "submit"
                    ? "Submitting..."
                    : isSolved
                      ? "Submit again"
                      : "Submit"}
                </button>
              ) : null}
            </div>
            <div className="h-[55svh] min-h-[280px] lg:h-auto lg:min-h-0 lg:flex-1">
              <CodeEditor
                value={code}
                onChange={editCode}
                language={language}
                readOnly={running}
                fontSize={prefs.fontSize}
              />
            </div>
          </section>

          <Divider
            vertical={sideBySide}
            label="Resize the editor and the result"
            active={drag?.kind === "inner"}
            onPointerDown={(e) => startDrag(e, "inner")}
          />

          <section
            aria-label="Result"
            className={cn(
              "min-h-[200px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E0E0E0] bg-white lg:min-h-0 lg:flex-1",
              tab === "code" ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex flex-wrap items-center gap-1 border-b border-[#E0E0E0] px-3 py-2">
              <PanelTab
                label="Result"
                active={panel === "result"}
                onClick={() => setPanel("result")}
              />
              {submissions ? (
                <PanelTab
                  label="Submissions"
                  active={panel === "submissions"}
                  onClick={() => setPanel("submissions")}
                />
              ) : null}
              {customInput ? (
                <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-[#4B4B4B]">
                  <input
                    type="checkbox"
                    checked={useCustom}
                    onChange={(e) => {
                      setUseCustom(e.target.checked);
                      setPanel("result");
                    }}
                    className="size-4 accent-[#03535F]"
                  />
                  Custom input
                </label>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
              {panel === "submissions" && submissions ? (
                <SubmissionList submissions={submissions} />
              ) : (
                <div className="space-y-3">
                  {customInput && useCustom ? (
                    <div>
                      <label
                        htmlFor={`${storageKey}-custom`}
                        className="text-xs font-medium text-[#6B7280]"
                      >
                        Your input. {customInput.hint}
                      </label>
                      <textarea
                        id={`${storageKey}-custom`}
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder={customInput.example}
                        rows={3}
                        spellCheck={false}
                        className="mt-1 w-full resize-y rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 font-mono text-xs text-[#111111] placeholder:text-[#A3A3A3] focus-visible:outline-2 focus-visible:outline-[#03535F]"
                      />
                    </div>
                  ) : null}
                  {run.kind === "idle" ? (
                    <p className="text-sm text-[#6B7280]">
                      {customInput && useCustom
                        ? "Run your code to see its output for this input."
                        : "Run your code to see the result of the sample tests here."}
                    </p>
                  ) : null}
                  {run.kind === "running" ? (
                    <p className="flex items-center gap-2 text-sm text-[#4B4B4B]">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {run.action === "submit"
                        ? "Checking your solution against all tests..."
                        : "Running your code..."}
                    </p>
                  ) : null}
                  {run.kind === "error" ? (
                    <p role="alert" className="text-sm text-red-700">
                      {run.message}
                    </p>
                  ) : null}
                  {run.kind === "done" ? (
                    <>
                      {run.note ? (
                        <p className="text-sm font-medium text-black">{run.note}</p>
                      ) : null}
                      {run.result ? (
                        <TestResults result={run.result} scope={run.scope} />
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-[#03535F] disabled:opacity-40",
        pressed
          ? "bg-[#E7F2F3] text-[#03535F]"
          : "text-[#4B4B4B] hover:bg-[#F4F4F4] hover:text-[#03535F]",
      )}
    >
      {children}
    </button>
  );
}

/** A drag handle between two panes. Desktop only; on mobile it is just a gap. */
function Divider({
  vertical,
  label,
  active,
  onPointerDown,
}: {
  vertical: boolean;
  label: string;
  active: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      title="Drag to resize"
      onPointerDown={onPointerDown}
      className={cn(
        "group hidden flex-none touch-none items-center justify-center lg:flex",
        vertical ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "rounded-full transition-colors",
          vertical ? "h-10 w-1" : "h-1 w-10",
          active ? "bg-[#03535F]" : "bg-[#D4D4D4] group-hover:bg-[#03535F]",
        )}
      />
    </div>
  );
}

function PanelTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-[#E7F2F3] text-[#03535F]"
          : "text-[#4B4B4B] hover:text-[#03535F]",
      )}
    >
      {label}
    </button>
  );
}

function SubmissionList({
  submissions,
}: {
  submissions: WorkspaceSubmission[];
}) {
  if (submissions.length === 0) {
    return (
      <p className="text-sm text-[#6B7280]">
        No accepted submission yet. Only accepted solutions are saved.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {submissions.map((s, i) => (
        <li key={i} className="rounded-xl border border-[#E0E0E0]">
          <p className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Accepted
            </span>
            <span className="text-xs text-[#6B7280]">
              {s.languageLabel} · {s.submittedAtLabel}
            </span>
          </p>
          <pre className="max-h-64 overflow-auto border-t border-[#E0E0E0] bg-[#F4F4F4] px-3 py-2 font-mono text-xs text-[#111111]">
            {s.code}
          </pre>
        </li>
      ))}
    </ul>
  );
}
