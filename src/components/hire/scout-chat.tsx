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
import {
  runGuestMatchAction,
  sendGuestScoutMessageAction,
} from "@/app/actions/hire-guest-actions";
import { MatchResults } from "@/components/hire/match-results";
import type { MatchCardData } from "@/components/hire/match-card";
import { readGuestCart } from "@/components/hire/guest-cart";
import { writeGuestMatches } from "@/components/hire/guest-matches-store";
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
  /** Persist turns as a TalentRequest. False for guests and pending recruiters. */
  persist?: boolean;
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
    // Stored annually so it stays comparable to candidate expectations, but
    // read back in the units the recruiter used — a stipend shown as "₹2.4 LPA"
    // is technically true and useless.
    const money =
      spec.salaryPeriod === "MONTHLY"
        ? `₹${Math.round(lo / 12).toLocaleString("en-IN")}–₹${Math.round(hi / 12).toLocaleString("en-IN")} / month`
        : `₹${toLpa(lo)}–${toLpa(hi)} LPA`;
    push("Budget", lo === 0 && hi === 0 ? "Not specified" : money);
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
  persist = false,
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
  const [guestMatches, setGuestMatches] = useState<MatchCardData[]>([]);
  const [guestGap, setGuestGap] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSearchedRef = useRef(false);
  const rows = specRows(spec);

  // Keep the newest turn in view as the transcript grows, and after the panel
  // resizes — otherwise expanding leaves the reader looking at old messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, expanded, detailsOpen]);

  // Finishing the questions IS the trigger. Leaving the recruiter to notice a
  // button after the last answer is what made the conversation feel like it
  // never ended — there was no point at which anything happened.
  useEffect(() => {
    if (!readyToSearch || pending) return;
    if (persist && !requestId) return;
    if (autoSearchedRef.current) return;
    autoSearchedRef.current = true;
    runSearch();
    // runSearch is stable for this component's lifetime and guarded by the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToSearch, requestId, pending]);

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
      if (persist) {
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
        return;
      }

      const res = await sendGuestScoutMessageAction({
        message,
        display: shown === message ? undefined : shown,
        spec,
        history: messages.map((row) => ({
          role: row.role,
          content: row.content,
        })),
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
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
    });
  }

  function runSearch() {
    if (persist && !requestId) {
      toast.error("Answer at least one question first.");
      return;
    }
    startTransition(async () => {
      if (persist) {
        const res = await runMatchAction({ requestId: requestId! });
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
        return;
      }

      const res = await runGuestMatchAction({ spec });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const cart = new Set(readGuestCart().map((i) => i.memberId));
      const cards = res.data.matches.map((m) => ({
        ...m,
        shortlisted: m.programMemberId ? cart.has(m.programMemberId) : false,
      }));
      setGuestMatches(cards);
      setGuestGap(res.data.overallGap);
      writeGuestMatches({
        matches: cards,
        overallGap: res.data.overallGap,
        title: spec.title?.trim() || "your requirement",
      });
      setSearched(true);
      setMatchCount(res.data.matchCount);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.data.overallGap },
      ]);
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

  // Only the newest turn offers chips, and they hang off that message rather
  // than off the composer — an answer belongs to the question that asked it.
  // Searching backwards for the last turn *with* options kept stale chips on
  // screen after a search, which have nothing left to answer.
  const lastIndex = messages.length - 1;
  const lastMsg = messages[lastIndex];
  const activeOptions =
    lastMsg?.role === "assistant" ? (lastMsg.options ?? []) : [];
  const chips = readyToSearch
    ? activeOptions.filter((o) => o.value !== "action:search")
    : activeOptions;

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
            onClick={() => {
              if (requestId) {
                router.push("/hire");
                return;
              }
              setMessages([OPENING]);
              setSpec({});
              setSummary("Not started");
              setReadyToSearch(false);
              setSearched(false);
              setMatchCount(null);
              setGuestMatches([]);
              setGuestGap(null);
              setText("");
              setDetailsOpen(false);
              autoSearchedRef.current = false;
            }}
            className={cn(
              "flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium",
              "transition-colors hover:border-primary hover:text-primary",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            )}
          >
            New search
          </button>

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
            aria-label={
              expanded ? "Shrink conversation" : "Expand conversation"
            }
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
              <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-2">
                <div
                  className={cn(
                    "max-w-full rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                  )}
                >
                  {m.content}
                </div>

                {i === lastIndex && !pending && chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {chips.map((o, oi) => (
                      <button
                        key={`${o.value}-${oi}`}
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
        <div className="border-t bg-background/60 p-3">
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
            {/* Primary, not outline: once something is typed this is the action
                  on the screen, and it should look like it. */}
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className={cn(buttonVariants(), "shrink-0 disabled:opacity-50")}
            >
              Send
            </button>
          </form>
        </div>
      </section>

      {/* Primary action. Once the questions are done the search has already
          run, so this stops being the way forward and becomes a way back. */}
      <div className="flex flex-wrap items-center gap-2">
        {searched ? (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("hire-results")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={cn(buttonVariants({ size: "lg" }), "gap-2")}
          >
            <Search className="size-4" aria-hidden="true" />
            {matchCount === 0
              ? "See the gap report"
              : `View ${matchCount} matched ${matchCount === 1 ? "profile" : "profiles"}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || (persist && !requestId)}
            onClick={runSearch}
            className={cn(
              buttonVariants({
                size: "lg",
                variant: readyToSearch ? "default" : "outline",
              }),
              "gap-2 disabled:opacity-50",
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            {readyToSearch
              ? "Search verified talent"
              : "Search with what I have"}
          </button>
        )}

        {!readyToSearch && !searched && (
          <p className="text-xs text-muted-foreground">
            Answer the rest for a sharper ranking — I&apos;ll search
            automatically when we&apos;re done.
          </p>
        )}

        {persist && searched && matchCount === 0 && (
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

      {!persist && searched && (
        <section id="hire-results" className="scroll-mt-20 space-y-4">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Step 2 · Matched profiles
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {guestMatches.length > 0
              ? `${guestMatches.length} matched candidate${guestMatches.length === 1 ? "" : "s"}`
              : "No matches yet"}
          </h2>
          {guestGap && (
            <p className="text-sm text-muted-foreground">{guestGap}</p>
          )}
          {guestMatches.length > 0 && (
            <>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                <strong className="font-semibold">Privacy protected.</strong>{" "}
                Candidates are shown by reference ID. Names and contact stay
                hidden until you send a request.
              </p>
              <MatchResults
                matches={guestMatches}
                cartCount={readGuestCart().length}
                viewAllHref="/hire/matches"
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
