import Link from "next/link";
import type { Domain } from "@prisma/client";
import type { HubEnrollment } from "@/features/dashboard/get-hub-data";
import {
  HUB_BUTTON_CLASS,
  HUB_CARD_CTA_SOLID_CLASS,
  HUB_CARD_HOVER_CLASS,
  HUB_TEXT_LINK_CLASS,
} from "@/components/dashboard-hub/nav-items";
import { cn } from "@/lib/utils";

const TRACK_PATH: Record<Domain, string> = {
  AI: "/ai",
  DS: "/ds",
  SE: "/se",
  CLAUDE: "/claude",
};

const DOMAIN_LABEL: Record<Domain, string> = {
  AI: "Artificial Intelligence",
  DS: "Data Science",
  SE: "Software Engineering",
  CLAUDE: "Claude Challenge",
};

type ContinueJourneyProps = {
  enrollments: HubEnrollment[];
};

export function ContinueJourney({ enrollments }: ContinueJourneyProps) {
  // "Continue" has to mean there is something left to do. A challenge whose
  // window and grace period have closed cannot be worked on again, so it stops
  // being an active card however many days were missed.
  const active = enrollments.filter((e) => e.lifecycle === "active");
  const finished = enrollments.filter((e) => e.lifecycle !== "active");

  return (
    <section
      id="your-challenge"
      className="scroll-mt-20 px-4 py-8 sm:px-6 lg:ml-4"
    >
      <h2 className=" font-heading text-xl font-semibold uppercase text-[#03535F]">
        Continue your journey
      </h2>

      {active.length === 0 ? (
        <div
          className={cn(
            "mt-4 rounded-2xl border border-[#E0E0E0] bg-white p-6 text-center",
            HUB_CARD_HOVER_CLASS,
          )}
        >
          <p className="text-[#4B4B4B]">
            You haven&apos;t started a challenge yet
          </p>
          <Link
            href="/challenges"
            className={cn(HUB_BUTTON_CLASS, "mt-4 inline-flex")}
          >
            Browse challenges
          </Link>
        </div>
      ) : (
        <ul className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory 2xl:grid 2xl:grid-cols-3 2xl:overflow-visible 2xl:pb-0 2xl:snap-none">
          {active.map((e) => {
            // Finished runs are rendered below, so anything here has days
            // left. `totalDays` rather than a literal 60: the value comes from
            // the cohort's plannedDurationDays and is not the same everywhere.
            const pct = Math.min(
              100,
              Math.round((e.daysCompleted / e.totalDays) * 100),
            );
            const subtitle = `Day ${e.daysCompleted + 1} of ${e.totalDays} · ${e.currentStreak}-day streak`;
            return (
              <li
                key={e.id}
                className={cn(
                  "flex w-[min(100%,320px)] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[#E0E0E0] bg-white p-5 sm:w-[300px] 2xl:w-full 2xl:max-w-none 2xl:shrink",
                  HUB_CARD_HOVER_CLASS,
                )}
              >
                <div className="flex min-h-0 flex-col gap-2">
                  <div className="min-w-0">
                    <p className="font-inter font-bold text-black">
                      {DOMAIN_LABEL[e.domain]}
                    </p>
                    <p className="mt-1 text-sm text-[#4B4B4B]">
                      {subtitle}
                    </p>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-label={`${DOMAIN_LABEL[e.domain]} progress`}
                    className="h-1.5 w-full overflow-hidden rounded-lg bg-[#E9E9E9]"
                  >
                    <div
                      className="h-full bg-[#03535F] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={TRACK_PATH[e.domain]}
                  className={cn(HUB_CARD_CTA_SOLID_CLASS, "mt-2 self-end")}
                >
                  Continue
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Finished work, kept visible but out of the way: nothing here is
            something you can act on, so it gets a quieter card and no solid
            CTA rather than competing with the challenges still running.
            Certificates only auto-issue for Claude, so dropping these
            outright would leave a finished AI, DS or SE challenge with no
            trace anywhere on the site. */}
        {finished.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-[#6B7477]">
              Finished
            </h3>
            <ul className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory 2xl:grid 2xl:grid-cols-3 2xl:overflow-visible 2xl:pb-0 2xl:snap-none">
              {finished.map((e) => {
                const completed = e.lifecycle === "completed";
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "flex w-[min(100%,320px)] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[#E9E9E9] bg-[#FBFBFB] p-5 sm:w-[300px] 2xl:w-full 2xl:max-w-none 2xl:shrink",
                      HUB_CARD_HOVER_CLASS,
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-inter font-bold text-[#4B4B4B]">
                        {DOMAIN_LABEL[e.domain]}
                      </p>
                      {/* "Ended", never "Completed", when days were missed:
                          calling an unfinished run complete would be the
                          platform misreporting its own user's record. */}
                      <p className="mt-1 text-sm text-[#6B7477]">
                        {completed
                          ? `Completed · ${e.totalDays} of ${e.totalDays}`
                          : `Ended · ${e.daysCompleted} of ${e.totalDays}`}
                      </p>
                    </div>
                    <Link
                      href={TRACK_PATH[e.domain]}
                      className={cn(HUB_TEXT_LINK_CLASS, "mt-3 self-end")}
                    >
                      View
                    </Link>
                  </li>
                );
              })}
            </ul>
        </>
      ) : null}
    </section>
  );
}
