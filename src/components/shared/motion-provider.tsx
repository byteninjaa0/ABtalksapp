"use client";

import { MotionConfig } from "framer-motion";
import { EASE_SPARK, DUR } from "@/lib/motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: EASE_SPARK, duration: DUR.base }}>
      {children}
    </MotionConfig>
  );
}
