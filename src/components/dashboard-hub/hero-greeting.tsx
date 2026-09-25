import { Star } from "lucide-react";

type HeroGreetingProps = {
  firstName: string | null;
  /** Current IST hour (0–23), from the page — shared with the greeting sky. */
  istHour: number;
  synergyPoints: number;
};

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "SHALLIKA" / "shallika" → "Shallika". */
function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function HeroGreeting({ firstName, istHour, synergyPoints }: HeroGreetingProps) {
  const greeting = getGreeting(istHour);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {/* data-sky-text: the greeting sky measures this to keep the moon clear of it. */}
      <div data-sky-text>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-[color:var(--hero-ink,#000000)] transition-colors duration-700 sm:text-[40px] sm:leading-[1.1]">
          {firstName ? (
            <>
              {greeting},{" "}
              <span className="text-[color:var(--hero-accent,#03535F)] transition-colors duration-700">
                {displayName(firstName)}.
              </span>
            </>
          ) : (
            "Welcome."
          )}
        </h1>
        <p className="mt-2 text-[15px] text-[color:var(--hero-ink-soft,#4B4B4B)] transition-colors duration-700">
          Three stages from your first task to your first job. Pick one to open it.
        </p>
      </div>
      <p className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[#E6E9E9] bg-white px-4 py-2 text-xs text-black shadow-[0_4px_14px_-8px_rgba(0,0,0,0.25)] sm:self-auto">
        <Star className="size-4 fill-[#2BD4A0] text-[#03535F]" aria-hidden="true" />
        <span className="font-bold">{synergyPoints.toLocaleString("en-IN")}</span>
        <span className="font-semibold">Synergy pts</span>
      </p>
    </div>
  );
}
