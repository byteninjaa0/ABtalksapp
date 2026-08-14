"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { EASE_SPARK, useSafeReducedMotion } from "@/lib/motion";

/** Visual order 1→3→2→4 maps to card indices 0,2,1,3 */
const STAGGER_BY_INDEX = [0, 0.16, 0.08, 0.24] as const;

type Props = {
  index: number;
  children: ReactNode;
};

export function HubProgramReveal({ index, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, amount: 0.35 });
  const reduce = useSafeReducedMotion();
  const delay = STAGGER_BY_INDEX[index] ?? 0;

  if (reduce) {
    return <div ref={ref}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 48 }}
      animate={
        inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 48 }
      }
      transition={{
        duration: 0.55,
        delay: inView ? delay : 0,
        ease: EASE_SPARK,
      }}
      style={{ height: "100%" }}
    >
      {children}
    </motion.div>
  );
}
