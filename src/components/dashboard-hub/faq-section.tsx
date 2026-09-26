"use client";

import { useState } from "react";
import { DASHBOARD_FAQ } from "./faq-content";
import { cn } from "@/lib/utils";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="scroll-mt-24 pt-14">
      <div className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-12">
        {/* Left column: heading + subtitle */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#03535F]">FAQ</p>
          <h2 className="mt-2 font-heading text-3xl font-bold leading-tight tracking-tight text-black sm:text-[40px]">
            Questions, <span className="text-[#03535F]">answered.</span>
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#4B4B4B]">
            Everything you need to know about the ABTalks 60-day challenge,
            submissions, streaks, and more.
          </p>
        </div>

        {/* Right column: accordion cards */}
        <div className="space-y-3">
          {DASHBOARD_FAQ.map((item, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;

            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-2xl border border-[#E6E9E9] bg-white"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#03535F]"
                >
                  {item.q}
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full bg-[#03535F] text-white transition-transform duration-200 ease-[var(--ease-spark)]",
                      isOpen && "rotate-45",
                    )}
                    aria-hidden
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M7 1v12M1 7h12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
                {isOpen ? (
                  <div
                    id={panelId}
                    className="px-5 pb-4 text-sm leading-relaxed text-[#4B4B4B]"
                  >
                    {item.a}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
