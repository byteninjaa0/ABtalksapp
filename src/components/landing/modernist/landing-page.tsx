import type { CSSProperties } from "react";
import Link from "next/link";
import { LandingNav } from "./landing-nav";
import { ConsentCard } from "./consent-card";
import "./landing.css";

/* The design encodes its type scale in inline styles — the clamp, tracking and
   optical-margin values do not survive being flattened into utilities, so they
   are kept verbatim. See docs/plans/070-modernist-landing-page.md §6 Step 4. */

const MUTED_INK = "color-mix(in srgb, var(--m-text) 70%, transparent)";
const BODY_INK = "color-mix(in srgb, var(--m-text) 78%, transparent)";

const HEADING: CSSProperties = {
  fontFamily: "var(--m-font-heading)",
  fontWeight: 800,
};

const KICKER: CSSProperties = {
  display: "block",
  fontSize: "13px",
  lineHeight: "14px",
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const KICKER_ACCENT: CSSProperties = { ...KICKER, color: "var(--m-accent-700)" };
const KICKER_MUTED: CSSProperties = { ...KICKER, color: MUTED_INK };

const H2: CSSProperties = {
  ...HEADING,
  fontSize: "clamp(28px, 3.4vw, 40px)",
  lineHeight: 1.1,
  letterSpacing: "-.015em",
  margin: 0,
};

const SHELL: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "0 clamp(20px, 5vw, 72px)",
};

const RULE: CSSProperties = {
  height: "2px",
  border: 0,
  margin: 0,
  background: "var(--m-divider)",
};

const STAT_FIGURE: CSSProperties = {
  ...HEADING,
  fontSize: "clamp(34px, 3.4vw, 48px)",
  lineHeight: "56px",
  letterSpacing: "-.03em",
  color: "var(--m-accent)",
  margin: "0 0 0 -0.045em",
  fontFeatureSettings: "'tnum' 1",
};

const STAT_LABEL: CSSProperties = {
  fontSize: "13px",
  lineHeight: "14px",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  margin: "14px 0 0",
  color: MUTED_INK,
};

const BRIDGE_CELL: CSSProperties = {
  border: "2px solid var(--m-divider)",
  padding: "28px 24px 24px",
  minHeight: "280px",
};

const BRIDGE_ITEM: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "baseline",
  fontSize: "15.5px",
  lineHeight: "24px",
};

const BRIDGE_BULLET: CSSProperties = {
  width: "9px",
  height: "9px",
  background: "var(--m-accent)",
  flex: "none",
  transform: "translateY(-1px)",
};

const FEAT_ROW: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(64px, 140px) minmax(0, 380px) minmax(0, 1fr)",
  gap: "28px clamp(24px, 4vw, 72px)",
  alignItems: "baseline",
  padding: "42px 0",
};

const FEAT_BODY: CSSProperties = {
  fontSize: "15.5px",
  lineHeight: "28px",
  margin: 0,
  maxWidth: "52ch",
  color: BODY_INK,
};

const LATTICE_CELL: CSSProperties = {
  background: "var(--m-bg)",
  padding: "28px 24px 32px",
};

const CELL_BODY: CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  margin: 0,
  color: BODY_INK,
};

const FAQ_SUMMARY: CSSProperties = {
  ...HEADING,
  fontSize: "20px",
  lineHeight: "28px",
  cursor: "pointer",
  listStyle: "none",
};

const FAQ_BODY: CSSProperties = {
  fontSize: "15.5px",
  lineHeight: "28px",
  margin: "16px 0 0",
  maxWidth: "60ch",
  color: BODY_INK,
};

const QUOTE: CSSProperties = {
  ...HEADING,
  fontSize: "clamp(22px, 2.2vw, 28px)",
  lineHeight: 1.25,
  letterSpacing: "-.015em",
  margin: 0,
};

const CAPTION: CSSProperties = {
  fontSize: "15.5px",
  lineHeight: "28px",
  margin: "24px 0 0",
  color: MUTED_INK,
};

const STATS = [
  { figure: "10k", label: "People on the platform" },
  { figure: "100+", label: "Companies in the recruiter network" },
  { figure: "0", label: "Profiles shared without consent" },
];

const CANDIDATE_ITEMS = [
  "Hackathons — weekend builds, judged and archived",
  "Cohorts — multi-week programs with mentors",
  "Challenges — scoped problems from real companies",
];

