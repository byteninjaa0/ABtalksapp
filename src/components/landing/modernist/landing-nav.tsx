"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#hackathons", label: "Hackathons" },
  { href: "#evidence", label: "Evidence" },
  { href: "#privacy", label: "Privacy" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={scrolled ? "navwrap scrolled" : "navwrap"}>
      <nav className="nav">
        <span className="nav-brand">ABTalks</span>
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
        <Link className="btn btn-ghost" href="/login">
          Sign in
        </Link>
        <Link className="btn btn-primary" href="/talent">
          Hire from a cohort
        </Link>
        <button
          type="button"
          className="btn btn-ghost navtoggle"
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </nav>

      <div
        id="landing-mobile-nav"
        className={menuOpen ? "navpanel open" : "navpanel"}
      >
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={closeMenu}>
            {link.label}
          </a>
        ))}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            padding: "16px 20px",
          }}
        >
          <Link className="btn btn-primary" href="/talent" onClick={closeMenu}>
            Hire from a cohort
          </Link>
          <Link className="btn btn-ghost" href="/program" onClick={closeMenu}>
            Join the next cohort
          </Link>
          <Link className="btn btn-ghost" href="/login" onClick={closeMenu}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
