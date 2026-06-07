"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  /** Pulse when this value increases. */
  trigger: number;
  className?: string;
  /** Pulse once on mount when trigger > 0. */
  pulseOnMount?: boolean;
};

export function Spark({ children, trigger, className, pulseOnMount = false }: Props) {
  const reducedMotion = useReducedMotion();
  const prevRef = useRef(trigger);
  const mountedRef = useRef(false);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;

    const id = requestAnimationFrame(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        if (pulseOnMount && trigger > 0) {
          setPulsing(true);
        }
        prevRef.current = trigger;
        return;
      }

      if (trigger > prevRef.current) {
        setPulsing(true);
      }
      prevRef.current = trigger;
    });

    return () => cancelAnimationFrame(id);
  }, [trigger, pulseOnMount, reducedMotion]);

  useEffect(() => {
    if (!pulsing) return;
    const t = window.setTimeout(() => setPulsing(false), 320);
    return () => window.clearTimeout(t);
  }, [pulsing]);

  return (
    <span className={cn(className, pulsing && "spark-pulse inline-flex")}>{children}</span>
  );
}
