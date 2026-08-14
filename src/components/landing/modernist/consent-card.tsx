"use client";

import { Fragment, useState, type CSSProperties } from "react";

const MUTED_INK = "color-mix(in srgb, var(--m-text) 70%, transparent)";

const KICKER: CSSProperties = {
  fontSize: "13px",
  lineHeight: "14px",
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const ROW: CSSProperties = {
  fontSize: "15px",
  lineHeight: "28px",
  margin: 0,
  padding: "8px 0",
  borderBottom: "1px solid var(--m-neutral-300)",
};

/** The evidence rows never change — only the identity does. That asymmetry is
 *  the whole point of the pattern, so it is expressed as data, not markup. */
const EVIDENCE_ROWS = [
  { label: "Submitted work — 3 projects", tabular: true },
  { label: "Rubric score — cohort 14", tabular: true },
  { label: "Mentor review notes", tabular: false },
];

export function ConsentCard() {
  const [released, setReleased] = useState(false);

  return (
    <div
      style={{
        border: "2px solid var(--m-divider)",
        background: "var(--m-neutral-100)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "16px",
          padding: "16px 20px",
          borderBottom: "2px solid var(--m-divider)",
        }}
      >
        <span style={{ ...KICKER, color: MUTED_INK }}>What a company sees</span>
        <span style={{ ...KICKER, color: "var(--m-accent-700)" }}>
          {released ? "Released by candidate" : "Awaiting consent"}
        </span>
      </div>

      <div
        style={{
          padding: "24px 20px",
          display: "flex",
          gap: "16px",
          alignItems: "center",
          borderBottom: "2px solid var(--m-divider)",
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            flex: "none",
            border: "2px solid var(--m-divider)",
            background:
              "repeating-linear-gradient(135deg, color-mix(in srgb, var(--m-text) 8%, transparent) 0 6px, transparent 6px 12px)",
          }}
        />
        {/* keyed so the blur-in replays each time consent flips */}
        <div className="consent-id" key={released ? "released" : "withheld"}>
          <p
            style={{
              fontFamily: "var(--m-font-heading)",
              fontWeight: "var(--m-font-heading-weight)" as CSSProperties["fontWeight"],
              fontSize: "20px",
              lineHeight: "26px",
              margin: 0,
            }}
          >
            {released ? "Meera Raghavan" : "Candidate #4128"}
          </p>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "20px",
              margin: "4px 0 0",
              color: MUTED_INK,
            }}
          >
            {released
              ? "Bengaluru · available from September"
              : "Frontend & product · cohort 14"}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "0 16px",
          padding: "8px 20px 16px",
        }}
      >
        {EVIDENCE_ROWS.map((row) => (
          <Fragment key={row.label}>
            <p style={ROW}>{row.label}</p>
            <p
              style={{
                ...ROW,
                color: MUTED_INK,
                ...(row.tabular ? { fontFeatureSettings: "'tnum' 1" } : null),
              }}
            >
              visible
            </p>
          </Fragment>
        ))}
        <p style={{ ...ROW, borderBottom: "none" }}>Name, contact, employer</p>
        <p
          style={{
            ...ROW,
            borderBottom: "none",
            color: released ? "var(--m-accent-700)" : MUTED_INK,
          }}
        >
          {released ? "shared" : "hidden until approved"}
        </p>
      </div>

      <div
        style={{
          padding: "0 20px 20px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setReleased((value) => !value)}
        >
          {released ? "Withdraw access" : "Request access"}
        </button>
        <span
          style={{ fontSize: "14px", lineHeight: "20px", color: MUTED_INK }}
        >
          {released
            ? "Meera approved this company, for this role."
            : "The request goes to the candidate, not to us."}
        </span>
      </div>
    </div>
  );
}
