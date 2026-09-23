import type { PublicScoreSlice } from "@/components/hire/match-card";

/**
 * What each ranking dimension measures, in the order of its default weight.
 * Every line follows the formula in `features/hire/score-candidate.ts`; change
 * them together. All seven are scored against the recruiter's current search.
 */
const PARAMS: {
  key: keyof PublicScoreSlice;
  label: string;
  source: "ABTalks record" | "Declared";
  means: string;
}[] = [
  {
    key: "stack",
    label: "Stack match",
    source: "Declared",
    means:
      "Skills on their profile against the must-have and nice-to-have skills in this search.",
  },
  {
    key: "missions",
    label: "Missions",
    source: "ABTalks record",
    means:
      "Coding missions passed, out of the missions available so far in their cohort.",
  },
  {
    key: "cleanPass",
    label: "First-attempt pass",
    source: "ABTalks record",
    means:
      "Share of passed missions that passed the automated check on the first run.",
  },
  {
    key: "projects",
    label: "Projects",
    source: "ABTalks record",
    means: "Reviewer scores on cohort projects, weighted toward their best one.",
  },
  {
    key: "consistency",
    label: "Commit consistency",
    source: "ABTalks record",
    means:
      "Days with a GitHub commit, out of the days elapsed in their cohort (last 30 at most).",
  },
  {
    key: "interview",
    label: "Mock interview",
    source: "ABTalks record",
    means:
      "Average of their mock-interview scores for communication, technical, problem solving and overall.",
  },
  {
    key: "experience",
    label: "Experience",
    source: "Declared",
    means: "How their years of experience fit the range in this search.",
  },
];

/** Plain score bands. Nothing here compares the candidate with anyone else. */
function band(value: number | null, source: string) {
  if (value === null) return { label: "Not scored", tone: "none" } as const;
  if (value === 0) {
    return {
      label: source === "Declared" ? "No match" : "None on record",
      tone: "low",
    } as const;
  }
  if (value >= 80) return { label: "Strong", tone: "high" } as const;
  if (value >= 50) return { label: "Moderate", tone: "mid" } as const;
  return { label: "Low", tone: "low" } as const;
}

/**
 * One bar per ranking dimension, each on its own 0–100 scale. Null = the pool
 * has no evidence for it, so it is never drawn; 0 = this candidate has none.
 */
export function HireScoreChart({ scores }: { scores: PublicScoreSlice }) {
  if (PARAMS.every((p) => scores[p.key] === null)) {
    return (
      <p className="hire-detail__p">
        Evaluation scores have not been recorded for this candidate yet.
      </p>
    );
  }

  return (
    <ul
      className="hire-scorecard"
      aria-label="Candidate scores for this search, out of 100"
    >
      {PARAMS.map((p) => {
        const value = scores[p.key];
        const b = band(value, p.source);
        return (
          <li key={p.key} className="hire-scorecard__row" data-tone={b.tone}>
            <div className="hire-scorecard__head">
              <span className="hire-scorecard__label">{p.label}</span>
              <span className="hire-scorecard__source">{p.source}</span>
              <span className="hire-scorecard__value">
                {value === null ? (
                  "Not scored"
                ) : (
                  <>
                    <b>{value}</b>/100 · {b.label}
                  </>
                )}
              </span>
            </div>
            {value !== null && (
              <div className="hire-scorecard__track" aria-hidden="true">
                <span
                  className="hire-scorecard__fill"
                  style={{ width: `${value}%` }}
                />
              </div>
            )}
            <p className="hire-scorecard__means">{p.means}</p>
          </li>
        );
      })}
    </ul>
  );
}
