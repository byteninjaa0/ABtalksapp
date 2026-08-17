"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TESTIMONIALS,
  type Testimonial,
} from "@/components/landing/testimonials-data";

const AUTOPLAY_MS = 3500;
const RESUME_AFTER_INPUT_MS = 8000;
const CARD_GAP = 28;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function HubTestimonialCard({ name, org, photo, quote }: Testimonial) {
  return (
    <figure className="hub-t-card">
      <blockquote className="hub-t-body">{quote}</blockquote>
      <figcaption className="hub-t-footer">
        {photo ? (
          <Image
            src={photo}
            alt=""
            width={55}
            height={55}
            loading="lazy"
            className="hub-t-avatar"
          />
        ) : (
          <span aria-hidden className="hub-t-avatar-fallback">
            {initials(name)}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="hub-t-name">{name}</p>
          {org ? <p className="hub-t-org">{org}</p> : null}
        </div>
      </figcaption>
    </figure>
  );
}

export function HubTestimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<number | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  const step = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("figure");
    const distance = card
      ? card.clientWidth + CARD_GAP
      : el.clientWidth * 0.8;
    const finished = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    if (finished) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      el.scrollBy({ left: distance, behavior: "smooth" });
    }
  }, []);

  const holdAutoplay = useCallback(() => {
    setCooling(true);
    if (cooldownRef.current) window.clearTimeout(cooldownRef.current);
    cooldownRef.current = window.setTimeout(
      () => setCooling(false),
      RESUME_AFTER_INPUT_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) window.clearTimeout(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const apply = () => setHidden(document.hidden);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  const autoplaying = !reducedMotion && !engaged && !cooling && !hidden;

  useEffect(() => {
    if (!autoplaying) return;
    const timer = window.setInterval(step, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [autoplaying, step]);

  return (
    <div
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
    >
      <header className="hub-t-heading">
        <h2 className="hub-t-heading-title">What people are saying?</h2>
        <p className="hub-t-heading-sub">
          Dont just take our word for it. See what our customers have to say about their experience!
        </p>
      </header>

      <div
        ref={trackRef}
        onPointerDown={holdAutoplay}
        onTouchStart={holdAutoplay}
        tabIndex={0}
        role="region"
        aria-label="Testimonials, scrolling automatically"
        className="hub-t-track no-scrollbar"
      >
        <div className="hub-t-track-inner">
          {TESTIMONIALS.map((testimonial) => (
            <HubTestimonialCard key={testimonial.name} {...testimonial} />
          ))}
        </div>
      </div>
    </div>
  );
}
