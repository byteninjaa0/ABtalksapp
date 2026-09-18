import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { QuestView } from "@/features/gamification/loaders";
import { cn } from "@/lib/utils";

/**
 * Plan 151 §9 — the quest as a step list, not a slogan. Every step maps to a
 * verifiable event, so the candidate can see exactly what counts.
 */
export function QuestCard({ quest }: { quest: QuestView }) {
  const done = quest.tasks.filter((t) => t.done).length;
  const current = quest.tasks[quest.currentIndex];

  return (
    <section
      aria-label={`Quest: ${quest.name}`}
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
          Quest · {quest.name}
        </p>
        <span className="shrink-0 rounded-full border border-[#E0E0E0] bg-[#F4F4F4] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#353535]">
          {done} of {quest.tasks.length}
        </span>
      </div>

      <ul className="mt-3 space-y-0.5">
        {quest.tasks.map((task, i) => {
          const isCurrent = !task.done && i === quest.currentIndex;
          return (
            <li
              key={task.taskKey}
              className={cn(
                "flex items-center gap-2.5 py-1.5 text-sm",
                task.done ? "text-[#111111]" : isCurrent ? "font-semibold text-[#111111]" : "text-[#626262]",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border-2",
                  task.done
                    ? "border-[#03535F] bg-[#03535F] text-white"
                    : isCurrent
                      ? "border-[#03535F] bg-white text-transparent"
                      : "border-[#CDD3D3] bg-white text-transparent",
                )}
                aria-hidden
              >
                <Check className="size-3" strokeWidth={4} />
              </span>
              <span className="min-w-0 flex-1">{task.label}</span>
              {task.required > 1 ? (
                <span className="shrink-0 text-xs tabular-nums text-[#8F8F8F]">
                  {Math.min(task.current, task.required)}/{task.required}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {quest.completed ? (
        <p className="mt-3 rounded-xl bg-[#E4F2E5] px-3 py-2 text-sm font-semibold text-[#155F1B]">
          Quest complete
        </p>
      ) : quest.href ? (
        <Link
          href={quest.href}
          className="group mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#03535F] px-4 text-sm font-semibold text-white shadow-[inset_0_-5px_14px_rgba(0,0,0,0.34)] transition-colors hover:bg-[#076573]"
        >
          {current ? current.label : "Continue"}
          <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
