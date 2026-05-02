"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Code2, Users, Trophy } from "lucide-react";

interface AboutSlideProps {
  onNext: () => void;
  onPrev: () => void;
}

export function AboutSlide({ onNext, onPrev }: AboutSlideProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="rounded-3xl border bg-card/80 p-8 shadow-lg backdrop-blur-sm md:p-10"
    >
      <h2 className="font-display text-2xl font-bold md:text-3xl">What is ABTalks?</h2>
      <p className="mt-3 text-sm text-muted-foreground md:text-base">
        ABTalks is a 60-day coding challenge built around Anil Bajpai's
        community of recruiters and students. Pick a domain, code daily,
        post your progress, and become discoverable to recruiters.
      </p>

      <div className="mt-6 space-y-3">
        {[
          {
            icon: Code2,
            title: "Daily Challenges",
            desc: "Real coding tasks across AI, Data Science, or Software Engineering",
          },
          {
            icon: Users,
            title: "Public Accountability",
            desc: "Post your work on GitHub & LinkedIn - build your portfolio",
          },
          {
            icon: Trophy,
            title: "Get Discovered",
            desc: "Complete the challenge -> recruiters from our network see your profile",
          },
        ].map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
            className="flex items-start gap-3 rounded-xl border bg-background/50 p-4"
          >
            <div className="rounded-lg bg-primary/10 p-2">
              <item.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onPrev} className="min-h-11">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} className="group min-h-11">
          Continue
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </motion.div>
  );
}
