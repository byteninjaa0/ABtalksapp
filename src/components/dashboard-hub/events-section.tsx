"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

/**
 * Past card shell. Wider than the old grid cell and `overflow-hidden` so the
 * hover sheen is clipped to the rounded corner.
 */
const CARD_BASE =
  "group relative isolate flex w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#E0E0E0] bg-gradient-to-b from-white to-[#FBFDFD] p-6 text-left sm:w-[340px]";

/**
 * Hover and focus, for the two clickable branches only.
 *
 * Lift, then an aqua hairline and a teal glow spreading under the card. Focus
 * gets the identical treatment rather than a default outline, so a keyboard
 * user sees exactly what a mouse user sees.
 */
const CARD_INTERACTIVE = [
  "cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-out",
  "hover:-translate-y-1 hover:border-[#7FD4DE]",
  "hover:shadow-[0_14px_34px_-10px_rgba(3,83,95,0.38),0_0_0_1px_rgba(127,212,222,0.65)]",
  "focus-visible:outline-none focus-visible:-translate-y-1 focus-visible:border-[#7FD4DE]",
  "focus-visible:shadow-[0_14px_34px_-10px_rgba(3,83,95,0.38),0_0_0_1px_rgba(127,212,222,0.65)]",
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0",
].join(" ");

const CARD_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]";

/**
 * Truncation to N lines, spelled out rather than left to `line-clamp-N`.
 *
 * `-webkit-line-clamp` only binds on a `-webkit-box`, and the utility cannot be
 * relied on to set that display here — which is how the old card ended up with
 * the clamp declared and ignored, laying four lines out inside a three-line
 * box. Writing the display explicitly is what makes the clamp take, and the
 * clamp is what supplies the ellipsis.
 *
 * It is still not the thing holding the layout together: the exact `h-*` on
 * each box is. If the clamp failed again the text could only be cut cleanly at
 * the box edge, never painted over the line beneath it.
 */
function clampStyle(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

/**
 * The gloss. A soft white band, skewed and parked off the left edge, that
 * sweeps across on hover. `overflow-hidden` on the card clips it to the
 * corners; `motion-reduce:hidden` removes it entirely rather than leaving a
 * stationary streak across the card.
 */
function CardSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent transition-[left] duration-700 ease-out group-hover:left-full motion-reduce:hidden"
    />
  );
}

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
  // Any finished real workshop → the details modal, with or without a recording.
  if (hasReplay(event, today)) {
    return (
      <button
        type="button"
        data-event-card
        aria-label={`${event.title} — view details`}
        onClick={(e) => onOpen(event, e.currentTarget)}
        className={cn(CARD_BASE, CARD_INTERACTIVE)}
      >
        <CardSheen />
        <PastEventCardBody event={event} clickable />
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
        className={cn(CARD_BASE, CARD_INTERACTIVE)}
      >
        <CardSheen />
        <PastEventCardBody event={event} clickable />
      </Link>
    );
  }

  // Nothing to open. No lift, no glow, no sheen, no chevron — the card must not
  // promise a click it cannot honour.
  return (
    <article data-event-card className={CARD_BASE}>
      <PastEventCardBody event={event} clickable={false} />
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

/** The upcoming card's text block. Unchanged from before the shelf landed. */
function EventCardBody({ event }: { event: (typeof EVENTS)[number] }) {
  return (
    <div className="min-w-0">
      <h4 className="font-inter text-base font-bold leading-snug text-black">
        {event.title}
      </h4>
      <p className="mt-2 text-xs text-[#4B4B4B]">
        {event.date} · {event.time}
      </p>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[#4B4B4B]">
        {event.desc}
      </p>
      <p className="mt-3 text-xs text-[#4B4B4B]">{event.location}</p>
    </div>
  );
}

/**
 * The past card's own text block.
 *
 * Every text box here states an explicit height with `overflow-hidden` rather
 * than trusting `line-clamp`. In this build `line-clamp-3` emits the clamp but
 * leaves `display: flow-root`, so the clamp is inert — measured, not assumed:
 * a 4-line description rendered 91px inside a 78px `min-height` box and spilled
 * its last line over the location underneath. The old 3-column grid was wide
 * enough that descriptions fitted in 3 lines anyway, which is why the bug only
 * appeared once the cards narrowed. The clamp classes stay for their ellipsis
 * where the build does honour them; the heights are what guarantee the layout.
 *
 * `leading-6` over `leading-relaxed` for the same reason: 24px lines divide
 * into the box exactly, where 22.75px left a third line clipped through its
 * descenders.
 */
function PastEventCardBody({
  event,
  clickable,
}: {
  event: WorkshopEvent;
  clickable: boolean;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Every text box states an exact height and hides its overflow. The
          clamp alone was not enough: the old card set `min-height` and trusted
          `line-clamp-3`, and a four-line description laid out 91px inside a
          78px minimum and spilled its last line over the location beneath it.
          An exact height plus `overflow: hidden` cannot do that whatever the
          clamp does, and it keeps every card in the row the same height. */}
      <div>
        <span
          className="w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] inline-block"
          style={{
            color: event.accent,
            background: `color-mix(in srgb, ${event.accent} 12%, transparent)`,
          }}
        >
          {event.tag}
        </span>

        <h4
          className="mt-3 h-12 font-inter text-[17px] font-bold leading-6 text-black"
          style={clampStyle(2)}
        >
          {event.title}
        </h4>

        <p className="mt-1.5 truncate text-xs font-medium text-[#6B7477]">
          {event.date} · {event.time}
        </p>

        <p
          className="mt-3 h-18 text-sm leading-6 text-[#4B4B4B]"
          style={clampStyle(3)}
        >
          {event.desc}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="truncate text-xs text-[#6B7477]">{event.location}</span>
        {clickable && (
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-[#03535F] opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          />
        )}
      </div>
    </div>
  );
}
