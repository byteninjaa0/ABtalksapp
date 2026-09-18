/**
 * Plan 151 §9 — quest progress is derived from event counts, so it is
 * replay-safe. No claiming step. Pure.
 *
 * Tasks without a verifiable source row do not exist. Banned patterns
 * (login N days, apply to N jobs, add N skills, profile views) are
 * rejected by the task schema.
 */

import { z } from "zod";

const BANNED_EVENT_TYPES = new Set([
  "user.signed_in",
  "job.applied",
  "recruiter.profile_viewed",
  "recruiter.shortlisted",
  "recruiter.contact_unlocked",
]);

export const questTaskSchema = z
  .object({
    taskKey: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    eventTypes: z.array(z.string().min(1)).min(1).max(10),
    count: z.number().int().min(1).max(100).default(1),
    distinctDays: z.number().int().min(1).max(60).optional(),
    withinDays: z.number().int().min(1).max(90).optional(),
    filter: z
      .record(z.string().max(64), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    afterTaskKey: z.string().min(1).max(64).optional(),
  })
  .superRefine((task, ctx) => {
    for (const t of task.eventTypes) {
      if (BANNED_EVENT_TYPES.has(t)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `banned event type ${t}`,
        });
      }
    }
  });

export const questTasksSchema = z.array(questTaskSchema).min(1).max(8);

export type QuestTask = z.infer<typeof questTaskSchema>;

export type QuestEventFact = {
  type: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export type TaskProgress = {
  taskKey: string;
  label: string;
  current: number;
  required: number;
  done: boolean;
};

function payloadMatches(
  payload: Record<string, unknown>,
  filter: Record<string, string | number | boolean> | undefined,
): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (payload[k] !== v) return false;
  }
  return true;
}

function istDayKey(d: Date): string {
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function deriveTaskProgress(
  task: QuestTask,
  events: QuestEventFact[],
  now: Date,
  startedAt: Date,
): TaskProgress {
  const types = new Set(task.eventTypes);
  let windowStart = startedAt;
  if (task.withinDays) {
    const byWithin = new Date(
      now.getTime() - task.withinDays * 24 * 60 * 60 * 1000,
    );
    if (byWithin > windowStart) windowStart = byWithin;
  }
  const matched = events.filter(
    (e) =>
      types.has(e.type) &&
      e.occurredAt >= windowStart &&
      e.occurredAt <= now &&
      payloadMatches(e.payload, task.filter),
  );

  if (task.distinctDays) {
    const days = new Set(matched.map((e) => istDayKey(e.occurredAt)));
    const current = days.size;
    return {
      taskKey: task.taskKey,
      label: task.label,
      current,
      required: task.distinctDays,
      done: current >= task.distinctDays,
    };
  }

  const current = matched.length;
  return {
    taskKey: task.taskKey,
    label: task.label,
    current,
    required: task.count,
    done: current >= task.count,
  };
}

export function deriveQuestProgress(
  tasks: QuestTask[],
  events: QuestEventFact[],
  now: Date,
  startedAt: Date,
): { tasks: TaskProgress[]; completed: boolean; currentIndex: number } {
  const byKey = new Map(tasks.map((t) => [t.taskKey, t]));
  const progress: TaskProgress[] = [];
  let allDone = true;
  let currentIndex = 0;
  let unlocked = true;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    if (task.afterTaskKey) {
      const prior = progress.find((p) => p.taskKey === task.afterTaskKey);
      unlocked = prior?.done === true;
    } else if (i > 0) {
      unlocked = progress[i - 1]?.done === true;
    }
    const empty: TaskProgress = {
      taskKey: task.taskKey,
      label: task.label,
      current: 0,
      required: task.distinctDays ?? task.count,
      done: false,
    };
    const p = unlocked
      ? deriveTaskProgress(task, events, now, startedAt)
      : empty;
    progress.push(p);
    if (!p.done) {
      allDone = false;
      if (currentIndex === 0 && i === 0) currentIndex = 0;
      else if (progress.slice(0, i).every((x) => x.done)) currentIndex = i;
    }
    void byKey;
  }
  if (allDone) currentIndex = tasks.length;
  return { tasks: progress, completed: allDone, currentIndex };
}

export function parseQuestTasks(
  raw: unknown,
): { ok: true; data: QuestTask[] } | { ok: false; message: string } {
  const parsed = questTasksSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "invalid quest tasks" };
  return { ok: true, data: parsed.data };
}
