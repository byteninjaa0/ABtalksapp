import type { JobAlertRow, MatchableJob } from "./types";
import type { JobAlertStore, UpsertInput } from "./prisma-store";

/**
 * Max alerts one candidate can have at once. Raise this later — no schema
 * change is needed; the DB already supports many rows per candidate. Set
 * to `Infinity` if you want it truly unbounded.
 */
export const MAX_ALERTS_PER_CANDIDATE = 5;

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      code?: "NOT_FOUND" | "INVALID" | "LIMIT_REACHED";
    };

const OK = <T>(data: T): Result<T> => ({ ok: true, data });

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

export async function listMyAlerts(
  deps: ServiceDeps,
  userId: string,
): Promise<Result<JobAlertRow[]>> {
  const rows = await deps.alerts.listByCandidate(userId);
  return OK(rows);
}

export async function getMyAlertById(
  deps: ServiceDeps,
  userId: string,
  id: string,
): Promise<Result<JobAlertRow>> {
  const row = await deps.alerts.getById(id, userId);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Alert not found." };
  }
  return OK(row);
}

export async function createMyAlert(
  deps: ServiceDeps,
  userId: string,
  input: UpsertInput,
): Promise<Result<JobAlertRow>> {
  const count = await deps.alerts.countByCandidate(userId);
  if (count >= MAX_ALERTS_PER_CANDIDATE) {
    return {
      ok: false,
      code: "LIMIT_REACHED",
      message: `You can have at most ${MAX_ALERTS_PER_CANDIDATE} job alerts. Delete one to add another.`,
    };
  }
  const row = await deps.alerts.create(userId, input);
  return OK(row);
}

export async function updateMyAlert(
  deps: ServiceDeps,
  userId: string,
  id: string,
  input: UpsertInput,
): Promise<Result<JobAlertRow>> {
  const row = await deps.alerts.updateById(id, userId, input);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Alert not found." };
  }
  return OK(row);
}

export async function setMyAlertEnabled(
  deps: ServiceDeps,
  userId: string,
  id: string,
  enabled: boolean,
): Promise<Result<JobAlertRow>> {
  const row = await deps.alerts.setEnabledById(id, userId, enabled);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Alert not found." };
  }
  return OK(row);
}

export async function deleteMyAlert(
  deps: ServiceDeps,
  userId: string,
  id: string,
): Promise<Result<{ deleted: boolean }>> {
  const deleted = await deps.alerts.deleteById(id, userId);
  return OK({ deleted });
}

export type FanoutResult = {
  /** Distinct candidates whose enabled alerts matched. */
  matched: number;
  /** New notifications the dispatcher accepted (one per candidate max). */
  sent: number;
  /** Dispatches the dispatcher swallowed as a dedup no-op. */
  deduplicated: number;
  /** Recipient user ids for which dispatch reported ok:false. */
  failed: string[];
};

/**
 * Fan out `job.alert.match` to every candidate with at least one enabled
 * matching alert. Deduplicated per candidate BEFORE dispatch so a candidate
 * with 3 matching alerts still gets one notification (not three that then
 * dedup at the DB — cleaner logs, one round-trip). The dispatcher's own
 * dedup on `${eventType}:${userId}:${jobId}` remains the ultimate guarantee.
 */
export async function fanoutOnJobPublished(
  deps: FanoutDeps,
  job: MatchableJob,
): Promise<FanoutResult> {
  const matched = await deps.alerts.findEnabledMatching(job);

  // First matching alert per candidate wins — used only to pick an alertId
  // for the metadata; correctness does not depend on which one.
  const byCandidate = new Map<string, JobAlertRow>();
  for (const alert of matched) {
    if (!byCandidate.has(alert.candidateUserId)) {
      byCandidate.set(alert.candidateUserId, alert);
    }
  }

  const result: FanoutResult = {
    matched: byCandidate.size,
    sent: 0,
    deduplicated: 0,
    failed: [],
  };

  const body = buildBody(job);
  const href = `/jobs/${job.id}`;
  const title = "A new job matches your alert";

  for (const [candidateUserId, alert] of byCandidate) {
    try {
      const res = await deps.dispatch({
        eventType: "job.alert.match",
        recipientUserId: candidateUserId,
        primaryEntityId: job.id,
        title,
        body,
        href,
        metadata: { alertId: alert.id, jobId: job.id },
      });
      if (!res.ok) {
        result.failed.push(candidateUserId);
      } else if (res.deduplicated) {
        result.deduplicated += 1;
      } else {
        result.sent += 1;
      }
    } catch {
      result.failed.push(candidateUserId);
    }
  }

  return result;
}

function buildBody(job: MatchableJob): string {
  const where = job.location?.trim() || "location TBD";
  return `${job.title} at ${job.company} — ${where}`;
}
