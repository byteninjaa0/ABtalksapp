"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyToJobAction } from "@/app/actions/job-actions";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { useTrack } from "@/lib/analytics/use-track";
import { Button, buttonVariants } from "@/components/ui/button";
import { dsButtonVariants } from "@/components/design/ds-button";
import { CLAY_CTA } from "@/components/jobs/job-ui";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** DS v2 primary CTA with clay depth — the Jobs tab's only filled button. */
const CLAY_BUTTON_CLASS = cn(dsButtonVariants(), CLAY_CTA);

type Props = {
  jobId: string;
  alreadyApplied: boolean;
  externalUrl: string;
  isOpen: boolean;
};

export function ApplyJobButton({
  jobId,
  alreadyApplied: initialApplied,
  externalUrl,
  isOpen,
}: Props) {
  const router = useRouter();
  const track = useTrack();
  const [applied, setApplied] = useState(initialApplied);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (applied) {
    return (
      <Button type="button" variant="secondary" disabled>
        Applied ✓
      </Button>
    );
  }

  if (!isOpen) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        This role is closed. Applications are no longer accepted.
      </p>
    );
  }

  function submitApplication() {
    startTransition(async () => {
      const result = await applyToJobAction({ jobId, note });
      if (result.ok) {
        // Only a created row gets here: a repeat application comes back as
        // ok:false on the unique constraint, so re-submitting cannot double it.
        // The job id and the note stay behind — the application's existence is
        // the whole signal.
        track(ANALYTICS_EVENTS.siteJobApplied);
        setApplied(true);
        setShowNote(false);
        toast.success("Application submitted!");
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {!showNote ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className={cn(CLAY_BUTTON_CLASS, "w-full")}
            onClick={() => setShowNote(true)}
          >
            Apply
          </Button>
          {externalUrl ? (
            <Link
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Apply on company site ↗
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <label htmlFor="apply-note" className="text-sm font-medium">
            Add a note to the recruiter (optional)
          </label>
          <Textarea
            id="apply-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you're a great fit…"
            disabled={pending}
            className="min-h-[100px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className={CLAY_BUTTON_CLASS}
              disabled={pending}
              onClick={() => submitApplication()}
            >
              {pending ? "Submitting…" : "Submit application"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setShowNote(false)}
            >
              Cancel
            </Button>
          </div>
          {externalUrl ? (
            <Link
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "link" }),
                "inline-flex h-auto p-0 text-sm",
              )}
            >
              Or apply on the company site ↗
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
