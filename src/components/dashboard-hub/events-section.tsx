"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { IST } from "@/lib/date-utils";
import {
  EVENTS,
  hasReplay,
  pastEvents,
  type WorkshopEvent,
} from "@/components/workshop/events-data";
import WorkshopDetailsModal from "@/components/workshop/WorkshopDetailsModal";
import WorkshopThemeStyles from "@/components/workshop/WorkshopThemeStyles";
import {
  HUB_CARD_CTA_CLASS,
  HUB_CARD_HOVER_CLASS,
} from "@/components/dashboard-hub/nav-items";
import { cn } from "@/lib/utils";

function todayIstKey(): string {
  return formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
}

export function EventsSection() {
  const today = todayIstKey();

  const upcoming = EVENTS.filter((e) => e.date >= today).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  // `pastEvents` is the same filter-and-sort this used to do inline, and it is
  // the definition `hasReplay` below is built on — one rule for "past", not two.
  const past = pastEvents(today);

  return (
    <section id="events" className="scroll-mt-20 px-4 py-8 sm:px-6 lg:ml-5">
      <h2 className="font-heading text-xl font-semibold uppercase text-[#03535F]">
        Events
      </h2>

      {upcoming.length > 0 ? (
        <EventRail title="Upcoming events" events={upcoming} />
      ) : null}

      {past.length > 0 ? <PastEventsRail events={past} today={today} /> : null}
    </section>
  );
}

/** Gap between cards, in px. Must track the `gap-4` on the rows below — the
 *  arrow step is computed from it and cannot read a Tailwind class. */
const CARD_GAP = 16;

const CARD_BASE =
  "flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-[#E0E0E0] bg-white p-5 text-left sm:w-[300px]";

const CARD_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]";

/**
 * Past events as a two-row horizontal shelf.
 *
 * This section used to be a grid that grew downward, and it is the one part of
 * the page with no ceiling — every workshop ever run lands here. Two rows in a
 * fixed-height rail keeps it skimmable however long the list gets.
 *
 * Both rows are children of ONE scroller, which is what makes the arrows move
 * them together: there is a single `scrollLeft`, so they cannot desync.
 */
