"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSafeReducedMotion } from "@/lib/motion";

type Phase = {
  interview: boolean;
  strike: boolean;
  evidence: boolean;
  highlight: boolean;
  below: boolean;
};

const ALL_ON: Phase = {
  interview: true,
  strike: true,
  evidence: true,
  highlight: true,
  below: true,
};

type Props = {
  children?: ReactNode;
};

export function HeroHeadline({ children }: Props) {
  const reduce = useSafeReducedMotion();
  const [phase, setPhase] = useState<Phase>({
    interview: false,
    strike: false,
    evidence: false,
    highlight: false,
    below: false,
  });

  useEffect(() => {
    if (reduce) {
      setPhase(ALL_ON);
      return;
    }

    const timers = [
      window.setTimeout(() => {
        setPhase((p) => ({ ...p, interview: true }));
      }, 80),
      window.setTimeout(() => {
        setPhase((p) => ({ ...p, strike: true }));
      }, 700),
      window.setTimeout(() => {
        setPhase((p) => ({ ...p, evidence: true }));
      }, 1500),
      window.setTimeout(() => {
        setPhase((p) => ({ ...p, highlight: true }));
      }, 2100),
      // After highlighter finishes drawing (~1.1s)
      window.setTimeout(() => {
        setPhase((p) => ({ ...p, below: true }));
      }, 3300),
    ];

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [reduce]);

  return (
    <>
      <h1 style={{ margin: 0 }}>
        <span
          className={
            phase.interview ? "hub-interview in" : "hub-interview"
          }
        >
          Interview
          <span
            className={
              phase.strike
                ? "hub-interview-strike on"
                : "hub-interview-strike"
            }
            aria-hidden
          />
        </span>
        <br />
        <span
          className={[
            "hub-evidence",
            phase.evidence ? "in" : "",
            phase.highlight ? "highlight" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Evidence-based hiring.
        </span>
      </h1>
      {children ? (
        <div
          className={
            phase.below ? "hub-hero-below on" : "hub-hero-below"
          }
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
