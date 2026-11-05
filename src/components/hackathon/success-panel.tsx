"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import Link from "next/link";
import { HACKATHON } from "@/components/hackathon/hackathon-config";
import { HACKATHON_UNLOCK_CODE } from "@/lib/hackathon-unlock";

type Props = {
  entryType: "SOLO" | "TEAM_CREATE" | "TEAM_JOIN";
  teamCode: string;
  teamName: string | null;
};

export function SuccessPanel({ entryType, teamCode, teamName }: Props) {
  const [copied, setCopied] = useState<"team" | "unlock" | null>(null);

  useEffect(() => {
    void confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.65 },
    });
  }, []);

  async function copy(value: string, which: "team" | "unlock") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  const title =
    entryType === "TEAM_CREATE"
      ? `Team created${teamName ? `, ${teamName}` : ""}`
      : entryType === "TEAM_JOIN"
        ? `You're in${teamName ? `, ${teamName}` : ""}.`
        : "You're registered.";

  return (
    <div className="hk-done">
      <div>
        <span className="hk-done__badge">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Registered
        </span>
        <h2 className="hk-done__title mt-3">{title}</h2>
        <p className="hk-done__text mt-2">
          The page is unlocked — the timeline, the rules and the Discord invite
          are waiting for you below.
        </p>
      </div>

      {/* The unlock code lives here, not in an email. It only matters if you
          open the page signed out or on another device. */}
      <div className="hk-done__panel">
        <span className="hk-done__label">Your unlock code</span>
        <div className="hk-done__code-row">
          <code className="hk-done__code">{HACKATHON_UNLOCK_CODE}</code>
          <button
            type="button"
            className="ab-btn hk-btn--outline hk-done__copy"
            onClick={() => copy(HACKATHON_UNLOCK_CODE, "unlock")}
          >
            {copied === "unlock" ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="hk-done__note">
          Type it on the padlock if you ever open this page signed out or on
          another device. It&rsquo;s also shown on the padlock message any time
          you&rsquo;re signed in.
        </p>
      </div>

      {entryType !== "SOLO" ? (
        <div className="hk-done__panel">
          <span className="hk-done__label">Your team code</span>
          <div className="hk-done__code-row">
            <code className="hk-done__code">{teamCode}</code>
            <button
              type="button"
              className="ab-btn hk-btn--outline hk-done__copy"
              onClick={() => copy(teamCode, "team")}
            >
              {copied === "team" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="hk-done__note">
            {entryType === "TEAM_CREATE" ? (
              <>
                Share this with your teammates. They open the Register popup on
                app.klymb.ai/hackathon and enter it to join you.
              </>
            ) : (
              <>
                This is your team&rsquo;s code — it&rsquo;s also on the
                hackathon page any time you need it.
              </>
            )}
          </p>
        </div>
      ) : null}

      <div>
        <p className="hk-done__label">What happens next</p>
        <p className="hk-done__text mt-2">
          Kickoff is {HACKATHON.kickoffLabel}. The problem statement drops at
          kickoff on Discord — every participant is required to join.
        </p>
      </div>

      <div className="hk-done__links">
        <Link
          href={HACKATHON.discordLink}
          target="_blank"
          rel="noopener noreferrer"
          className="ab-btn ab-btn--primary"
        >
          Join the Discord →
        </Link>
        <Link
          href={HACKATHON.whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="ab-btn hk-btn--outline"
        >
          WhatsApp group
        </Link>
      </div>
    </div>
  );
}
