type HeroGreetingProps = {
  firstName: string | null;
  /** Current IST hour (0–23), from the page — shared with the greeting sky. */
  istHour: number;
};

function getGreeting(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function HeroGreeting({ firstName, istHour }: HeroGreetingProps) {
  const greeting = getGreeting(istHour);

  return (
    // data-sky-text: the greeting sky measures this to keep the moon clear of it.
    <div data-sky-text>
      <h1 className="font-inter text-3xl font-bold tracking-tight text-[color:var(--hero-ink,#000000)] transition-colors duration-700 sm:text-4xl">
        {firstName ? `${greeting}, ${firstName}` : "Welcome"}
      </h1>
      <p className="mt-2 text-[color:var(--hero-ink-soft,#4B4B4B)] transition-colors duration-700">
        {firstName
          ? "Pick up where you left off or explore something new."
          : "Sign in to your hub to browse challenges, events, and resources."}
      </p>
    </div>
  );
}
