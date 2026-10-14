import { cn } from "@/lib/utils";

/**
 * The brand wordmark, rendered as TYPE rather than a bitmap.
 *
 * Plan 189 replaced `/abtalks-logo.png` with text so the brand lives in one
 * string in one file: the next rename is this component, not 23 call sites and
 * two PNGs. Type also scales without artefacts, inherits `currentColor` so it
 * needs no separate dark-mode asset, and is selectable and searchable.
 *
 * `size` maps to the pixel heights the old <Image> calls used — lg 84, md 42,
 * sm 32 — so each call site keeps roughly the footprint it had.
 */
const SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
} as const;

export function Wordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight whitespace-nowrap select-none",
        SIZES[size],
        className,
      )}
    >
      klymb<span className="text-primary">.AI</span>
    </span>
  );
}