const COMPANY_ITEMS = [
  "Browse candidates by what they shipped",
  "Send us the role and the skills you need",
  "We build a cohort against that requirement",
];

const STEPS = [
  {
    number: "01",
    title: "A requirement comes in",
    body: "A company tells us the role, the stack, the level and the timeline. If a matching cohort is already running, we point at it. If not, we design one around the requirement.",
  },
  {
    number: "02",
    title: "People build in the open",
    body: "Candidates enter a hackathon, cohort or challenge. Work is submitted, reviewed by mentors and scored against a published rubric — the same rubric for everyone in the room.",
  },
  {
    number: "03",
    title: "The candidate releases the profile",
    body: "We show the company the evidence without the identity. When there is genuine interest on both sides, the candidate approves the release and the conversation starts — already past the screening stage.",
  },
];

const EVIDENCE = [
  {
    title: "Submitted work",
    body: "Repositories, demos and write-ups, timestamped to the event they were built in.",
  },
  {
    title: "Rubric scores",
    body: "How the work was judged, on criteria published before the event started.",
  },
  {
    title: "Mentor review",
    body: "Written notes from the people who watched the work happen, not a reference call.",
  },
  {
    title: "Team signal",
    body: "How they worked with others under a deadline — collaboration, scoped honestly.",
  },
];

const PROGRAMS = [
  {
    tag: "Hackathon",
    tagClass: "tag tag-accent",
    title: "48-hour build weekend",
    body: "Ship something end-to-end with a team you meet on Friday night. Judged Sunday, archived to your profile.",
    cadence: "Opens monthly · applications open",
    href: "/hackathon",
  },
  {
    tag: "Cohort",
    tagClass: "tag tag-outline",
    title: "Six-week mentored cohort",
    body: "Built around a live requirement from a hiring partner, so the work you do is the work they need done.",
    cadence: "Rolling intake · limited seats",
    href: "/program",
  },
  {
    tag: "Challenge",
    tagClass: "tag tag-outline",
    title: "Scoped company challenge",
    body: "A real problem, a clear brief, a week to answer it. Do it on your own schedule, from anywhere.",
    cadence: "Always open · start any day",
    href: "/challenges",
  },
];

const FAQS = [
  {
    q: "Does it cost anything to join a cohort?",
    a: "Taking part is free for candidates. Companies pay us when they hire, so nobody is ever charged for the chance to be seen.",
  },
  {
    q: "What exactly do companies see before I consent?",
    a: "The work and the scores, with your name, contact details and employer hidden. They can ask for access; you decide whether to grant it, company by company.",
  },
  {
    q: "Do I need to be a student or a developer?",
    a: "No. Cohorts run across engineering, design, data and product. Some people are in their first year of college, some are ten years into a career and want a different door.",
  },
  {
    q: "We have a niche requirement. Can you build a cohort for it?",
    a: "Yes — that is the normal way we work with companies. Send us the role, the stack and the timeline, and we design the challenge and recruit the cohort around it.",
  },
];

