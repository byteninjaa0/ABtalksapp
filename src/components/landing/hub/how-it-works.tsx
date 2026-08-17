"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSafeReducedMotion } from "@/lib/motion";

const PHONE_MQ = "(max-width: 800px)";

function subscribePhone(onStoreChange: () => void) {
  const mq = window.matchMedia(PHONE_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getPhoneSnapshot() {
  return window.matchMedia(PHONE_MQ).matches;
}

function getPhoneServerSnapshot() {
  return false;
}

function useIsPhone() {
  return useSyncExternalStore(
    subscribePhone,
    getPhoneSnapshot,
    getPhoneServerSnapshot,
  );
}

const SLIDES = [
  {
    number: "01",
    title: "A requirement comes in",
    body: "A company tells us the role, the stack, the level and the timeline. If a matching cohort is already running, we point at it. If not, we design one around the requirement.",
    image: "/landing/step1.jpeg",
  },
  {
    number: "02",
    title: "People build in the open",
    body: "Candidates enter a hackathon, cohort or challenge. Work is submitted, reviewed by mentors and scored against a published rubric, the same rubric for everyone in the room.",
    image: "/landing/step2.jpeg",
  },
  {
    number: "03",
    title: "The candidate releases the profile",
    body: "We show the company the evidence without the identity. When there is genuine interest on both sides, the candidate approves the release and the conversation starts, already past the screening stage.",
    image: "/landing/step3.jpeg",
  },
] as const;

const ROTATIONS = [0, -90, -180] as const;
const LAST_FACE = SLIDES.length - 1;
const WHEEL_THRESHOLD = 12;
const STEP_COOLDOWN_MS = 750;
const LOCK_CLASS = "hub-how-scroll-lock";

function FaceContent({
  slide,
  priority,
}: {
  slide: (typeof SLIDES)[number];
  priority?: boolean;
}) {
  return (
    <>
      <div className="hub-how-face-media">
        <Image
          src={slide.image}
          alt=""
          fill
          sizes="(max-width: 800px) 100vw, 50vw"
          priority={priority}
        />
      </div>
      <div className="hub-how-face-copy">
        <p className="hub-how-face-num">{slide.number}</p>
        <h3 className="hub-how-face-title">{slide.title}</h3>
        <p className="hub-how-face-body">{slide.body}</p>
      </div>
    </>
  );
}

function setScrollLock(on: boolean) {
  document.documentElement.classList.toggle(LOCK_CLASS, on);
}

export function HowItWorks() {
  const reduce = useSafeReducedMotion();
  const isPhone = useIsPhone();
  const stageRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const lockedRef = useRef(false);
  const coolingRef = useRef(false);
  const releasedRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const scrollDirRef = useRef<"up" | "down">("down");
  const touchYRef = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const applyRotation = useCallback(
    (i: number) => {
      if (isPhone) {
        cubeRef.current?.style.removeProperty("--hub-how-rotate");
        return;
      }
      const deg = ROTATIONS[i] ?? 0;
      cubeRef.current?.style.setProperty("--hub-how-rotate", `${deg}deg`);
    },
    [isPhone],
  );

  const goToFace = useCallback(
    (i: number) => {
      const next = Math.min(LAST_FACE, Math.max(0, i));
      indexRef.current = next;
      setIndex(next);
      if (!reduce) applyRotation(next);
    },
    [applyRotation, reduce],
  );

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (reduce) return;
    applyRotation(indexRef.current);
  }, [applyRotation, reduce, isPhone]);

  /* Engage when the cube stage is near vertical center (wider band + wheel catch) */
  useEffect(() => {
    if (reduce) return;
    const stage = stageRef.current;
    if (!stage) return;

    lastScrollYRef.current = window.scrollY;

    const evaluate = () => {
      const y = window.scrollY;
      if (y < lastScrollYRef.current) scrollDirRef.current = "up";
      else if (y > lastScrollYRef.current) scrollDirRef.current = "down";
      lastScrollYRef.current = y;

      const rect = stage.getBoundingClientRect();
      const stageMid = (rect.top + rect.bottom) / 2;
      const viewMid = window.innerHeight / 2;
      // ~20% of viewport — wider than 12% so fast trackpad flicks still catch
      const inBand =
        Math.abs(stageMid - viewMid) <= window.innerHeight * 0.2;

      if (!inBand) {
        releasedRef.current = false;
        setEngaged(false);
        return;
      }

      if (releasedRef.current) return;
      // Entering from below: start on face 03 so wheel-up steps back through faces
      if (scrollDirRef.current === "up" && !lockedRef.current) {
        goToFace(LAST_FACE);
      }
      setEngaged(true);
    };

    // Catch the band between scroll events (momentum / large wheel deltas)
    const onWheelPreLock = () => {
      if (lockedRef.current || releasedRef.current) return;
      evaluate();
    };

    window.addEventListener("scroll", evaluate, { passive: true });
    window.addEventListener("resize", evaluate);
    window.addEventListener("wheel", onWheelPreLock, { passive: true });
    evaluate();

    return () => {
      window.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("wheel", onWheelPreLock);
    };
  }, [goToFace, reduce]);

  /* Lock html overflow while engaged */
  useEffect(() => {
    if (reduce) {
      setScrollLock(false);
      lockedRef.current = false;
      return;
    }
    lockedRef.current = engaged;
    setScrollLock(engaged);
    return () => {
      setScrollLock(false);
      lockedRef.current = false;
    };
  }, [engaged, reduce]);

  /* Discrete wheel / touch steps while locked */
  useEffect(() => {
    if (reduce) return;

    const releaseAndScroll = (direction: 1 | -1) => {
      releasedRef.current = true;
      setEngaged(false);
      lockedRef.current = false;
      setScrollLock(false);
      window.scrollBy({
        top: direction * Math.min(120, window.innerHeight * 0.2),
      });
    };

    const step = (direction: 1 | -1) => {
      if (!lockedRef.current || coolingRef.current) return;
      const current = indexRef.current;
      const next = current + direction;

      if (next > LAST_FACE) {
        releaseAndScroll(1);
        return;
      }
      if (next < 0) {
        releaseAndScroll(-1);
        return;
      }

      coolingRef.current = true;
      goToFace(next);
      window.setTimeout(() => {
        coolingRef.current = false;
      }, STEP_COOLDOWN_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (!lockedRef.current) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
      step(e.deltaY > 0 ? 1 : -1);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!lockedRef.current) return;
      touchYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!lockedRef.current) return;
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!lockedRef.current || touchYRef.current == null) return;
      const endY = e.changedTouches[0]?.clientY;
      if (endY == null) return;
      const dy = touchYRef.current - endY;
      touchYRef.current = null;
      if (Math.abs(dy) < 40) return;
      step(dy > 0 ? 1 : -1);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      setScrollLock(false);
      lockedRef.current = false;
    };
  }, [goToFace, reduce]);

  const slide = SLIDES[index] ?? SLIDES[0];

  return (
    <section
      id="how"
      className={
        reduce ? "hub-how hub-how--reduce hub-shell" : "hub-how hub-shell"
      }
    >
      <div className="hub-how-sticky">
        <p className="hub-kicker">How it works</p>

        <div
          className="hub-how-dots"
          role="tablist"
          aria-label="How it works steps"
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.number}
              type="button"
              className="hub-how-dot"
              role="tab"
              aria-label={`Show step ${s.number}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goToFace(i)}
            />
          ))}
        </div>

        {reduce ? (
          <div className="hub-how-flat">
            <div className="hub-how-flat-media">
              {SLIDES.map((s, i) => (
                <Image
                  key={s.image}
                  src={s.image}
                  alt=""
                  fill
                  sizes="(max-width: 800px) 100vw, 50vw"
                  style={{
                    objectFit: "cover",
                    opacity: i === index ? 1 : 0,
                    transition: "none",
                  }}
                  priority={i === 0}
                />
              ))}
            </div>
            <div>
              <p className="hub-how-face-num">{slide.number}</p>
              <h3 className="hub-how-face-title">{slide.title}</h3>
              <p className="hub-how-face-body">{slide.body}</p>
            </div>
          </div>
        ) : (
          <div ref={stageRef} className="hub-how-stage">
            <div className="hub-how-perspective">
              <div ref={cubeRef} className="hub-how-cube">
                {SLIDES.map((s, i) => (
                  <div
                    key={s.number}
                    className="hub-how-face"
                    data-face={i}
                    aria-hidden={i !== index}
                  >
                    <FaceContent slide={s} priority={i === 0} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
