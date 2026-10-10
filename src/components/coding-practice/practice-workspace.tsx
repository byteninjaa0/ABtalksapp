"use client";

import { useRouter } from "next/navigation";
import { submitPracticeSolutionAction } from "@/app/actions/coding-practice-actions";
import {
  CodeWorkspace,
  type RunOutcome,
  type SubmitOutcome,
  type WorkspaceSubmission,
} from "@/components/code-editor/code-workspace";
import type { CodeLanguageId } from "@/features/code-runner/languages";

type CodeInput = { language: CodeLanguageId; code: string };

type PracticeWorkspaceProps = {
  challenge: string;
  day: number;
  slot: number;
  header: React.ReactNode;
  statement: React.ReactNode;
  languages: { id: CodeLanguageId; label: string }[];
  starterCode: Partial<Record<CodeLanguageId, string>>;
  defaultLanguage: CodeLanguageId;
  solved: boolean;
  initialCode: CodeInput | null;
  submissions: WorkspaceSubmission[];
  /** Raw stdin of the first sample: the format custom input follows. */
  sampleInput: string;
};

/** Binds the practice Run route and Submit action into the reusable workspace. */
export function PracticeWorkspace({
  challenge,
  day,
  slot,
  header,
  statement,
  languages,
  starterCode,
  defaultLanguage,
  solved,
  initialCode,
  submissions,
  sampleInput,
}: PracticeWorkspaceProps) {
  const router = useRouter();

  async function onRun(
    input: CodeInput & { customInput?: string },
  ): Promise<RunOutcome> {
    try {
      const response = await fetch("/api/practice/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, day, slot, ...input }),
      });
      return (await response.json()) as RunOutcome;
    } catch {
      return {
        ok: false,
        message: "Could not reach the server. Check your connection and try again.",
      };
    }
  }

  async function onSubmit(input: CodeInput): Promise<SubmitOutcome> {
    let outcome: Awaited<ReturnType<typeof submitPracticeSolutionAction>>;
    try {
      outcome = await submitPracticeSolutionAction({
        challenge,
        day,
        slot,
        ...input,
      });
    } catch {
      return {
        ok: false,
        message: "Could not reach the server. Check your connection and try again.",
      };
    }
    if (!outcome.ok) return outcome;

    const data = outcome.data;
    if (data.kind === "not_accepted") {
      return {
        ok: true,
        data: {
          result: data.result,
          note: data.alreadySolved
            ? "Not accepted. Your saved solution is unchanged."
            : "Not accepted yet. Nothing was saved.",
          solved: data.alreadySolved,
        },
      };
    }
    // Pull the saved solution and the new solved state from the server.
    router.refresh();
    return {
      ok: true,
      data: {
        result: data.result,
        note: !data.firstSolve
          ? "Accepted. Your saved solution has been replaced with this one."
          : data.dayComplete
            ? `Accepted. Your solution is saved. Day ${day} is complete.`
            : "Accepted. Your solution is saved.",
        solved: true,
      },
    };
  }

  return (
    <CodeWorkspace
      header={header}
      statement={statement}
      languages={languages}
      starterCode={starterCode}
      defaultLanguage={defaultLanguage}
      storageKey={`practice:${challenge}:${day}:${slot}`}
      initialCode={initialCode}
      solved={solved}
      submissions={submissions}
      customInput={{
        example: sampleInput.trimEnd(),
        hint: "One argument per line, written like the example.",
      }}
      onRun={onRun}
      onSubmit={onSubmit}
    />
  );
}