function PastEventsRail({
  events,
  today,
}: {
  events: WorkshopEvent[];
  today: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** The card that opened the modal, so focus goes back where it came from. */
  const triggerRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<WorkshopEvent | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [scrollable, setScrollable] = useState(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 1);
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    // Card widths change at `sm`, and the sidebar collapsing re-flows the
    // column — both change whether there is anything left to scroll.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  function page(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Measure a real card rather than assume the breakpoint, then move whole
    // columns so a step never leaves a card half out of view.
    const card = el.querySelector<HTMLElement>("[data-event-card]");
    const pitch = (card?.getBoundingClientRect().width ?? 280) + CARD_GAP;
    const columns = Math.max(1, Math.floor(el.clientWidth / pitch));
    // `scrollBy` takes the behaviour as an argument, so reduced motion has to
    // be read here — CSS `scroll-behavior` cannot express it for this call.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * columns * pitch,
      behavior: reduced ? "auto" : "smooth",
    });
  }

  // Row-major, so reading left to right stays chronological: row 1 holds the
  // newest events in order and row 2 continues from there. Filling by column
  // instead would put events 1, 3, 5… on top and interleave the order.
  const mid = Math.ceil(events.length / 2);
  const rows = [events.slice(0, mid), events.slice(mid)];

  const openModal = useCallback((event: WorkshopEvent, el: HTMLElement) => {
    triggerRef.current = el;
    setActive(event);
  }, []);

  const closeModal = useCallback(() => {
    setActive(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold tracking-wide text-black uppercase">
        Past events
      </h3>

      <div className="relative mt-3">
        {scrollable && (
          <>
            <RailArrow
              direction={-1}
              disabled={atStart}
              onClick={() => page(-1)}
            />
            <RailArrow direction={1} disabled={atEnd} onClick={() => page(1)} />
          </>
        )}

        {/* `tabIndex` is not decoration: without it a keyboard user cannot
            scroll this region at all, because nothing inside it is reachable
            once the visible cards run out. */}
        <div
          ref={scrollerRef}
          role="region"
          aria-label="Past events"
          tabIndex={0}
          className={cn(
            "no-scrollbar snap-x overflow-x-auto pt-1 pb-3",
            CARD_FOCUS,
          )}
        >
          <div className="flex w-max flex-col gap-4">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-4">
                {row.map((event) => (
                  <PastEventCard
                    key={event.id}
                    event={event}
                    today={today}
                    onOpen={openModal}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The modal paints entirely from `--wk-*` tokens, which only exist under
          `.wk-root` and are only shipped by the /workshop routes. Without both
          of these it renders with no surface, no border and invisible text.
          Wrapping just the modal keeps the workshop palette off the dashboard's
          own cards, and the wrapper collapses to zero height when nothing is
          open, so its `--wk-page-grad` background never paints. */}
      <div className="wk-root">
        <WorkshopThemeStyles />
        <WorkshopDetailsModal event={active} onClose={closeModal} />
      </div>
    </div>
  );
}

function RailArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: -1 | 1;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        direction === -1 ? "Scroll past events left" : "Scroll past events right"
      }
      className={cn(
        // Sits OVER the rail's edge, not beside it: frosted glass needs content
        // behind it, and outside the rail there is only flat page to blur.
        "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center",
        "rounded-full border border-white/70 text-[#03535F] transition-opacity duration-200",
        "disabled:pointer-events-none disabled:opacity-0 sm:flex",
        direction === -1 ? "-left-1" : "-right-1",
        CARD_FOCUS,
      )}
      style={{
        background: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        // The DS clay recipe: lower inner shade, top highlight, soft lift.
        boxShadow:
          "inset 0 -4px 10px rgba(0, 0, 0, 0.10), inset 0 1px 1px rgba(255, 255, 255, 0.85), 0 4px 14px rgba(0, 0, 0, 0.12)",
      }}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * A past card, routed exactly as the calendar routes its tiles — same
 * `hasReplay` predicate, so the two surfaces cannot drift apart.
 *
 * The hover lift only goes on the two branches that actually do something. It
 * used to go on all of them, which is why a finished workshop looked clickable
 * and wasn't.
 */
function PastEventCard({
  event,
  today,
  onOpen,
}: {
  event: WorkshopEvent;
  today: string;
  onOpen: (event: WorkshopEvent, el: HTMLElement) => void;
}) {
  const interactive = cn(HUB_CARD_HOVER_CLASS, "cursor-pointer", CARD_FOCUS);

  // Any finished real workshop → the details modal, with or without a recording.
  if (hasReplay(event, today)) {
    return (
      <button
        type="button"
        data-event-card
        aria-label={`${event.title} — view details`}
        onClick={(e) => onOpen(event, e.currentTarget)}
        className={cn(CARD_BASE, interactive)}
      >
        <EventCardBody event={event} past />
      </button>
    );
  }

  // Anything with its own destination — hackathon, cohort, challenge.
  if (event.href) {
    const external = event.href.startsWith("http");
    return (
      <Link
        href={event.href}
        data-event-card
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(CARD_BASE, interactive)}
      >
        <EventCardBody event={event} past />
      </Link>
    );
  }

  // Nothing to open. Deliberately inert, and deliberately without the lift.
  return (
    <article data-event-card className={CARD_BASE}>
      <EventCardBody event={event} past />
    </article>
  );
}

function EventRail({
  title,
  events,
}: {
  title: string;
  events: (typeof EVENTS)[number][];
}) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold tracking-wide text-black uppercase">
        {title}
      </h3>
      <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pt-1 pb-3 snap-x snap-mandatory 2xl:flex-wrap 2xl:overflow-visible">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: (typeof EVENTS)[number] }) {
  const href =
    event.href ??
    (event.register ? `/workshop/events#${event.id}` : "/workshop/events");
  const ctaLabel = event.ctaLabel ?? (event.register ? "Register" : "View");

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-[#E0E0E0] p-5",
        HUB_CARD_HOVER_CLASS,
        "w-[280px] shrink-0 snap-start justify-between bg-white shadow-sm sm:w-[300px] 2xl:min-w-[300px] 2xl:max-w-[420px] 2xl:shrink 2xl:grow 2xl:basis-0",
      )}
    >
      <EventCardBody event={event} />
      <Link
        href={href}
        {...(event.href ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(HUB_CARD_CTA_CLASS, "mt-2 self-end")}
      >
        {ctaLabel}
      </Link>
    </article>
  );
}

/** The card's text block, shared so the past wrapper does not restate it. */
function EventCardBody({
  event,
  past = false,
}: {
  event: (typeof EVENTS)[number];
  past?: boolean;
}) {
  return (
    <div className="min-w-0">
      <h4
        className={cn(
          "font-inter text-base font-bold leading-snug text-black",
          past && "line-clamp-2 min-h-[2.75rem]",
        )}
      >
        {event.title}
      </h4>
      <p
        className={cn("mt-2 text-xs text-[#4B4B4B]", past && "line-clamp-1 min-h-4")}
      >
        {event.date} · {event.time}
      </p>
      <p
        className={cn(
          "mt-3 text-sm leading-relaxed text-[#4B4B4B]",
          past ? "line-clamp-3 min-h-[4.875rem]" : "line-clamp-3",
        )}
      >
        {event.desc}
      </p>
      <p
        className={cn("mt-3 text-xs text-[#4B4B4B]", past && "line-clamp-1 min-h-4")}
      >
        {event.location}
      </p>
    </div>
  );
}
