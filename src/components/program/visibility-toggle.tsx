"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRecruiterVisibilityAction } from "@/app/actions/talent-actions";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The member's own switch for being findable by recruiters.
 *
 * Deliberately plain about both halves of the deal: what a recruiter can see
 * (verified work and declared skills) and what they cannot (name, contact,
 * anything that lets them reach the member directly). The second half is the
 * one people actually worry about, and it is the reason most of the cohort
 * left this off.
 */
export function VisibilityToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();

  function change(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    start(async () => {
      const res = await setRecruiterVisibilityAction({ enabled: next });
      if (!res.ok) {
        setEnabled(previous);
        toast.error(res.message);
        return;
      }
      toast.success(
        next
          ? "You're now discoverable by approved recruiters."
          : "You're hidden from recruiters again.",
      );
    });
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="font-display text-base font-semibold">
          Recruiter visibility
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Off by default. You can change this whenever you like.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={enabled}
          onCheckedChange={(c) => change(c === true)}
          disabled={pending}
          className="mt-0.5"
          aria-label="Let approved recruiters find me"
        />
        <span>Let approved recruiters find me through ABTalks hiring</span>
      </label>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="font-medium text-foreground">Recruiters can see</p>
          <p className="mt-1 text-muted-foreground">
            Missions you passed, first-attempt passes, commit days, project and
            interview scores, the skills and role you entered, and a candidate
            code like AB-1234.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="font-medium text-foreground">They never see</p>
          <p className="mt-1 text-muted-foreground">
            Your name, email, phone, employer, resume or profile links. Contact
            details are shared only after you and the ABTalks team agree to an
            introduction.
          </p>
        </div>
      </div>
    </div>
  );
}
