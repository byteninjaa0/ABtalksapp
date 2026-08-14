"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LandingUser } from "@/features/landing/get-landing-state";
import { LandingUserMenu } from "../landing-user-menu";
import { SignInMenu } from "../sign-in-menu";

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#how", label: "How it works" },
  { href: "#programs", label: "Programs" },
  { href: "#faq", label: "FAQ" },
] as const;

type Props = {
  user: LandingUser | null;
};

export function HubNav({ user }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState<string>(NAV_LINKS[0].href);
  const activeHrefRef = useRef(activeHref);
  const linksRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });
  const close = () => setMenuOpen(false);

  const updateIndicator = useCallback((href?: string) => {
    const target = href ?? activeHrefRef.current;
    const root = linksRef.current;
    const link = linkRefs.current.get(target);
    if (!root || !link) {
      setIndicator((s) => ({ ...s, ready: false }));
      return;
    }
    // offset* is relative to the positioned links row — stable after reflow
    setIndicator({
      left: link.offsetLeft,
      width: link.offsetWidth,
      ready: true,
    });
  }, []);

  const scheduleIndicator = useCallback(
    (href?: string) => {
      updateIndicator(href);
      requestAnimationFrame(() => {
        updateIndicator(href);
        requestAnimationFrame(() => updateIndicator(href));
      });
    },
    [updateIndicator],
  );

  useEffect(() => {
    activeHrefRef.current = activeHref;
  }, [activeHref]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Scroll-spy: highlight the section nearest the upper third of the viewport */
  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.href.slice(1));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        const top = visible[0];
        if (!top?.target.id) return;
        const next = `#${top.target.id}`;
        setActiveHref((prev) => (prev === next ? prev : next));
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    scheduleIndicator(activeHref);
  }, [activeHref, scheduleIndicator]);

  useEffect(() => {
    const root = linksRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleIndicator());
    ro.observe(root);
    for (const link of linkRefs.current.values()) ro.observe(link);
    return () => ro.disconnect();
  }, [scheduleIndicator]);

  useEffect(() => {
    const onResize = () => scheduleIndicator();
    window.addEventListener("resize", onResize);
    void document.fonts?.ready.then(() => scheduleIndicator());
    return () => window.removeEventListener("resize", onResize);
  }, [scheduleIndicator]);

  return (
    <>
      <div className="hub-nav-spacer" aria-hidden />
      <div className={scrolled ? "hub-navwrap scrolled" : "hub-navwrap"}>
        <nav className="hub-nav-pill" aria-label="Primary">
          <button
            type="button"
            className={menuOpen ? "hub-navtoggle open" : "hub-navtoggle"}
            aria-expanded={menuOpen}
            aria-controls="hub-mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="hub-navtoggle-bars" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>

          <Link href="/" className="hub-nav-logo" aria-label="ABTalks home">
            <Image
              src="/landing/abtalks-logo-mark.png"
              alt="ABTalks"
              width={561}
              height={168}
              priority
              className="hub-nav-logo-img hub-logo-mark"
              onLoadingComplete={() => scheduleIndicator()}
            />
          </Link>

          <div ref={linksRef} className="hub-nav-links">
            <span
              className={
                indicator.ready ? "hub-nav-indicator on" : "hub-nav-indicator"
              }
              aria-hidden
              style={{
                transform: `translateX(${indicator.left}px)`,
                width: indicator.width,
              }}
            />
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={
                  activeHref === link.href
                    ? "hub-nav-link active"
                    : "hub-nav-link"
                }
                ref={(node) => {
                  if (node) linkRefs.current.set(link.href, node);
                  else linkRefs.current.delete(link.href);
                }}
                onClick={() => {
                  setActiveHref(link.href);
                  scheduleIndicator(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {user ? (
            <div className="hub-nav-profile">
              <LandingUserMenu user={user} />
            </div>
          ) : (
            <div className="hub-nav-actions">
              {/* Two doors, not one. "Get Started" leads candidates into the
                  program; a recruiter arriving at the landing page had no way
                  in at all without this. */}
              <SignInMenu />
              <Link href="/program" className="hub-nav-cta">
                Get Started
              </Link>
            </div>
          )}
        </nav>
      </div>

      <div
        id="hub-mobile-nav"
        className={menuOpen ? "hub-navpanel open" : "hub-navpanel"}
      >
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={() => {
              close();
              setActiveHref(link.href);
              scheduleIndicator(link.href);
            }}
          >
            {link.label}
          </a>
        ))}
        {!user ? (
          <>
            <Link
              href="/login"
              className="hub-btn hub-btn-ghost"
              onClick={close}
            >
              Sign in
            </Link>
            {/* The dropdown does not belong in a slide-down panel, so the
                recruiter door is its own row here rather than a menu. */}
            <Link
              href="/hire"
              className="hub-btn hub-btn-ghost"
              onClick={close}
            >
              For recruiters
            </Link>
          </>
        ) : null}
      </div>
    </>
  );
}
