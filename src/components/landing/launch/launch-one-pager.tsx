import Link from "next/link";
import type { LandingUser } from "@/features/landing/get-landing-state";
import { LandingUserMenu } from "@/components/landing/landing-user-menu";
import { Wordmark } from "@/components/shared/wordmark";
import { WHATSAPP_INVITE } from "@/components/landing/site/landing-content";
import { LaunchCountdown } from "./launch-countdown";
import {
  CLAUDE_LAUNCH_AT,
  CLAUDE_LAUNCH_LABEL,
  LAUNCH_FOOTER_LINKS,
  LAUNCH_HERO,
  LAUNCH_POINTS,
} from "./launch-content";
import "@/components/landing/site/landing.css";
import "./launch.css";

/**
 * Plan 191, TEMPORARY — the launch one-pager that stands in for the full
 * marketing landing while `LANDING_ONE_PAGER` is on.
 *
 * Server Component. It reuses `landing.css` for the brand tokens and button
 * classes (hence the `.klymb-landing` wrapper, still the shared landing
 * wrapper's class name after the Klymb AI rename) and adds only its own layout
 * on top, so nothing in `components/landing/site/**` had to change to put this
 * page up — flip the flag off and that landing is back, untouched.
 *
 * Plan 192 closed the candidate side too, so this page offers nothing to join
 * — registration is shut until kickoff and every track route redirects back
 * here. What is left is the announcement, one "Sign in" for people who already
 * have an account, and the community invite, which is the only way an
 * interested visitor can stay in touch meanwhile.
 */
export function LaunchOnePager({
  user,
  signInHref,
}: {
  user: LandingUser | null;
  /**
   * The sign-in door this visitor can actually open, or null for none.
   * Normally /login — the candidate door is open so returning candidates can
   * sign in — except for a browser holding only the recruiter preview link,
   * which is sent to /talent/login. Null still hides the button, for whenever
   * the door closes again.
   */
  signInHref: string | null;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="klymb-landing launch">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="launch__nav">
        <div className="container launch__nav-inner">
          <Link href="/" className="launch__logo" aria-label="Klymb AI home">
            <Wordmark size="lg" />
          </Link>

          {user ? (
            <LandingUserMenu user={user} />
          ) : signInHref ? (
            <Link href={signInHref} className="btn btn--ghost btn--sm">
              Sign in
            </Link>
          ) : null}
        </div>
      </header>

      <main id="main">
        <section className="launch__hero">
          <div className="container launch__hero-inner">
            <p className="launch__eyebrow">
              <span className="launch__dot" aria-hidden="true" />
              {LAUNCH_HERO.eyebrow}
            </p>

            <h1 className="launch__headline">{LAUNCH_HERO.headline}</h1>

            <p className="launch__date-prefix">{LAUNCH_HERO.datePrefix}</p>
            <LaunchCountdown
              targetIso={CLAUDE_LAUNCH_AT}
              label={CLAUDE_LAUNCH_LABEL}
            />

            <p className="launch__body">{LAUNCH_HERO.body}</p>

            {/* Sign-in lives in the nav only. A second button under the
                countdown would read as a way INTO the new challenge, which it
                is not — it is the door back in for people who already have an
                account. */}
          </div>
        </section>

        <section className="launch__points" aria-label="What the challenge is">
          <div className="container launch__grid">
            {LAUNCH_POINTS.map((point) => (
              <article className="launch__card" key={point.title}>
                <h2 className="launch__card-title">{point.title}</h2>
                <p className="launch__card-body">{point.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="launch__community" aria-label="Community">
          <div className="container">
            <a
              href={WHATSAPP_INVITE}
              className="btn btn--whatsapp btn--lg launch__whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join the community on WhatsApp
            </a>
          </div>
        </section>
      </main>

      <footer className="launch__footer">
        <div className="container launch__footer-inner">
          <span className="launch__copy">
            © Klymb AI {year} All rights reserved.
          </span>
          <ul className="launch__footer-links">
            {LAUNCH_FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
