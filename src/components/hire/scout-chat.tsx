"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  requestCohortTrainAction,
  runMatchAction,
  sendScoutMessageAction,
} from "@/app/actions/hire-actions";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type JobSpec } from "@/lib/validations/hire";

type Option = { label: string; value: string };
/** `options` is null for stored turns that offered no chips. */
type Msg = {
  role: "user" | "assistant";
  content: string;
  options?: Option[] | null;
};

type Props = {
  initialRequestId: string | null;
  initialMessages: Msg[];
  initialSpec: JobSpec;
  initialSummary: string;
};

const OPENING: Msg = {
  role: "assistant",
  content: "What role are you hiring for?",
  options: [
    { label: "Backend engineer", value: "Backend engineer" },
    { label: "Full-stack engineer", value: "Full-stack engineer" },
    { label: "Data / ML engineer", value: "Data / ML engineer" },
    { label: "AI engineer", value: "AI engineer" },
    { label: "Frontend engineer", value: "Frontend engineer" },
  ],
};

const SENIORITY_LABEL: Record<string, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  MID: "Mid",
  SENIOR: "Senior",
  LEAD: "Lead",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  PART_TIME: "Part-time",
};

const WORK_MODE_LABEL: Record<string, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
  FLEXIBLE: "Flexible",
};

const EVIDENCE_LABEL: Record<string, string> = {
  missions: "Code correctness",
  clean_pass: "First-attempt quality",
  projects: "Project quality",
  consistency: "Consistency",
  interview: "Communication",
};

function toLpa(rupees: number): string {
  const lakhs = rupees / 100_000;
  return Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1);
}

/**
 * The requirement as a recruiter would read it back.
 *
 * Only answered fields produce a row, so the panel fills in as the conversation
 * goes — which is the honest version of a progress indicator: it shows what was
 * actually captured rather than a count. Several fields store a sentinel for
 * "asked, deliberately unspecified" (0–0 budget, 180-day notice, 0–50 years);
 * those read as the recruiter's intent, never as a literal number.
 */
function specRows(spec: JobSpec): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value });
  };

  push("Role", spec.title?.trim());
  push("Seniority", spec.seniority ? SENIORITY_LABEL[spec.seniority] : null);
  push("Must have", spec.mustHaveStack?.join(" · "));
  push("Nice to have", spec.niceToHaveStack?.join(" · "));
  push(
    "Ranked on",
    spec.evidencePriority?.map((e) => EVIDENCE_LABEL[e] ?? e).join(" · "),
  );

  if (spec.salaryMin != null || spec.salaryMax != null) {
    const lo = spec.salaryMin ?? 0;
    const hi = spec.salaryMax ?? 0;
    push(
      "Budget",
      lo === 0 && hi === 0
        ? "Not specified"
        : `₹${toLpa(lo)}–${toLpa(hi)} LPA`,
    );
  }

  push(
    "Engagement",
    spec.employmentType ? EMPLOYMENT_LABEL[spec.employmentType] : null,
  );
  push("Work mode", spec.workMode ? WORK_MODE_LABEL[spec.workMode] : null);
  if (spec.workMode !== "REMOTE") {
    push("City", spec.locationCity === "Any" ? "Any city" : spec.locationCity);
  }

  if (spec.noticePeriodDays != null) {
    const d = spec.noticePeriodDays;
    push(
      "Start",
      d === 0 ? "Immediate" : d >= 180 ? "Flexible" : `Within ${d} days`,
    );
  }

  if (spec.minExperience != null || spec.maxExperience != null) {
    const lo = spec.minExperience ?? 0;
    const hi = spec.maxExperience ?? 0;
    push(
      "Experience",
      lo === 0 && hi >= 50 ? "Evidence only" : `${lo}–${hi} years`,
    );
  }

  return rows;
}

