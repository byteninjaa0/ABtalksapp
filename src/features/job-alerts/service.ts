import type { JobAlertRow, MatchableJob } from "./types";
import type { JobAlertStore, UpsertInput } from "./prisma-store";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: "NOT_FOUND" | "INVALID" };

const OK = <T>(data: T): Result<T> => ({ ok: true, data });

/**
 * Dispatch shape mirrors {@link import("@/features/notification/notification-service").dispatch}
 * without importing it at module scope: tests inject a fake and the action
 * layer wires the real one.
 */
export type DispatchFn = (event: {
  eventType: string;
  recipientUserId: string;
  primaryEntityId: string;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
}) => Promise<{ ok: true; deduplicated: boolean } | { ok: false; message: string }>;

export type FanoutDeps = {
  alerts: JobAlertStore;
  dispatch: DispatchFn;
};

export type ServiceDeps = {
  alerts: JobAlertStore;
};

export async function getMyAlert(
  deps: ServiceDeps,
  userId: string,
): Promise<Result<JobAlertRow | null>> {
  const row = await deps.alerts.getByCandidate(userId);
  return OK(row);
}

export async function upsertMyAlert(
  deps: ServiceDeps,
  userId: string,
  input: UpsertInput,
): Promise<Result<JobAlertRow>> {
  const row = await deps.alerts.upsert(userId, input);
  return OK(row);
}

export async function setMyAlertEnabled(
  deps: ServiceDeps,
  userId: string,
  enabled: boolean,
): Promise<Result<JobAlertRow>> {
  const row = await deps.alerts.setEnabled(userId, enabled);
  if (!row) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "No job alert exists to toggle.",
    };
  }
  return OK(row);
}

/**
 * Result of a single fanout run, useful to logs and tests.
 */
export type FanoutResult = {
  /** Alerts that matched the job (pre-dispatch count). */
  matched: number;
  /** New notifications the dispatcher accepted. */
  sent: number;
  /** Alerts whose dispatch was a dedup no-op. */
  deduplicated: number;
  /** Recipient user ids for which dispatch reported ok:false. */
  failed: string[];
};

/**
 * Fan out `job.alert.match` notifications to every candidate whose enabled
 * alert matches this job. Idempotent: the notification service's dedupeKey
 * (`job.alert.match:{userId}:{jobId}`) makes a second call for the same job
 * a no-op, so accidental re-runs are safe.
 *
 * A single dispatch failure does not stop the loop — the row is preserved
 * so a retry / next publish can complete it. The caller logs the summary.
 */
export async function fanoutOnJobPublished(
  deps: FanoutDeps,
  job: MatchableJob,
): Promise<FanoutResult> {
  const matched = await deps.alerts.findEnabledMatching(job);
  const result: FanoutResult = {
    matched: matched.length,
    sent: 0,
    deduplicated: 0,
    failed: [],
  };

  const body = buildBody(job);
  const href = `/jobs/${job.id}`;
  const title = "A new job matches your alert";

  for (const alert of matched) {
    try {
      const res = await deps.dispatch({
        eventType: "job.alert.match",
        recipientUserId: alert.candidateUserId,
        primaryEntityId: job.id,
        title,
        body,
        href,
        metadata: { alertId: alert.id, jobId: job.id },
      });
      if (!res.ok) {
        result.failed.push(alert.candidateUserId);
      } else if (res.deduplicated) {
        result.deduplicated += 1;
      } else {
        result.sent += 1;
      }
    } catch {
      // The notification service already logs; the fanout only records
      // that this recipient did not receive.
      result.failed.push(alert.candidateUserId);
    }
  }

  return result;
}

function buildBody(job: MatchableJob): string {
  const where = job.location?.trim() || "location TBD";
  return `${job.title} at ${job.company} — ${where}`;
}
