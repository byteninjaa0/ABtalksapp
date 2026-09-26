import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Shared pieces for the three stage panels (server-safe). */

export const STAGE_CARD =
  "rounded-3xl border border-[#E6E9E9] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]";

export const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#03535F]";

/** Outline pill button (secondary action). */
export const PILL_OUTLINE =
  "inline-flex h-11 items-center justify-center rounded-full border-[1.5px] border-[#03535F] bg-white px-5 text-sm font-semibold text-[#03535F] transition-colors hover:bg-[#EEF6F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]";

/** Solid pill button (the one thing to do next). */
export const PILL_SOLID =
  "inline-flex h-11 items-center justify-center rounded-full bg-[#03535F] px-5 text-sm font-semibold text-white shadow-[inset_0_-4px_12px_rgba(0,0,0,0.25)] transition-colors hover:bg-[#076573] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]";

/** Heading word with the brand-teal accent: <Accent>skills</Accent>. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-[#03535F]">{children}</span>;
}

/** Underlined text link with an arrow, as used for "Next: Test skills →". */
export function ArrowLink({
  href,
  children,
  back = false,
  className,
}: {
  href: string;
  children: ReactNode;
  back?: boolean;
  className?: string;
}) {
  const Arrow = back ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-semibold text-[#03535F] underline decoration-[1.5px] underline-offset-[6px] hover:decoration-2",
        className,
      )}
    >
      {back ? <Arrow className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> : null}
      {children}
      {back ? null : <Arrow className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </Link>
  );
}

/** Two-tone title, sub copy, right-hand slot. */
export function StageHeader({
  title,
  accent,
  sub,
  aside,
}: {
  title: string;
  accent: string;
  sub: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <h2 className="font-heading text-3xl font-bold tracking-tight text-black sm:text-[40px] sm:leading-[1.1]">
          {title} <Accent>{accent}</Accent>
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4B4B4B]">{sub}</p>
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-6">{aside}</div> : null}
    </div>
  );
}

/** Section title inside a panel: "More ways to build skills" + link. */
export function PanelSubhead({
  title,
  accent,
  aside,
  id,
}: {
  title: string;
  accent: string;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 items-end justify-between gap-4">
      <h3 className="font-heading text-2xl font-bold tracking-tight text-black">
        {title} <Accent>{accent}</Accent>
      </h3>
      {aside}
    </div>
  );
}
