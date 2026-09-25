"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enrollInClaudeChallenge } from "@/app/actions/enrollment-actions";
import { ArrowRight } from "lucide-react";
import { HUB_CARD_CTA_CLASS } from "@/components/dashboard-hub/nav-items";

/** `className` restyles the button for the stages hub; the default look is unchanged. */
export function JoinClaudeButton({
  className,
  withArrow = false,
}: { className?: string; withArrow?: boolean } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleJoin() {
    setPending(true);
    try {
      const result = await enrollInClaudeChallenge();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Welcome to the Claude Challenge!");
      router.push("/claude");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleJoin}
      disabled={pending}
      className={className ?? HUB_CARD_CTA_CLASS}
    >
      {pending ? "Joining…" : "Join"}
      {withArrow ? <ArrowRight className="size-3.5" aria-hidden="true" /> : null}
    </button>
  );
}
