"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  requestCohortTrainAction,
  runMatchAction,
  sendScoutMessageAction,
} from "@/app/actions/hire-actions";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hireProgress, type JobSpec } from "@/lib/validations/hire";

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const progress = hireProgress(spec);
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  // Keep the newest turn in view as the transcript grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  function send(value: string) {
    const message = value.trim();
    if (!message || pending) return;
    if (message === "action:search") {
      runSearch();
      return;
    }

    setMessages((m) => [...m, { role: "user", content: message }]);
    setText("");
    startTransition(async () => {
      const res = await sendScoutMessageAction({
        requestId: requestId ?? undefined,
        message,
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
    <div className="flex flex-col gap-4">
      {/* Progress + running spec */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {readyToSearch
              ? "Requirement complete"
              : `Question ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}
          </p>
          <p className="text-xs text-muted-foreground">{pct}%</p>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Requirement completeness"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {summary || "Tell me the role and I'll take it from there."}
        </p>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex h-[46vh] min-h-70 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4"
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

      {/* Answer chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={pending}
              onClick={() => send(o.value)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
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

      {/* Always present. The chips are shortcuts; typing is never taken away,
          so a recruiter can answer off-script, correct an earlier answer, or
          ask Scout a question at any point in the conversation. */}
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
