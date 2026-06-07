// Client-only consumers. Do NOT import in Server Components, middleware, or auth.config.
export const EASE_SPARK = [0.22, 1, 0.36, 1] as const;
export const EASE_SPARK_SOFT = [0.33, 1, 0.68, 1] as const;
export const EASE_SPARK_OUT = [0.34, 1.4, 0.64, 1] as const; // spark/celebration only
export const DUR = { fast: 0.12, base: 0.2, slow: 0.32, celebrate: 0.48 } as const;

export const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_SPARK } },
};
export const staggerContainer = (stagger = 0.06, delayChildren = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

export const popIn = {
  hidden: { opacity: 0, scale: 0.85 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DUR.celebrate, ease: EASE_SPARK_OUT },
  },
};
