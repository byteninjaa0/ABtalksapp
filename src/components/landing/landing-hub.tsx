import Image from "next/image";
import Link from "next/link";
import type { LandingState } from "@/features/landing/get-landing-state";
import { HubNav } from "./hub/hub-nav";
import { HeroHeadline } from "./hub/hero-headline";
import { HubStatsStrip } from "./hub/hub-stats-strip";
import { HowItWorks } from "./hub/how-it-works";
import { ConsentTiltCard } from "./hub/consent-tilt-card";
import { CommunityCollage } from "./hub/community-collage";
import { HubTestimonials } from "./hub/hub-testimonials";
import { HubProgramReveal } from "./hub/hub-program-reveal";
import { HubBridgeTiles } from "./hub/hub-bridge-tiles";
import "./hub/landing-hub.css";

const WHATSAPP_LINK = "https://chat.whatsapp.com/LSru1BgvifpEB4OMZsaZEi";

type ProgramKey = "challenge" | "hackathon" | "program" | "claude";

const PROGRAMS: {
  key: ProgramKey;
  title: string;
  lines: string[];
}[] = [
  {
    key: "challenge",
    title: "60 day coding challenge",
    lines: [
      "Daily tasks across AI, data, and software",
      "Prove the work on GitHub and LinkedIn",
      "Streaks that recruiters can actually see",
    ],
  },
  {
    key: "hackathon",
    title: "Vicodathon 2.0",
    lines: [
      "ViCodathon is an AI-assisted development hackathon where participants build and ship real-world projects using any AI tools.",
    ],
  },
  {
    key: "program",
    title: "31 days ai cohort",
    lines: [
      "Built for professionals ",
      "Daily missions, projects, and an exit interview",
      "Visible to hiring partners ",
    ],
  },
  {
    key: "claude",
    title: "claude challenge",
    lines: [
      "A focused track for Claude AI mastery",
      "Master Prompt Engineering",
      "Build real workflows and share the proof",
    ],
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

const COMMUNITY_BULLETS = [
  "Daily motivation and peer support",
  "Feedback that helps you improve",
  "Opportunities, events and workshops",
  "A network that grows with you",
];

function badgeForProgram(key: ProgramKey) {
  return key === "hackathon" ? "Coming Soon" : "enrolling";
}

export function LandingHub({
  claudeEnabled,
  state,
}: {
  claudeEnabled: boolean;
  state: LandingState;
}) {
  const programs = PROGRAMS.filter(
    (program) => program.key !== "claude" || claudeEnabled,
  ).map((program) => ({
    ...program,
    badge: badgeForProgram(program.key),
  }));

  return (
    <div className="landing-hub">
      <HubNav user={state.user} />

      {/* —— hero + stats (above-fold; scales only under 1080px height) —— */}
      <div className="hub-above-fold">
        <section className="hub-hero-band">
          <div className="hub-shell hub-hero">
            <div className="hub-hero-copy">
              <HeroHeadline>
                <p
                  style={{
                    margin: "28px 0 0",
                    maxWidth: 775,
                    fontSize: 20,
                    lineHeight: 1.6,
                    color: "var(--hub-muted)",
                  }}
                >
                  ABTalks runs hackathons, cohorts and challenges where people
                  build in public. Companies see the work, not a rehearsed answer.
                  We sit in the middle: matching real output to real requirements,
                  and never sharing a profile without the candidate saying yes
                  first.
                </p>
                <div className="hub-hero-ctas">
                  <Link
                    href="/program"
                    className="hub-btn hub-btn-primary hub-btn-hero"
                  >
                    Get Started
                  </Link>
                  <Link
                    href="/talent"
                    className="hub-btn hub-btn-ghost hub-btn-hero"
                  >
                    Post a requirement
                  </Link>
                </div>
              </HeroHeadline>
            </div>
            <div className="hub-hero-spacer" aria-hidden />
          </div>
        </section>

        <HubStatsStrip />
      </div>

      <HubBridgeTiles />

      <HowItWorks />

      {/* —— consent —— */}
      <section
        id="privacy"
        className="hub-shell hub-consent-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
          gap: "clamp(32px, 5vw, 72px)",
          alignItems: "center",
          padding: "48px 0 72px",
        }}
      >
        <div>
          <p className="hub-kicker">Consent first</p>
          <h2
            className="hub-h2"
            style={{ fontSize: "clamp(28px, 3.6vw, 48px)", fontWeight: 500 }}
          >
            We do not share a candidate&apos;s profile{" "}
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 700,
                color: "var(--hub-accent-700)",
              }}
            >
              until they allow
            </em>{" "}
            us to.
          </h2>
        </div>
        <ConsentTiltCard />
      </section>

      {/* —— programs —— */}
      <section id="programs" className="hub-programs-section">
        <div className="hub-shell">
          <p className="hub-kicker">Open right now</p>
          <h2 className="hub-h2">
            Something is always running. Come build in it.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 20,
              marginTop: 40,
            }}
            className="hub-programs-grid"
          >
            {programs.map((program, index) => (
              <HubProgramReveal key={program.key} index={index}>
                <div className="hub-program-card">
                  <div className="hub-program-card-body">
                    <div className="hub-program-card-top">
                      <span className="hub-program-badge">
                        {program.badge}
                      </span>
                      <span className="hub-program-arrow" aria-hidden>
                        ←
                      </span>
                    </div>
                    <p className="hub-program-title">{program.title}</p>
                    <p className="hub-program-lines">
                      {program.lines.map((line, i) => (
                        <span key={line}>
                          {i > 0 ? <br /> : null}
                          {line}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </HubProgramReveal>
            ))}
          </div>
        </div>
      </section>

      {/* —— testimonials —— */}
      <section className="hub-testimonials-section">
        <div className="hub-shell">
          <HubTestimonials />
        </div>
      </section>

      {/* —— FAQ —— */}
      <section id="faq" className="hub-faq-section">
        <div className="hub-shell hub-faq">
          <div className="hub-faq-intro">
            <h2 className="hub-faq-title">
              Frequently asked{" "}
              <span className="hub-faq-title-accent">questions</span>
            </h2>
            <p className="hub-faq-blurb">
              Taking part is free for candidates. Here is what people ask before
              they join a cohort or open their work to companies.
            </p>
          </div>
          <div className="hub-faq-list">
            {FAQS.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <div className="hub-faq-answer">
                  <div>
                    <p>{faq.a}</p>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* —— community —— */}
      <section className="hub-community-clip" style={{ padding: "48px 0 80px" }}>
        <div
          className="hub-shell hub-community-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 0.85fr) minmax(0, 1.15fr)",
            gap: "clamp(28px, 4vw, 56px)",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              className="hub-h2"
              style={{
                fontSize: "clamp(28px, 3vw, 36px)",
                textTransform: "uppercase",
              }}
            >
              Join a Community That Builds
            </h2>
            <ul
              style={{
                listStyle: "none",
                margin: "28px 0 0",
                padding: 0,
                display: "grid",
                gap: 14,
              }}
            >
              {COMMUNITY_BULLETS.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    color: "#a3a3a3",
                    fontSize: 16,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: "var(--hub-accent)",
                      color: "#fff",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      marginTop: 2,
                    }}
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="hub-whatsapp"
              style={{ marginTop: 32 }}
            >
              Join WhatsApp Community →
            </a>
          </div>
          <CommunityCollage />
        </div>
      </section>

      {/* —— poster CTA —— */}
      {/* —— poster CTA (453px) —— */}
      <section className="hub-poster">
        <Image
          src="/landing/poster-field.png"
          alt=""
          width={1024}
          height={719}
          className="hub-poster-art"
          aria-hidden
          priority={false}
        />
        <div className="hub-shell hub-poster-content">
          <div className="hub-poster-copy">
            <p className="hub-poster-headline">
              <span className="hub-poster-light">
                Stop guessing in interviews.
              </span>
              <span className="hub-poster-bold">
                Hire what you have already seen.
              </span>
            </p>
            <div className="hub-poster-actions">
              <Link href="/talent" className="hub-btn hub-btn-outline-light">
                Post a requirement
              </Link>
              <Link href="/program" className="hub-btn hub-btn-solid-light">
                Join the next cohort
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* —— footer —— */}
      <footer
        style={{
          background: "#ffece3",
          padding: "56px 0 28px",
        }}
      >
        <div className="hub-shell">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr repeat(3, 1fr)",
              gap: 32,
            }}
            className="hub-footer-grid"
          >
            <div>
              <Image
                src="/landing/abtalks-logo-mark.png"
                alt="ABTalks"
                width={561}
                height={168}
                className="hub-footer-logo hub-logo-mark"
              />
            </div>
            <FooterCol
              title="Company"
              links={[
                { href: "/mission", label: "About Us" },
                { href: "/talent", label: "Talent" },
                { href: "/jobs", label: "Jobs" },
              ]}
            />
            <FooterCol
              title="Programs"
              links={[
                { href: "/challenges", label: "60-Day Challenge" },
                { href: "/program", label: "AI Cohort" },
                { href: "/hackathon", label: "Hackathon" },
                { href: "/claude-signup", label: "Claude Challenge" },
              ]}
            />
            <FooterCol
              title="Help"
              links={[
                { href: "#faq", label: "FAQs" },
                { href: "/terms", label: "Terms" },
                { href: "/privacy", label: "Privacy" },
                { href: "/cookies", label: "Cookies" },
                { href: "/contact", label: "Contact" },
                { href: "/login", label: "Sign in" },
              ]}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 48,
              paddingTop: 20,
              borderTop: "1px solid color-mix(in srgb, var(--hub-accent) 25%, transparent)",
              fontSize: 13,
              color: "#888",
            }}
          >
            <span>ABTalks © 2026</span>
            <span>Profiles are shared only with candidate consent.</span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 960px) {
          .landing-hub .hub-consent-grid,
          .landing-hub .hub-community-grid {
            grid-template-columns: 1fr !important;
          }
          .landing-hub .hub-programs-grid {
            grid-template-columns: 1fr 1fr !important;
          }
          .landing-hub .hub-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 700px) {
          .landing-hub .hub-programs-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          textTransform: "uppercase",
          color: "#353535",
        }}
      >
        {title}
      </p>
      <ul
        style={{
          listStyle: "none",
          margin: "16px 0 0",
          padding: 0,
          display: "grid",
          gap: 10,
        }}
      >
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              style={{
                color: "#4b4b4b",
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
