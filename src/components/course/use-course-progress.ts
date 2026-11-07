"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-viewer course progress in localStorage. Deliberately not in the DB: the
 * course is free and open, and losing progress on another device is harmless.
 */
type Progress = { done: string[]; quiz: Record<string, { score: number; total: number }> };

const EMPTY: Progress = { done: [], quiz: {} };
const EVENT = "klymb-course-progress";

function key(course: string) {
  return `klymb.course.${course}.v1`;
}

function read(course: string): Progress {
  try {
    const raw = window.localStorage.getItem(key(course));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { done: Array.isArray(parsed.done) ? parsed.done : [], quiz: parsed.quiz ?? {} };
  } catch {
    return EMPTY;
  }
}

function write(course: string, p: Progress) {
  try {
    window.localStorage.setItem(key(course), JSON.stringify(p));
  } catch {
    // storage blocked, progress simply won't persist
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useCourseProgress(course: string) {
  const [progress, setProgress] = useState<Progress>(EMPTY);

  useEffect(() => {
    const sync = () => setProgress(read(course));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [course]);

  const setDone = useCallback(
    (module: string, done: boolean) => {
      const cur = read(course);
      const set = new Set(cur.done);
      if (done) set.add(module);
      else set.delete(module);
      write(course, { ...cur, done: [...set] });
    },
    [course],
  );

  const recordQuiz = useCallback(
    (module: string, score: number, total: number) => {
      const cur = read(course);
      write(course, { ...cur, quiz: { ...cur.quiz, [module]: { score, total } } });
    },
    [course],
  );

  return { progress, setDone, recordQuiz };
}
