/**
 * Plan 151 §11/§36 — rarity is encoded by SHAPE plus its text label, never by
 * colour alone. Common circle · Uncommon rounded square · Rare hexagon ·
 * Epic shield · Legendary notched star.
 */
import { cn } from "@/lib/utils";

const PATHS: Record<string, string> = {
  Common: "M32 4a28 28 0 1 0 0 56 28 28 0 0 0 0-56Z",
  Uncommon: "M14 4h36a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H14A10 10 0 0 1 4 50V14A10 10 0 0 1 14 4Z",
  Rare: "M32 3 57 17.5v29L32 61 7 46.5v-29L32 3Z",
  Epic: "M32 3 58 12v22c0 14-11 24-26 30C17 58 6 48 6 34V12L32 3Z",
  Legendary:
    "M32 2 39.6 18.6 57.6 21 45 34.2 48.4 52 32 43.6 15.6 52 19 34.2 6.4 21l18-2.4L32 2Z",
};

export function TierShape({
  rarity,
  earned,
  className,
  children,
}: {
  rarity: string;
  earned: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const path = PATHS[rarity] ?? PATHS.Common;
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <svg viewBox="0 0 64 64" className="size-full" aria-hidden="true">
        <path
          d={path}
          fill={earned ? "#EEF6F6" : "#F4F4F4"}
          stroke={earned ? "#03535F" : "#C9CFCF"}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          earned ? "text-[#03535F]" : "text-[#8F8F8F]",
        )}
      >
        {children}
      </span>
    </span>
  );
}
