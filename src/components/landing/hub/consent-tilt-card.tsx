"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { EASE_SPARK, useSafeReducedMotion } from "@/lib/motion";

const ROWS = [
  { label: "Submitted work — 3 projects", status: "visible" },
  { label: "Rubric score — cohort 14", status: "visible" },
  { label: "Mentor review notes", status: "visible" },
  {
    label: "Name, contact, employer",
    status: "hidden until approved",
    accent: true,
  },
];

const HINGE_DEG = -20;

export function ConsentTiltCard() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useSafeReducedMotion();
  /* Enter section → tilt & hold; leave → flatten; re-enter → tilt again */
  const inView = useInView(stageRef, { once: false, amount: 0.4 });

  const hinged = reduce || inView;

  return (
    <div ref={stageRef} className="hub-consent-stage">
      <motion.div
        className="hub-consent-card"
        initial={false}
        animate={{
          rotateY: hinged ? HINGE_DEG : 0,
        }}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.85, ease: EASE_SPARK }
        }
        style={{ transformStyle: "preserve-3d" }}
      >
        <motion.div
          className="hub-consent-glare"
          aria-hidden
          initial={false}
          animate={{ opacity: hinged ? 0.28 : 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.85, ease: EASE_SPARK }
          }
          style={{
            background:
              "linear-gradient(105deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 42%, transparent 70%)",
          }}
        />

        <div className="hub-consent-parallax">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: "#888" }}>What a company sees</span>
            <span style={{ color: "var(--hub-accent)" }}>Awaiting consent</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--hub-lavender)",
              borderRadius: 4,
              padding: "12px",
              marginBottom: 20,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                background: "var(--hub-border)",
                flex: "none",
              }}
            />
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--hub-text)",
                }}
              >
                Candidate #4128
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>
                Frontend & product · cohort 14
              </p>
            </div>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ROWS.map((row) => (
              <li
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 13,
                  fontWeight: row.accent ? 600 : 400,
                }}
              >
                <span
                  style={{ color: row.accent ? "var(--hub-text)" : "#555" }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    color: row.accent ? "var(--hub-accent)" : "#888",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.status}
                </span>
              </li>
            ))}
          </ul>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              marginTop: 22,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 35,
                padding: "0 16px",
                borderRadius: 4,
                background: "var(--hub-accent)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Request access
            </span>
            <span style={{ fontSize: 12, color: "#555" }}>
              The request goes to the candidate, not to us.
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