export function ScoutChat({
  initialRequestId,
  initialMessages,
  initialSpec,
  initialSummary,
}: Props) {
  const router = useRouter();
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [messages, setMessages] = useState<Msg[]>(
    initialMessages.length ? initialMessages : [OPENING],
  );
  const [spec, setSpec] = useState<JobSpec>(initialSpec);
  const [summary, setSummary] = useState(initialSummary);
  const [readyToSearch, setReadyToSearch] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [searched, setSearched] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = specRows(spec);

  // Keep the newest turn in view as the transcript grows, and after the panel
  // resizes — otherwise expanding leaves the reader looking at old messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, expanded, detailsOpen]);

  /**
   * `label` is what the recruiter read on the chip, when that differs from the
   * value behind it ("Within 30 days" → "30"). It drives the bubble and what is
   * stored; the engine always parses `value`.
   */
  function send(value: string, label?: string) {
    const message = value.trim();
    if (!message || pending) return;
    if (message === "action:search") {
      runSearch();
      return;
    }

    const shown = label?.trim() || message;
    setMessages((m) => [...m, { role: "user", content: shown }]);
    setText("");
    startTransition(async () => {
      const res = await sendScoutMessageAction({
        requestId: requestId ?? undefined,
        message,
        display: shown === message ? undefined : shown,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setRequestId(res.data.requestId);
      setSpec(res.data.spec);
      setSummary(res.data.summary);
      setReadyToSearch(res.data.readyToSearch);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.data.assistantMessage,
          options: res.data.options,
        },
      ]);
      if (!requestId) router.replace(`/hire/${res.data.requestId}`);
    });
  }

  function runSearch() {
    if (!requestId) {
      toast.error("Answer at least one question first.");
      return;
    }
    startTransition(async () => {
      const res = await runMatchAction({ requestId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setSearched(true);
      setMatchCount(res.data.matchCount);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.data.overallGap },
      ]);
      router.refresh();
    });
  }

  function trainCohort() {
    if (!requestId) return;
    startTransition(async () => {
      const res = await requestCohortTrainAction(requestId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Saved — we'll train toward this stack and alert you.");
      router.refresh();
    });
  }

  const lastOptions =
    [...messages].reverse().find((m) => m.role === "assistant" && m.options)
      ?.options ?? [];
  const chips = readyToSearch
    ? lastOptions.filter((o) => o.value !== "action:search")
    : lastOptions;

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Header — identity, live one-line summary, and the two size controls */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              Scout
              {readyToSearch && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Ready
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {summary || "Ranks people on verified work, not resumes"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            aria-controls="scout-requirement"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
              "transition-colors hover:border-primary hover:text-primary",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              detailsOpen && "border-primary text-primary",
            )}
          >
            <span className="hidden sm:inline">Requirement</span>
            <span className="sm:hidden">Spec</span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200",
                detailsOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Shrink conversation" : "Expand conversation"}
            title={expanded ? "Shrink" : "Expand"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border",
              "transition-colors hover:border-primary hover:text-primary",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            )}
          >
            {expanded ? (
              <Minimize2 className="size-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Requirement — everything captured so far, read back in plain words */}
        {detailsOpen && (
          <div
            id="scout-requirement"
            className="border-b bg-muted/40 px-4 py-3.5"
          >
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing captured yet — answer the first question and this fills
                in.
              </p>
            ) : (
              <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.label} className="flex gap-3 text-xs">
                    <dt className="w-24 shrink-0 text-muted-foreground">
                      {r.label}
                    </dt>
                    <dd className="min-w-0 font-medium break-words">
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {/* Transcript */}
        <div
          ref={scrollRef}
          className={cn(
            "flex flex-col gap-4 overflow-y-auto p-4 transition-all duration-300",
            expanded ? "h-[68vh]" : "h-[44vh] min-h-70",
          )}
        >
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={cn(
                "flex gap-2.5",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "assistant" && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Composer — chips are shortcuts, typing is never taken away, so a
            recruiter can answer off-script, correct an earlier answer, or ask
            Scout a question at any point. */}
        <div className="space-y-2.5 border-t bg-background/60 p-3">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={pending}
                  onClick={() => send(o.value, o.label)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    "hover:border-primary hover:bg-primary/5 hover:text-primary",
                    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    o.value.startsWith("skip:")
                      ? "border-dashed text-muted-foreground"
                      : "border-border",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                readyToSearch
                  ? "Change anything, or ask me something…"
                  : "Type your answer, or ask me anything…"
              }
              disabled={pending}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "shrink-0 disabled:opacity-50",
              )}
            >
              Send
            </button>
          </form>
        </div>
      </section>

      {/* Primary action */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !requestId}
          onClick={runSearch}
          className={cn(
            buttonVariants({ size: "lg" }),
            "gap-2 disabled:opacity-50",
            !readyToSearch && "opacity-90",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {readyToSearch ? "Search verified talent" : "Search now"}
        </button>

        {!readyToSearch && (
          <p className="text-xs text-muted-foreground">
            You can search any time — more answers mean a sharper ranking.
          </p>
        )}

        {searched && matchCount === 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={trainCohort}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "disabled:opacity-50",
            )}
          >
            Train this cohort for me
          </button>
        )}
      </div>
    </div>
  );
}