export function ModernistLanding() {
  return (
    <div className="modernist-landing">
      <LandingNav />

      <div style={SHELL}>
        {/* — hero — */}
        <section className="hero-sec" style={{ padding: "96px 0 72px" }}>
          <h1
            className="hero-h1"
            style={{
              ...HEADING,
              fontSize: "clamp(40px, 5.8vw, 78px)",
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              margin: "0 0 0 -0.058em",
            }}
          >
            <span
              style={{
                display: "block",
                textDecoration: "line-through",
                textDecorationThickness: "5px",
                textDecorationColor: "var(--m-accent)",
                color: "color-mix(in srgb, var(--m-text) 45%, transparent)",
                fontStyle: "italic",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              Interview
            </span>
            <span style={{ display: "block" }}>
              <span
                style={{
                  background: "var(--m-accent-200)",
                  boxDecorationBreak: "clone",
                  WebkitBoxDecorationBreak: "clone",
                  padding: "0 .1em",
                  marginLeft: "-.1em",
                }}
              >
                Evidence-based hiring.
              </span>
            </span>
          </h1>
          <p
            className="hero-sub"
            style={{
              fontSize: "17px",
              lineHeight: "28px",
              maxWidth: "58ch",
              margin: "36px 0 0",
            }}
          >
            ABTalks runs hackathons, cohorts and challenges where people build in
            public. Companies see the work, not a rehearsed answer. We sit in the
            middle: matching real output to real requirements, and never sharing
            a profile without the candidate saying yes first.
          </p>
          <div
            className="hero-row"
            style={{
              display: "flex",
              gap: "var(--m-space-3)",
              flexWrap: "wrap",
              marginTop: "32px",
            }}
          >
            <Link className="btn btn-primary" href="/program">
              Join the next cohort
            </Link>
            <Link className="btn btn-ghost" href="/talent">
              Post a requirement
            </Link>
          </div>
        </section>

        <hr style={RULE} />

        {/* — stats — */}
        <section
          className="two statgrid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, auto)",
            justifyContent: "space-between",
            gap: "28px 56px",
            padding: "44px 0",
          }}
        >
          {STATS.map((stat) => (
            <div className="stat" key={stat.figure}>
              <p style={STAT_FIGURE}>{stat.figure}</p>
              <p className="stat-label" style={STAT_LABEL}>
                {stat.label}
              </p>
            </div>
          ))}
        </section>

        <hr style={RULE} />

        {/* — old signal / ABTalks signal — */}
        <section
          className="two"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "56px",
            padding: "56px 0",
          }}
        >
          <div>
            <span style={{ ...KICKER_MUTED, margin: "0 0 16px" }}>
              The old signal
            </span>
            <p
              style={{
                ...HEADING,
                fontSize: "24px",
                lineHeight: "28px",
                letterSpacing: "-.01em",
                margin: 0,
              }}
            >
              A 45-minute interview, a resume, and a guess.
            </p>
            <p
              style={{
                fontSize: "15.5px",
                lineHeight: "28px",
                margin: "16px 0 0",
                maxWidth: "46ch",
                color: BODY_INK,
              }}
            >
              Performance under interview conditions is a proxy. It rewards
              practice at interviewing, filters on pedigree, and tells you almost
              nothing about how someone works over four weeks with other people.
            </p>
          </div>
          <div>
            <span style={{ ...KICKER_ACCENT, margin: "0 0 16px" }}>
              The ABTalks signal
            </span>
            <p
              style={{
                ...HEADING,
                fontSize: "24px",
                lineHeight: "28px",
                letterSpacing: "-.01em",
                margin: 0,
              }}
            >
              Shipped work, timestamped, reviewed, and attributable.
            </p>
            <p
              style={{
                fontSize: "15.5px",
                lineHeight: "28px",
                margin: "16px 0 0",
                maxWidth: "46ch",
                color: BODY_INK,
              }}
            >
              {"Every hackathon, cohort sprint and challenge leaves a record: what was built, how it was scored, what the mentors and teammates said. That record is the candidate's, and it travels with their consent."}
            </p>
          </div>
        </section>

        <hr style={RULE} />

        {/* — the bridge — */}
        <section className="sec" style={{ padding: "64px 0 72px" }}>
          <span style={{ ...KICKER_ACCENT, margin: "0 0 14px" }}>
            The bridge
          </span>
          <h2 style={{ ...H2, margin: "0 0 48px" }}>
            Talent on one side. Requirements on the other.
          </h2>

          <div
            className="bridge"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 92px minmax(200px, 0.72fr) 92px 1fr",
              alignItems: "stretch",
              gap: 0,
            }}
          >
            <div style={BRIDGE_CELL}>
              <span style={{ ...KICKER_MUTED, margin: "0 0 18px" }}>
                Candidates
              </span>
              <p
                style={{
                  ...HEADING,
                  fontSize: "22px",
                  lineHeight: "26px",
                  letterSpacing: "-.01em",
                  margin: "0 0 20px",
                }}
              >
                Make yourself visible by building.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {CANDIDATE_ITEMS.map((item) => (
                  <li key={item} style={BRIDGE_ITEM}>
                    <span style={BRIDGE_BULLET} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="conn"
              style={{ display: "flex", alignItems: "center", padding: "0 14px" }}
            >
              <div
                className="conn-rule"
                style={{ height: "2px", flex: 1, background: "var(--m-text)" }}
              />
              <div
                className="arrow-r"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: "10px solid var(--m-text)",
                }}
              />
            </div>

            <div
              style={{
                background: "var(--m-accent)",
                color: "var(--m-bg)",
                padding: "32px 24px",
                minHeight: "280px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <span style={{ ...KICKER, margin: "0 0 16px" }}>The bridge</span>
              <p
                style={{
                  ...HEADING,
                  fontSize: "clamp(28px, 3vw, 36px)",
                  lineHeight: 1.06,
                  letterSpacing: "-.02em",
                  margin: "0 0 16px",
                }}
              >
                ABTalks
              </p>
              <p style={{ fontSize: "15.5px", lineHeight: "24px", margin: 0 }}>
                We run the programs, score the work, and match evidence to
                requirements. Profiles move only when the candidate releases
                them.
              </p>
            </div>

            <div
              className="conn"
              style={{ display: "flex", alignItems: "center", padding: "0 14px" }}
            >
              <div
                className="arrow-l"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderRight: "10px solid var(--m-text)",
                }}
              />
              <div
                className="conn-rule"
                style={{ height: "2px", flex: 1, background: "var(--m-text)" }}
              />
            </div>

            <div style={BRIDGE_CELL}>
              <span style={{ ...KICKER_MUTED, margin: "0 0 18px" }}>
                Companies
              </span>
              <p
                style={{
                  ...HEADING,
                  fontSize: "22px",
                  lineHeight: "26px",
                  letterSpacing: "-.01em",
                  margin: "0 0 20px",
                }}
              >
                Hire from proof, or commission it.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {COMPANY_ITEMS.map((item) => (
                  <li key={item} style={BRIDGE_ITEM}>
                    <span style={BRIDGE_BULLET} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <hr style={RULE} />

        {/* — privacy — */}
        <section id="privacy" className="sec" style={{ padding: "64px 0" }}>
          <div
            className="two"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "56px",
              alignItems: "start",
            }}
          >
            <div
              className="consent-panel"
              style={{
                borderLeft: "6px solid var(--m-accent)",
                paddingLeft: "32px",
              }}
            >
              <span style={{ ...KICKER_ACCENT, margin: "0 0 18px" }}>
                Consent first
              </span>
              <h2 style={H2}>
                {"We do not share a candidate's profile until they allow us to."}
              </h2>
              <p
                style={{
                  fontSize: "16px",
                  lineHeight: "28px",
                  margin: "24px 0 0",
                  maxWidth: "52ch",
                }}
              >
                No profile, contact detail or project record leaves ABTalks
                without an explicit release from the person it belongs to.
                Companies see anonymised evidence first — the work, the scores,
                the review notes. The name arrives only after the candidate says
                yes to that company, for that role. Consent is per-request, and
                it can be withdrawn at any time.
              </p>
            </div>

            <ConsentCard />
          </div>
        </section>

        <hr style={RULE} />

        {/* — how it works — */}
        <section id="how" className="sec" style={{ padding: "64px 0 40px" }}>
          <span style={{ ...KICKER_ACCENT, margin: "0 0 32px" }}>
            How it works
          </span>

          {STEPS.map((step, index) => (
            <div
              key={step.number}
              className="feat"
              style={
                index === 0
                  ? FEAT_ROW
                  : { ...FEAT_ROW, borderTop: "2px solid var(--m-divider)" }
              }
            >
              <p
                style={{
                  ...HEADING,
                  fontSize: "15px",
                  lineHeight: "28px",
                  margin: 0,
                }}
              >
                {step.number}
              </p>
              <h3
                style={{
                  ...HEADING,
                  fontSize: "24px",
                  lineHeight: "28px",
                  letterSpacing: "-.01em",
                  margin: 0,
                }}
              >
                {step.title}
              </h3>
              <p style={FEAT_BODY}>{step.body}</p>
            </div>
          ))}
        </section>

        <hr style={RULE} />

        {/* — evidence — */}
        <section id="evidence" className="sec" style={{ padding: "64px 0 72px" }}>
          <span style={{ ...KICKER_ACCENT, margin: "0 0 14px" }}>
            What a profile actually contains
          </span>
          <h2 style={{ ...H2, margin: "0 0 40px" }}>
            Four kinds of evidence, none of them self-reported.
          </h2>
          <div
            className="steps"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "2px",
              background: "var(--m-divider)",
            }}
          >
            {EVIDENCE.map((cell) => (
              <div key={cell.title} className="lattice-cell" style={LATTICE_CELL}>
                <p
                  style={{
                    ...HEADING,
                    fontSize: "18px",
                    lineHeight: "24px",
                    margin: "0 0 12px",
                  }}
                >
                  {cell.title}
                </p>
                <p style={CELL_BODY}>{cell.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr style={RULE} />

        {/* — programs — */}
        <section
          id="hackathons"
          className="sec"
          style={{ padding: "64px 0 72px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "24px",
              flexWrap: "wrap",
              margin: "0 0 40px",
            }}
          >
            <div>
              <span style={{ ...KICKER_ACCENT, margin: "0 0 14px" }}>
                Open right now
              </span>
              <h2 style={H2}>Something is always running. Come build in it.</h2>
            </div>
            <Link className="btn btn-ghost" href="/hackathon">
              See the full calendar
            </Link>
          </div>
          <div
            className="steps"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "2px",
              background: "var(--m-divider)",
            }}
          >
            {PROGRAMS.map((program) => (
              <Link
                key={program.tag}
                href={program.href}
                className="lattice-cell"
                style={{
                  ...LATTICE_CELL,
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  className={program.tagClass}
                  style={{ alignSelf: "flex-start" }}
                >
                  {program.tag}
                </span>
                <p
                  style={{
                    ...HEADING,
                    fontSize: "20px",
                    lineHeight: "26px",
                    margin: 0,
                  }}
                >
                  {program.title}
                </p>
                <p style={CELL_BODY}>{program.body}</p>
                <p
                  style={{
                    fontSize: "13px",
                    lineHeight: "14px",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    margin: "auto 0 0",
                    color: MUTED_INK,
                  }}
                >
                  {program.cadence}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <hr style={RULE} />

        {/* — testimonials — */}
        <section className="sec" style={{ padding: "64px 0 72px" }}>
          <span style={{ ...KICKER_ACCENT, margin: "0 0 40px" }}>
            From both sides of the bridge
          </span>
          <div
            className="two"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "56px",
            }}
          >
            <figure style={{ margin: 0 }}>
              <blockquote className="hangq" style={QUOTE}>
                {"“We saw four weeks of her work before we ever spoke to her. The interview was a conversation, not a test.”"}
              </blockquote>
              <figcaption style={CAPTION}>
                — Hiring lead, product engineering team
              </figcaption>
            </figure>
            <figure style={{ margin: 0 }}>
              <blockquote className="hangq" style={QUOTE}>
                {"“I'd been rejected on my resume a dozen times. Here they looked at what I built, and I chose who got to see it.”"}
              </blockquote>
              <figcaption style={CAPTION}>
                — Cohort graduate, hired in 2025
              </figcaption>
            </figure>
          </div>
        </section>

        <hr style={RULE} />

        {/* — FAQ — */}
        <section id="faq" className="sec" style={{ padding: "64px 0 24px" }}>
          <span style={{ ...KICKER_ACCENT, margin: "0 0 32px" }}>
            Questions people ask us
          </span>
          {FAQS.map((faq, index) => (
            <details
              key={faq.q}
              style={{
                borderTop: "2px solid var(--m-divider)",
                borderBottom:
                  index === FAQS.length - 1
                    ? "2px solid var(--m-divider)"
                    : undefined,
                padding: "24px 0",
              }}
            >
              <summary className="faq-sum" style={FAQ_SUMMARY}>
                {faq.q}
              </summary>
              <p style={FAQ_BODY}>{faq.a}</p>
            </details>
          ))}
        </section>
      </div>

      {/* — the one accent field on the page — */}
      <section style={{ background: "var(--m-accent)", color: "var(--m-bg)" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "84px clamp(20px, 5vw, 72px)",
          }}
        >
          <h3
            style={{
              ...HEADING,
              fontSize: "clamp(32px, 4.2vw, 56px)",
              lineHeight: 1.06,
              letterSpacing: "-.015em",
              margin: "0 0 0 -0.058em",
            }}
          >
            <span style={{ display: "block" }}>Stop guessing in interviews.</span>
            <span style={{ display: "block" }}>
              Hire what you have already seen.
            </span>
          </h3>
          <div
            style={{
              display: "flex",
              gap: "var(--m-space-3)",
              flexWrap: "wrap",
              marginTop: "42px",
            }}
          >
            <Link className="btn btn-ghost btn-invert" href="/talent">
              Post a requirement
            </Link>
            <Link className="btn btn-ghost btn-invert" href="/program">
              Join the next cohort
            </Link>
          </div>
        </div>
      </section>

      <div style={SHELL}>
        <footer
          className="footer"
          style={{
            padding: "56px 0",
            fontSize: "13px",
            lineHeight: "28px",
            display: "flex",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap",
            color: MUTED_INK,
          }}
        >
          <span>ABTalks — evidence-based hiring</span>
          <span>Profiles are shared only with candidate consent.</span>
        </footer>
      </div>
    </div>
  );
}
