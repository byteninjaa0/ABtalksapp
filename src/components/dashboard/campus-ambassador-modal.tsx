"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Network, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  applyCampusAmbassador,
  dismissCampusAmbassador,
} from "@/app/actions/campus-ambassador-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const BENEFITS = [
  {
    icon: Network,
    title: "Build your network",
    description:
      "Connect directly with ABTalks team and community. Open doors that wouldn't open otherwise.",
    color: "amber",
  },
  {
    icon: Users,
    title: "Lead your campus AI community",
    description:
      "Be the go-to person for AI learning at your college. Build your reputation as the AI leader on campus.",
    color: "violet",
  },
  {
    icon: Trophy,
    title: "Exclusive opportunities",
    description:
      "Early access to events, internships, partnerships, and recruiter visibility. Get noticed first.",
    color: "emerald",
  },
];

const COLOR_MAP: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-500",
  violet: "bg-violet-500/10 text-violet-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
};

export function CampusAmbassadorModal({ isOpen, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleApply = async () => {
    setSubmitting(true);
    const result = await applyCampusAmbassador();
    if (result.ok) {
      toast.success("Application submitted! We'll be in touch.");
      onClose();
    } else {
      toast.error(result.message ?? "Something went wrong");
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setSubmitting(true);
    const result = await dismissCampusAmbassador();
    if (result.ok) {
      onClose();
    } else {
      toast.error(result.message ?? "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl my-4 md:my-8 rounded-2xl border bg-card p-5 md:p-6 shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-md p-1 hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1">
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                Campus Ambassador Program
              </span>
            </div>

            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
              Become your campus ambassador
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Represent your college in the ABTalks community. Help bring AI
              learning to your peers.
            </p>

            <div className="mt-5 space-y-3">
              {BENEFITS.map((benefit, i) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className="flex items-start gap-3 rounded-xl border bg-background/50 p-3"
                >
                  <div className={`rounded-lg p-2 ${COLOR_MAP[benefit.color]}`}>
                    <benefit.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm">
                      {benefit.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleDismiss}
                disabled={submitting}
                className="flex-1"
              >
                Not interested
              </Button>
              <Button
                onClick={handleApply}
                disabled={submitting}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
              >
                {submitting ? "Applying..." : "Yes, I'm interested"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
