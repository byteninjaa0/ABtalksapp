"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  requestCohortTrainAction,
  runMatchAction,
  sendScoutMessageAction,
} from "@/app/actions/hire-actions";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { JobSpec } from "@/lib/validations/hire";
import { SpecSummary } from "@/components/hire/spec-summary";

type Msg = {
  role: "user" | "assistant";
  content: string;
  options?: { label: string; value: string }[] | null;
};

type Props = {
  initialRequestId: string | null;
  initialMessages: Msg[];
  initialSpec: JobSpec;
  initialSummary: string;
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
    initialMessages.length
      ? initialMessages
      : [
          {
            role: "assistant",
            content:
              "I'm Scout. Tell me the role you're filling — I'll match people by verified work on ABTalks, not resumes.",
            options: [
              { label: "Backend engineer", value: "Backend engineer" },
              { label: "Full-stack engineer", value: "Full-stack engineer" },
              { label: "Data / ML engineer", value: "Data / ML engineer" },
              { label: "AI engineer", value: "AI engineer" },
            ],
          },
        ],
  );
  const [spec, setSpec] = useState<JobSpec>(initialSpec);
  const [summary, setSummary] = useState(initialSummary);
  const [readyToSearch, setReadyToSearch] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [gap, setGap] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);

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
      if (!requestId) {
        router.replace(`/hire/${res.data.requestId}`);
      }
      if (res.data.readyToSearch) {
        // auto-offer already in options
      }
    });
  }

  function runSearch() {
    if (!requestId) {
      toast.error("Send at least one message first.");
      return;
    }
    startTransition(async () => {
      const res = await runMatchAction({ requestId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setGap(res.data.overallGap);
      setMatchCount(res.data.matchCount);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.data.overallGap },
      ]);
      router.refresh();
      toast.success(
        res.data.matchCount > 0
          ? `Found ${res.data.matchCount} match(es)`
          : "Requirement saved — no matches yet",
      );
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
      toast.success("We'll train toward this stack and alert you when ready.");
      router.refresh();
    });
  }

  const lastOptions =
    [...messages].reverse().find((m) => m.role === "assistant" && m.options)
      ?.options ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <SpecSummary summary={summary} spec={spec} />

      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-4">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
      </div>

      {lastOptions && lastOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {lastOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={pending}
              onClick={() => send(o.value)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "disabled:opacity-50",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

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
          placeholder="Type a reply…"
          disabled={pending}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className={cn(buttonVariants(), "shrink-0 disabled:opacity-50")}
        >
          {pending ? "…" : "Send"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !requestId}
          onClick={runSearch}
          className={cn(
            buttonVariants({ variant: readyToSearch ? "default" : "secondary" }),
            "disabled:opacity-50",
          )}
        >
          Search verified talent
        </button>
        {(matchCount === 0 || gap) && (
          <button
            type="button"
            disabled={pending || !requestId}
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
