"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  teamCode: string;
  spotsLeft: number;
};

export function InvitePanel({ teamCode, spotsLeft }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(teamCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#E0E0E0] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-[13px] leading-[18px] font-semibold uppercase tracking-[0.16em] text-[#03535F]">
          Invite your team
        </h2>
        <p className="text-xs text-[#626262]">
          {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left
        </p>
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 rounded-lg border border-[#E0E0E0] bg-[#F4F4F4] px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-black">
          {teamCode}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={copyCode}
          className="gap-2 border-[#D2D2D2] bg-transparent text-black hover:bg-[#EEF6F6] hover:text-[#03535F]"
        >
          {copied ? (
            <>
              <Check className="size-4" aria-hidden />
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden />
              Copy code
            </>
          )}
        </Button>
      </div>

      <p className="mt-3 text-sm text-[#626262]">
        Teammates register at app.klymb.ai/hackathon and enter this code in the
        popup.
      </p>
    </section>
  );
}
