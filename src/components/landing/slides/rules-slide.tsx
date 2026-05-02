"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, AlertTriangle, ShieldX } from "lucide-react";

interface RulesSlideProps {
  onNext: () => void;
  onPrev: () => void;
}

export function RulesSlide({ onNext, onPrev }: RulesSlideProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="rounded-3xl border bg-card/80 p-8 shadow-lg backdrop-blur-sm md:p-10"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <h2 className="font-display text-2xl font-bold md:text-3xl">Community Rules</h2>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        ABTalks is a place to grow with serious learners. Read these carefully.
      </p>

      <div className="mt-6 space-y-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <h3 className="font-semibold">Foul Language or Harassment</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Any abusive language, harassment, or harmful messaging will lead
                to <strong className="text-foreground">permanent ban</strong> from
                ABTalks.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h3 className="font-semibold">Cheating or Platform Misuse</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Submitting plagiarized work or misusing the platform will result
                in a <strong className="text-foreground">60-day challenge ban</strong>.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="text-sm text-muted-foreground"
        >
          By continuing, you agree to follow these rules. Be real, be respectful,
          and ship real work.
        </motion.p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onPrev} className="min-h-11">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} className="group min-h-11">
          I Agree
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  );
}
