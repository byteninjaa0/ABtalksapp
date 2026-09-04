import type { ReactNode } from "react";

/**
 * Recruiter-safe professional history. Dates are ISO strings so this stays a
 * serialisable prop at the Server/Client boundary.
 */
export type ProfessionalExperience = {
  title: string;
  /** Null means the candidate hid their current employer. */
  companyName: string | null;
  startedOn: string | null;
  endedOn: string | null;
  isCurrent: boolean;
};

function monthYear(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateRange(experience: ProfessionalExperience): string | null {
  const start = monthYear(experience.startedOn);
  const end = experience.isCurrent ? "Present" : monthYear(experience.endedOn);
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? null;
}

function line(experience: ProfessionalExperience): ReactNode {
  const company = experience.companyName?.trim();
  const dates = dateRange(experience);
  return (
    <>
      <span className="desk-career__title">{experience.title}</span>
      {company && <span className="desk-career__company"> at {company}</span>}
      {dates && <span className="desk-career__dates"> · {dates}</span>}
    </>
  );
}

/** A concise timeline keeps professional histories scannable on a result card. */
export function CareerTimeline({
  experiences,
  max = 3,
  heading = "Professional experience",
}: {
  experiences?: ProfessionalExperience[];
  max?: number;
  heading?: string;
}) {
  const shown = (experiences ?? [])
    .filter((experience) => experience.title.trim())
    .slice(0, max);
  if (shown.length === 0) return null;

  return (
    <section className="desk-career" aria-label={heading}>
      <p className="desk-career__label">{heading}</p>
      <ol className="desk-career__list">
        {shown.map((experience, index) => (
          <li
            key={`${experience.title}-${experience.startedOn ?? ""}-${index}`}
            className="desk-career__item"
          >
            <span className="desk-career__rail" aria-hidden="true">
              <span
                className={
                  index === 0
                    ? "desk-career__dot is-current"
                    : "desk-career__dot"
                }
              />
              {index < shown.length - 1 && (
                <span className="desk-career__line" />
              )}
            </span>
            <p className="desk-career__entry">{line(experience)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
