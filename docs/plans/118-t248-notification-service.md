# 118 — T-248: Notification service (in-app + selective email)

**Workstream:** P2 Notifications & Email
**Persona:** All
**Owner:** Manuvrtti
**Demo:** Demo 1
**Implementation date:** 2026-09-10
**Internal test date:** 2026-09-11
**Depends on:** T-036 (notification foundation), T-205 (design — out of scope)
**Blocks:** T-245, T-246 (event instrumentation — hooks listed, not wired)

**Format note:** `docs/plans/117-t253-event-instrumentation.md` was specified as
the format reference but does not exist in the repo. This plan matches the
structure, prose style and decision-record convention of plans 114, 115, 116 and
113 — the four most recent plan docs on `master`.

---

## 1. Outcome (verbatim, from task row)

> As ABTalks, notifications reach people once, reliably, and we know what happened
> to each one.

## 2. What must be true

1. **Dedupe.** Dispatching the same event for the same recipient twice produces
   exactly one `UserNotification` row and one in-app delivery row. The second call
   is a no-op.
2. **Per-channel delivery state.** Every delivery attempt is tracked with state
   `created → sending → sent | failed`, with `failure_reason` preserving the
   provider error verbatim (truncated at 1000 chars).
3. **Preferences per user × event_type × channel.** A user can disable email for
   any non-exempt event type. Suppression-exempt event types cannot have their
   in-app channel disabled.
4. **Idempotent under retry.** Calling the email delivery function twice on the
   same delivery row results in exactly one provider call.
5. **In-app always.** Every dispatched notification creates an in-app delivery.
6. **Email selectively.** Email delivery is created only when the event priority is
   `important` AND the user's preferences allow it.
7. **Low-priority may be digested.** Low-priority events are in-app only. Digest
   batching is a follow-up (not built in this PR).
8. **No WhatsApp. No SMS.**

## 3. Non-goals

- WhatsApp or SMS channels.
- Suppression of auth, assessment, outreach-reply or application notifications.
- T-205 UI polish — the preferences page is a functional placeholder.
- Digest batching — low-priority events are simply in-app only for now.
- Wiring T-245 / T-246 call sites into the dispatcher (hooks are listed in §16,
  not connected).
- Replacing the existing bell/feed system (plan 067). The existing
  `getNotificationsForUser` merges the new per-user rows alongside admin
  broadcasts and derived event notifications.

## 4. Current behavior (verified 2026-09-10 on `master`)

### What exists

- **Admin broadcasts:** `Notification` model (audience-based, no `userId`),
  composed from `/admin/notifications`, fed into the bell via
  `getNotificationsForUser()`.
- **Derived event notifications:** Workshop, hackathon and cohort items
  computed at read time by `deriveEventNotifications()` — no stored rows.
- **Bell system (plan 067):** `NotificationProvider` renders a panel with the
  newest 5 items (admin + derived, merged). `NotificationRead` keyed by opaque
  string tracks per-user read state.
- **Email:** Brevo transactional mail via `src/lib/email.ts` — `sendEmail({ to,
  subject, html, text })`. `@abtalks.dev` addresses suppressed. No send log, no
  preferences.
- **T-003 stub:** Plan 113 specified a `notifyUser` stub in
  `src/features/notification/notify-user.ts`. **The file was never created.** This
  plan implements the real thing.

### What does NOT exist

- Per-user transactional notifications (no `userId` on `Notification`).
- Delivery tracking (no state machine, no failure recording).
- Notification preferences (no table, no API, no UI).
- Dedupe infrastructure.
- Email templates for transactional events.

### Constraint: no queue infrastructure

`package.json` carries no queue library (BullMQ, pg-boss, Quirrel). The project
runs on Vercel serverless free tier — there is no persistent worker process. Email
delivery happens **inline** within the dispatch call. Failures are recorded with
state and reason; a `retryFailedDeliveries()` function exists for manual or future
cron-based retry, but this PR does not add a cron. This is decision D-1 below.

---

## 5. Architecture

```
Caller (Server Action / Server Component)
  │
  ▼
notificationService.dispatch(event)
  │
  ├─ 1. Build deterministic dedupe_key
  │     format: {event_type}:{recipient_user_id}:{primary_entity_id}
  │
  ├─ 2. INSERT INTO user_notifications ... ON CONFLICT (dedupe_key) DO NOTHING
  │     → 0 rows inserted? Return early (dedupe hit)
  │
  ├─ 3. Always create in-app delivery row (state = 'sent')
  │
  ├─ 4. Check preferences + priority + suppression exemption
  │     → Skip email if: priority = 'low', OR preference says no, OR exempt
  │
  ├─ 5. If email: create email delivery row (state = 'created')
  │     → Attempt send inline via sendEmail()
  │     → Success: state = 'sent'
  │     → Failure: state = 'failed', failure_reason = provider error (1000 chars)
  │
  └─ 6. Return { ok: true, notificationId }
```

### Bell integration

`getNotificationsForUser()` is extended to also query `UserNotification` rows for
the current user, map them to `AppNotification` with `key: "user:<id>"`, and merge
them into the existing feed alongside admin broadcasts and derived events. The
existing bell, provider, panel and mark-read flow work unchanged — `NotificationRead`
already accepts any string key.

---

## 6. Data model

### 6.1 `UserNotification` — per-user transactional notifications

```sql
CREATE TABLE "UserNotification" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "recipientUserId"   TEXT NOT NULL,
  "eventType"         TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "body"              TEXT,
  "href"              TEXT,
  "dedupeKey"         TEXT NOT NULL,
  "primaryEntityId"   TEXT,
  "metadata"          JSONB,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserNotification_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "UserNotification_dedupeKey_key"
  ON "UserNotification" ("dedupeKey");

CREATE INDEX "UserNotification_recipientUserId_createdAt_idx"
  ON "UserNotification" ("recipientUserId", "createdAt" DESC);
```

- `dedupeKey`: deterministic, format `{eventType}:{recipientUserId}:{primaryEntityId}`.
  The unique index enforces idempotency — `INSERT ... ON CONFLICT DO NOTHING`.
- `eventType`: one of the enum values from §7.
- `metadata`: optional JSON for event-specific context (e.g. job title, applicant
  name). Not indexed, not queried — only used for template rendering.
- `primaryEntityId`: the entity this notification is about (job id, application id,
  etc.). Part of the dedupe key.

### 6.2 `NotificationDelivery` — per-channel delivery tracking

```sql
CREATE TABLE "NotificationDelivery" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "notificationId"    TEXT NOT NULL,
  "channel"           TEXT NOT NULL,  -- 'in_app' | 'email'
  "state"             TEXT NOT NULL DEFAULT 'created',  -- created | sending | sent | failed
  "attemptCount"      INT NOT NULL DEFAULT 0,
  "lastAttemptAt"     TIMESTAMPTZ,
  "failureReason"     TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "UserNotification"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key"
  ON "NotificationDelivery" ("notificationId", "channel");

CREATE INDEX "NotificationDelivery_state_idx"
  ON "NotificationDelivery" ("state")
  WHERE "state" IN ('created', 'failed');
```

- Unique on `(notificationId, channel)` — at most one delivery per channel per
  notification.
- Partial index on retryable states for efficient worker queries.

### 6.3 `NotificationPreference` — user × event_type × channel

```sql
CREATE TABLE "NotificationPreference" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"        TEXT NOT NULL,
  "eventType"     TEXT NOT NULL,
  "channel"       TEXT NOT NULL,  -- 'email'
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "NotificationPreference_userId_eventType_channel_key"
  ON "NotificationPreference" ("userId", "eventType", "channel");
```

- Rows are created only when a user explicitly changes a default. Absence = default
  enabled.
- In-app preferences are not stored because in-app delivery cannot be disabled for
  any event type (see §10). The `channel` column is always `'email'` in this PR.

---

## 7. Event taxonomy — notification event types

Every event type has a **priority** that controls email eligibility and a
**suppression exemption** flag that prevents disabling in-app.

| Event type | Priority | Suppression-exempt (in-app) | Email by default | Notes |
|---|---|---|---|---|
| `application.received` | important | yes | yes | Recruiter gets notified of a new applicant |
| `application.status_changed` | important | yes | yes | Candidate learns their application moved |
| `job.closed` | low | no | no | Candidate's bookmarked/applied job was closed |
| `job.reopened` | low | no | no | Candidate's bookmarked/applied job was reopened |
| `profile.viewed` | low | no | no | Candidate learns a recruiter viewed their profile |
| `auth.password_reset` | important | yes | yes | Password reset — always delivered |

**Suppression-exempt event types** (`application.received`, `application.status_changed`,
`auth.password_reset`): in-app delivery cannot be disabled via preferences. Email
can still be disabled for non-auth events. `auth.password_reset` email cannot be
disabled either — it is fully exempt.

**Alignment with GA4 taxonomy (plan 114):** These are domain event types, not GA4
event names. The GA4 event `site_notif_pref_changed` fires when a user toggles a
preference (§4.10 of plan 114). Notification delivery success/failure is
deliberately excluded from GA4 (plan 114 §4.11: "tracked in the delivery log, not
GA").

---

## 8. State machine — delivery lifecycle

```
          ┌───────────┐
          │  created   │
          └─────┬─────┘
                │ atomic claim: UPDATE ... SET state='sending',
                │   attempt_count += 1, last_attempt_at = NOW()
                │   WHERE id = $1 AND state IN ('created','failed')
                │   RETURNING *
                ▼
          ┌───────────┐
          │  sending   │
          └─────┬─────┘
           ╱         ╲
      success       failure
         ╱               ╲
  ┌─────┴────┐    ┌──────┴─────┐
  │   sent    │    │   failed    │
  └──────────┘    └──────┬─────┘
                         │ retryable if attempt_count < MAX_ATTEMPTS (5)
                         │ exponential backoff: 2^attempt minutes
                         ▼
                   back to 'created' or 'failed' state
                   (retry sets state to 'created' via retryFailedDeliveries)
```

### Atomic claim SQL pattern

```sql
UPDATE "NotificationDelivery"
SET "state" = 'sending',
    "attemptCount" = "attemptCount" + 1,
    "lastAttemptAt" = NOW(),
    "updatedAt" = NOW()
WHERE "id" = $1
  AND "state" IN ('created', 'failed')
RETURNING *;
```

Zero rows returned → another process already claimed it, or it was already sent.
Return without error. This is the idempotency guarantee for the delivery layer.

### Retry rules

- **Max attempts:** 5
- **Backoff:** exponential, `2^attemptCount` minutes (2, 4, 8, 16, 32 min)
- **Retry eligibility:** `state = 'failed' AND attemptCount < 5 AND
  lastAttemptAt < NOW() - interval '2^attemptCount minutes'`
- **Retry mechanism:** `retryFailedDeliveries()` function queries eligible rows
  and processes them. This function can be called from an admin action or a future
  cron — this PR does not add a cron.
- After 5 failed attempts, the delivery stays in `failed` state permanently.

---

## 9. Failure semantics

When the email provider throws:

1. Catch the error.
2. Extract the error message: `String(error)`.
3. Truncate to 1000 characters.
4. Store verbatim in `NotificationDelivery.failureReason`.
5. Set `state = 'failed'`.

The `failureReason` column is a diagnostic field — it is never shown to the user,
only visible in admin tooling or database queries. It preserves enough context for
debugging without storing unbounded error payloads.

When `retryFailedDeliveries()` picks up a failed delivery:
- If `attemptCount < 5` and enough time has passed (exponential backoff), it
  re-attempts via the same atomic claim pattern.
- If `attemptCount >= 5`, the row is left in `failed` state.

---

## 10. Preference rules

### Default matrix

Every event type defaults to **enabled** for all channels. Users opt out by
creating a `NotificationPreference` row with `enabled = false`.

| Event type | In-app default | In-app can disable? | Email default | Email can disable? |
|---|---|---|---|---|
| `application.received` | on | **no** (suppression-exempt) | on | yes |
| `application.status_changed` | on | **no** (suppression-exempt) | on | yes |
| `job.closed` | on | no (low-priority, no email) | n/a | n/a |
| `job.reopened` | on | no (low-priority, no email) | n/a | n/a |
| `profile.viewed` | on | no (low-priority, no email) | n/a | n/a |
| `auth.password_reset` | on | **no** (suppression-exempt) | on | **no** (fully exempt) |

- **In-app is always on.** No event type allows disabling in-app delivery. The
  preferences API rejects `{ channel: 'in_app', enabled: false }` with a 400.
- **Low-priority events have no email column** — they are in-app only by design,
  so there is no preference to toggle.
- **`auth.password_reset`** is the only fully exempt event — both in-app and email
  are non-disablable.

### Preference lookup at dispatch time

```ts
function isEmailEnabled(userId: string, eventType: string): Promise<boolean> {
  const eventConfig = EVENT_TYPE_REGISTRY[eventType];
  if (!eventConfig) return false;
  if (eventConfig.priority !== 'important') return false;
  if (eventConfig.emailExempt) return true; // auth.password_reset

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_eventType_channel: { userId, eventType, channel: 'email' } },
    select: { enabled: true },
  });

  return pref?.enabled ?? true; // default: enabled
}
```

---

## 11. Interfaces

### 11.1 Dispatcher

```ts
// src/features/notification/notification-service.ts

type DispatchEvent = {
  eventType: string;           // must be a key in EVENT_TYPE_REGISTRY
  recipientUserId: string;
  primaryEntityId: string;     // e.g. job id, application id
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

type DispatchResult =
  | { ok: true; notificationId: string; deduplicated: boolean }
  | { ok: false; message: string };

export async function dispatch(event: DispatchEvent): Promise<DispatchResult>;
```

### 11.2 Email delivery

```ts
// src/features/notification/email-delivery.ts

export async function processEmailDelivery(deliveryId: string): Promise<void>;
export async function retryFailedDeliveries(): Promise<{ processed: number; succeeded: number; failed: number }>;
```

### 11.3 REST endpoints (preferences)

```
GET  /api/notification-preferences
  → 200: { preferences: { eventType, channel, enabled, canDisable }[] }

PUT  /api/notification-preferences
  Body: { eventType: string, channel: 'email', enabled: boolean }
  → 200: { ok: true }
  → 400: { ok: false, message: "Cannot disable in-app for ..." }
  → 400: { ok: false, message: "Cannot disable email for auth.password_reset" }
```

Implementation note: these are Next.js Route Handlers under
`src/app/api/notification-preferences/route.ts`, not Server Actions, because the
task specifies REST endpoints.

### 11.4 Template folder layout

```
src/features/notification/templates/
  application.received.txt
  application.received.html
  application.status_changed.txt
  application.status_changed.html
  auth.password_reset.txt
  auth.password_reset.html
```

Templates are minimal — plain text and a simple HTML wrapper. T-205 owns the
design polish. Templates receive `{ title, body, href, metadata, recipientName }`
and render a subject line + body.

---

## 12. Bell integration

`getNotificationsForUser()` in `src/features/notification/get-notifications.ts` is
extended to include per-user notifications:

1. Add a `Promise.all` leg: `prisma.userNotification.findMany({ where: {
   recipientUserId: userId }, select: { id, title, body, href, eventType,
   createdAt }, orderBy: { createdAt: 'desc' }, take: FEED_LIMIT })`.
2. Map each to `AppNotification` with `key: "user:<id>"`, `category` derived from
   `eventType` (application.* → "GENERAL", job.* → "GENERAL", profile.* →
   "GENERAL", auth.* → "GENERAL").
3. Merge into the existing `[...adminItems, ...derivedItems, ...userItems]` array,
   sort by `publishedAt` desc, slice to `FEED_LIMIT`.

The existing `NotificationRead` system handles the rest — when the panel opens,
`markNotificationsReadAction` receives `"user:<id>"` keys alongside `"admin:<id>"`
and `"workshop:<eventId>"` keys. No change to the provider, bell button, or panel
components.

---

## 13. Files to touch

### Schema
| Path | | Note |
|---|---|---|
| `prisma/schema.prisma` | `[edit]` | Add `UserNotification`, `NotificationDelivery`, `NotificationPreference` models + back-relations on `User`. |
| `prisma/migrations/<timestamp>_add_notification_service/migration.sql` | `[new]` | Generated by `prisma migrate dev`. |

### Feature module — `src/features/notification/`
| Path | | Note |
|---|---|---|
| `src/features/notification/notification-service.ts` | `[new]` | `dispatch()` entry point. |
| `src/features/notification/email-delivery.ts` | `[new]` | `processEmailDelivery()`, `retryFailedDeliveries()`, atomic claim. |
| `src/features/notification/event-types.ts` | `[new]` | `EVENT_TYPE_REGISTRY` with priority + suppression config. |
| `src/features/notification/templates/application.received.txt` | `[new]` | Minimal text template. |
| `src/features/notification/templates/application.received.html` | `[new]` | Minimal HTML template. |
| `src/features/notification/templates/application.status_changed.txt` | `[new]` | Minimal text template. |
| `src/features/notification/templates/application.status_changed.html` | `[new]` | Minimal HTML template. |
| `src/features/notification/templates/auth.password_reset.txt` | `[new]` | Minimal text template. |
| `src/features/notification/templates/auth.password_reset.html` | `[new]` | Minimal HTML template. |
| `src/features/notification/get-notifications.ts` | `[edit]` | Merge `UserNotification` rows into the bell feed. |

### API routes
| Path | | Note |
|---|---|---|
| `src/app/api/notification-preferences/route.ts` | `[new]` | GET + PUT for preferences. |

### Page
| Path | | Note |
|---|---|---|
| `src/app/settings/notifications/page.tsx` | `[new]` | Placeholder preferences page. Server Component, reuses existing layout/auth. |
| `src/components/settings/notification-preferences-form.tsx` | `[new]` | `"use client"` — list of event types × email toggles. |

### Tests
| Path | | Note |
|---|---|---|
| `src/features/notification/notification-service.test.ts` | `[new]` | Unit tests for dispatcher. |
| `src/features/notification/email-delivery.test.ts` | `[new]` | Integration tests for worker. |
| `src/features/notification/notification-acceptance.test.ts` | `[new]` | TC-S-005 acceptance tests. |

---

## 14. Server vs Client

| Component | Boundary | Notes |
|---|---|---|
| `notification-service.ts` | **Server only** | `import "server-only"`. Called from Server Actions. |
| `email-delivery.ts` | **Server only** | `import "server-only"`. |
| `event-types.ts` | **Shared** | Plain module, no server-only. Importable from client for display. |
| `get-notifications.ts` | **Server only** | Already `import "server-only"`. |
| `api/notification-preferences/route.ts` | **Server** | Route Handler. |
| `settings/notifications/page.tsx` | **Server** | Fetches preferences, passes plain data. |
| `notification-preferences-form.tsx` | **Client** | `"use client"`. Toggle switches, calls PUT endpoint. |

No functions, icons, or class instances cross the Server → Client boundary. The
preferences form receives `{ eventType: string, channel: string, enabled: boolean,
canDisable: boolean, label: string }[]` — all plain serializable values.

---

## 15. Steps

### Step 1 — Prisma schema

Add to `prisma/schema.prisma`, after the existing `NotificationRead` model:

```prisma
model UserNotification {
  id                String                @id @default(cuid())
  recipientUserId   String
  eventType         String
  title             String
  body              String?
  href              String?
  dedupeKey         String                @unique
  primaryEntityId   String?
  metadata          Json?
  createdAt         DateTime              @default(now())

  recipient         User                  @relation("UserNotifications", fields: [recipientUserId], references: [id], onDelete: Cascade)
  deliveries        NotificationDelivery[]

  @@index([recipientUserId, createdAt(sort: Desc)])
}

model NotificationDelivery {
  id              String            @id @default(cuid())
  notificationId  String
  channel         String            // 'in_app' | 'email'
  state           String            @default("created")  // created | sending | sent | failed
  attemptCount    Int               @default(0)
  lastAttemptAt   DateTime?
  failureReason   String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  notification    UserNotification  @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@unique([notificationId, channel])
  @@index([state])
}

model NotificationPreference {
  id          String   @id @default(cuid())
  userId      String
  eventType   String
  channel     String   // 'email'
  enabled     Boolean  @default(true)
  updatedAt   DateTime @updatedAt

  user        User     @relation("NotificationPreferences", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, eventType, channel])
}
```

On the `User` model, add two back-relation lines:

```prisma
  userNotifications        UserNotification[]       @relation("UserNotifications")
  notificationPreferences  NotificationPreference[] @relation("NotificationPreferences")
```

### Step 2 — Event type registry

`src/features/notification/event-types.ts`:

```ts
export type NotificationPriority = "important" | "low";

export type EventTypeConfig = {
  key: string;
  label: string;
  priority: NotificationPriority;
  suppressionExempt: boolean;  // in-app cannot be disabled
  emailExempt: boolean;        // email also cannot be disabled
  defaultEmailEnabled: boolean;
};

export const EVENT_TYPE_REGISTRY: Record<string, EventTypeConfig> = {
  "application.received": {
    key: "application.received",
    label: "New application received",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "application.status_changed": {
    key: "application.status_changed",
    label: "Application status updated",
    priority: "important",
    suppressionExempt: true,
    emailExempt: false,
    defaultEmailEnabled: true,
  },
  "job.closed": {
    key: "job.closed",
    label: "Job listing closed",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "job.reopened": {
    key: "job.reopened",
    label: "Job listing reopened",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "profile.viewed": {
    key: "profile.viewed",
    label: "Profile viewed by a recruiter",
    priority: "low",
    suppressionExempt: false,
    emailExempt: false,
    defaultEmailEnabled: false,
  },
  "auth.password_reset": {
    key: "auth.password_reset",
    label: "Password reset",
    priority: "important",
    suppressionExempt: true,
    emailExempt: true,
    defaultEmailEnabled: true,
  },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_REGISTRY);

export function isValidEventType(type: string): type is keyof typeof EVENT_TYPE_REGISTRY {
  return type in EVENT_TYPE_REGISTRY;
}
```

### Step 3 — Dispatcher

`src/features/notification/notification-service.ts`:

1. Build `dedupeKey = \`${eventType}:${recipientUserId}:${primaryEntityId}\``.
2. Validate `eventType` against `EVENT_TYPE_REGISTRY`. Unknown → return
   `{ ok: false, message: "Unknown event type" }`.
3. In a transaction:
   a. `prisma.userNotification.create({ data: { ... dedupeKey } })` wrapped in
      try/catch for unique constraint violation → return `{ ok: true, deduplicated: true }`.
   b. `prisma.notificationDelivery.create({ data: { notificationId, channel: 'in_app', state: 'sent' } })`.
   c. Check if email should be sent: priority is `important` AND `isEmailEnabled()`.
   d. If yes, `prisma.notificationDelivery.create({ data: { notificationId, channel: 'email', state: 'created' } })`.
4. If email delivery was created, attempt send inline via `processEmailDelivery(deliveryId)`.
5. Return `{ ok: true, notificationId, deduplicated: false }`.

The INSERT-then-catch-unique-violation pattern is chosen over SELECT-then-INSERT
because it is both race-safe and simpler (D-2).

### Step 4 — Email delivery

`src/features/notification/email-delivery.ts`:

1. `processEmailDelivery(deliveryId)`:
   a. Atomic claim: `prisma.$queryRaw` with the UPDATE...RETURNING SQL from §8.
   b. Zero rows → return (already claimed or already sent).
   c. Look up the notification for template data + recipient email.
   d. Render template from `templates/{eventType}.{txt,html}`.
   e. Call `sendEmail()` from `src/lib/email.ts`.
   f. On success: `UPDATE state = 'sent'`.
   g. On failure: `UPDATE state = 'failed', failureReason = String(error).slice(0, 1000)`.

2. `retryFailedDeliveries()`:
   a. Query eligible rows: `state = 'failed' AND attemptCount < 5`.
   b. For each, check backoff window: `lastAttemptAt + 2^attemptCount minutes < now`.
   c. Call `processEmailDelivery(row.id)` for each eligible.
   d. Return counts.

### Step 5 — Templates

Six files under `src/features/notification/templates/`. Each `.html` template is
a minimal wrapper:

```html
<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a1a1a;">{{title}}</h2>
  <p style="color: #333;">{{body}}</p>
  {{#if href}}
  <p><a href="{{baseUrl}}{{href}}" style="color: #2563eb;">View details →</a></p>
  {{/if}}
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #9ca3af; font-size: 12px;">
    You received this because of your notification settings on ABTalks.
  </p>
</div>
```

Each `.txt` template:

```
{{title}}

{{body}}

{{#if href}}View details: {{baseUrl}}{{href}}{{/if}}

---
You received this because of your notification settings on ABTalks.
```

Templates use simple string interpolation (no Handlebars library — replace
`{{var}}` with values). No new dependency.

### Step 6 — Bell integration

Edit `src/features/notification/get-notifications.ts`:

1. Add `prisma.userNotification.findMany(...)` to the `Promise.all`.
2. Map to `AppNotification` with `key: "user:<id>"`.
3. Merge into the combined array.

### Step 7 — Preferences API

`src/app/api/notification-preferences/route.ts`:

- `GET`: auth check, query user's preferences, merge with defaults from
  `EVENT_TYPE_REGISTRY`, return the full matrix.
- `PUT`: auth check, Zod validate `{ eventType, channel, enabled }`, reject
  in-app disable (400), reject `auth.password_reset` email disable (400), upsert
  the preference row.

### Step 8 — Preferences page

`src/app/settings/notifications/page.tsx` — Server Component:
- `requireRole` or auth check (must be signed in).
- Fetch preferences via the same logic as the GET endpoint.
- Render `<NotificationPreferencesForm preferences={...} />`.

`src/components/settings/notification-preferences-form.tsx` — Client Component:
- List event types that have email (`priority === 'important'`).
- Each row: label + email toggle switch.
- Toggle calls `PUT /api/notification-preferences`.
- `auth.password_reset` row shows toggle disabled with "Always on" label.

---

## 16. Known coverage gaps / follow-ups

### T-245 / T-246 event hooks (out of scope for this PR)

The dispatcher is ready but not wired to any event source. The following call
sites should add `notificationService.dispatch(...)` in future PRs:

| Event type | Where the hook goes | File |
|---|---|---|
| `application.received` | `applyToJobAction` success path | `src/app/actions/job-actions.ts` (or equivalent) |
| `application.status_changed` | `updateApplicationStatusAction` | `src/app/actions/job-actions.ts` |
| `job.closed` | `closeJobAction` | `src/app/actions/job-actions.ts` |
| `job.reopened` | `reopenJobAction` | `src/app/actions/job-actions.ts` |
| `profile.viewed` | profile-view recording | T-085 / P4 |
| `auth.password_reset` | password reset flow | `src/app/actions/auth-actions.ts` (or equivalent) |

### T-205 UI replacement

The `/settings/notifications` page is a functional placeholder. T-205 owns the
design, layout, and UX polish.

### Digest batching

Low-priority events are in-app only. If digest email is needed later, add a
`digest` priority level, a batch aggregation function, and a cron job. The
`NotificationDelivery` model already supports this — create a delivery with
`channel: 'email'` and `state: 'created'`, then batch-process.

---

## 17. Guardrails for Cursor (DO NOT)

- **DO NOT** add WhatsApp or SMS. Do not add a `channel` value beyond `in_app`
  and `email`.
- **DO NOT** suppress auth, assessment, outreach-reply or application
  notifications.
- **DO NOT** add a queue dependency (BullMQ, pg-boss, etc.). Email delivery is
  inline.
- **DO NOT** touch `middleware.ts` or `auth.config.ts`. Nothing in this plan
  touches the edge import path.
- **DO NOT** modify `src/components/ui/` (shadcn primitives).
- **DO NOT** modify the existing `Notification` (admin broadcast) model or its
  admin actions. The new `UserNotification` model is separate.
- **DO NOT** use `console.error` — use `lib/logger.ts`.
- **DO NOT** return full Prisma records — every query uses `select`.
- **DO NOT** use `<Button asChild>` — use `buttonVariants` on `<Link>`.
- **DO NOT** add any npm dependency. `zod`, `@getbrevo/brevo` and all UI
  primitives are already available.
- **DO NOT** wire T-245 / T-246 event call sites — only leave clearly marked
  comments at the hook points listed in §16.
- **DO NOT** build the T-205 UI — the preferences page is a functional placeholder
  only.

---

## 18. DB safety

Before touching `prisma/schema.prisma`:

1. `git add -A && git commit -m "checkpoint before notification service schema"` —
   record the commit hash.
2. Create a Neon branch as a snapshot.

Then:

3. `npx prisma migrate dev --name add_notification_service` — this repo uses
   real migrations. A migration file **must** be produced.
4. **If `migrate dev` reports drift, STOP and report it — do NOT run
   `prisma migrate reset`.** Recovery: `prisma migrate diff` → hand-written
   migration SQL → `prisma migrate resolve --applied <name>`.
5. `npx prisma generate`.
6. No seed script and no backfill: all three tables start empty by design.

---

## 19. Testing plan

### Unit tests (`notification-service.test.ts`)

1. **Dedupe:** dispatch same event twice → second call returns
   `{ ok: true, deduplicated: true }`, exactly one `UserNotification` row.
2. **Preference off suppresses email:** set preference `enabled: false` for
   `application.received` email → dispatch → no email delivery row; in-app row
   still created.
3. **Low-priority never emails:** dispatch `job.closed` → no email delivery row.
4. **Suppression-exempt in-app cannot be disabled:** attempting to create a
   preference `{ eventType: 'application.received', channel: 'in_app', enabled: false }`
   via the API → 400.
5. **Unknown event_type rejected:** dispatch with `event_type: 'made.up'` →
   `{ ok: false, message: "Unknown event type" }`.

### Integration tests (`email-delivery.test.ts`)

6. **Forced failure persists reason:** fake provider throws with specific message →
   `processEmailDelivery` runs → delivery `state = 'failed'`,
   `failureReason` contains that message.
7. **Success sends exactly once:** `processEmailDelivery` with working provider →
   `state = 'sent'`, provider called once.
8. **Concurrent claim → only one proceeds:** call `processEmailDelivery` twice on
   the same delivery → provider called at most once.
9. **Retry after failure eventually sends:** first attempt fails, second succeeds →
   final state is `sent`.

### Acceptance tests — TC-S-005 (`notification-acceptance.test.ts`)

10. **Deduplicates on repeat dispatch:** dispatch same event twice → exactly one
    `UserNotification` row, one in-app delivery.
11. **Persists failure state and reason:** fake provider throws → worker runs →
    delivery `state = 'failed'`, `failureReason` contains the error.
12. **Respects preferences:** disable email for one event type → dispatch → no
    email delivery row; in-app row still created.
13. **Idempotent under retry:** invoke `processEmailDelivery` twice on the same
    delivery → provider called exactly once.

---

## 20. Regression guard

> Do not add WhatsApp or SMS. Do not suppress auth, assessment, outreach-reply
> or application notifications.

---

## 21. Evidence checklist

- [ ] PR on `feature/T-248-notification-service` with all phases committed.
- [ ] Automated test output (all green) pasted in the PR description.
- [ ] TC-S-005 four acceptance tests passing.
- [ ] Browser recording: dispatch a notification, see it in the bell, toggle a
      preference, verify the toggle takes effect.

---

## 22. Verification

**Build:** `npm run build` passes (includes `prisma generate` + typecheck).
`npx tsc --noEmit` clean.

**Manual:**

1. Dispatch `application.received` for a test user → bell shows the notification,
   email delivery row exists with `state = 'sent'` (or `failed` if no Brevo key).
2. Dispatch the same event again → no new row (dedupe).
3. Toggle email off for `application.received` at `/settings/notifications` →
   dispatch again with a different `primaryEntityId` → in-app delivery created, no
   email delivery.
4. Attempt to disable in-app for `application.received` via PUT → 400 response.
5. Dispatch `job.closed` → in-app only, no email delivery row regardless of
   preferences.
6. Force a provider failure → delivery `state = 'failed'`, `failureReason` contains
   the error message.

**Files changed — exactly this set, nothing else:**

```
prisma/schema.prisma
prisma/migrations/<timestamp>_add_notification_service/migration.sql
src/features/notification/notification-service.ts
src/features/notification/email-delivery.ts
src/features/notification/event-types.ts
src/features/notification/templates/application.received.txt
src/features/notification/templates/application.received.html
src/features/notification/templates/application.status_changed.txt
src/features/notification/templates/application.status_changed.html
src/features/notification/templates/auth.password_reset.txt
src/features/notification/templates/auth.password_reset.html
src/features/notification/get-notifications.ts
src/app/api/notification-preferences/route.ts
src/app/settings/notifications/page.tsx
src/components/settings/notification-preferences-form.tsx
src/features/notification/notification-service.test.ts
src/features/notification/email-delivery.test.ts
src/features/notification/notification-acceptance.test.ts
```

---

## 23. Commit messages

Phase B: `T-248: notification schema (notifications, deliveries, preferences)`
Phase C: `T-248: notification dispatcher + unit tests`
Phase D: `T-248: email worker with atomic claim + retry`
Phase E: `T-248: preferences API + placeholder settings page`
Phase F: `T-248: TC-S-005 acceptance tests`

---

## 24. Decision record

### D-1: Inline email delivery, no queue (decided 2026-09-10)

**The question.** The task specifies a "worker with atomic claim + exponential
backoff." Should we add a queue library?

**Decision.** No queue. Email delivery happens inline within `dispatch()`. Failures
are recorded; a `retryFailedDeliveries()` function exists for manual or future
cron-based retry.

**Rationale.** The project runs on Vercel serverless free tier with no persistent
worker process. Adding BullMQ or pg-boss would require a Redis instance or a
polling worker that Vercel cannot host. The volume is low (recruiter notifications,
not consumer-scale), and Brevo's API is fast (<500ms per call). Inline delivery
with failure recording and a retry function is the simplest architecture that
satisfies the acceptance criteria.

**Trade-off.** A failed email is not automatically retried until someone calls
`retryFailedDeliveries()`. For Demo 1 this is acceptable — the delivery state is
visible, the retry function works, and a cron can be added in a follow-up.

### D-2: INSERT-then-catch-unique vs. SELECT-then-INSERT (decided 2026-09-10)

**The question.** Two patterns for dedupe: (a) SELECT first, skip if exists; (b)
INSERT with ON CONFLICT DO NOTHING, check `rowCount`.

**Decision.** Pattern (b): INSERT ... ON CONFLICT DO NOTHING. If the Prisma client
throws a P2002 (unique constraint violation) on `dedupeKey`, catch it and return
`{ ok: true, deduplicated: true }`.

**Rationale.** Race-safe without an explicit lock. Two concurrent dispatches of the
same event: one succeeds, one gets the unique violation and returns deduplicated.
With SELECT-then-INSERT, both SELECTs can return "not found" and both INSERTs can
attempt, with one failing — same outcome but more code and a TOCTOU gap.

### D-3: Atomic claim (UPDATE…RETURNING) vs. advisory lock for worker concurrency (decided 2026-09-10)

**The question.** When two processes attempt to deliver the same email, how do we
ensure only one proceeds? Options: (a) PostgreSQL advisory lock on the delivery id,
(b) atomic `UPDATE … SET state='sending' WHERE state IN ('created','failed')
RETURNING *` — zero rows means someone else claimed it.

**Decision.** Atomic UPDATE…RETURNING (pattern b).

**Rationale.** Advisory locks are session-scoped. In Vercel's serverless model,
connections are pooled and sessions are short-lived — an advisory lock taken in
one invocation may not release cleanly if the function times out, and a different
invocation reusing the same pooled connection could inherit it. The UPDATE pattern
is stateless: the row's `state` column IS the lock, visible to any connection,
and the transition is atomic within a single SQL statement. No cleanup, no
session affinity, no risk of leaked locks.

### D-4: Unique index for dedupe vs. advisory lock (decided 2026-09-10)

**The question.** Dedupe enforcement: unique index on `dedupeKey` vs. PostgreSQL
advisory lock around the insert.

**Decision.** Unique index. Same serverless rationale as D-3 — advisory locks are
session-scoped and unreliable under connection pooling. A unique index is
declarative, enforced by the database regardless of application code, and survives
connection pool recycling.

### D-5: Separate UserNotification table vs. nullable userId on Notification (decided 2026-09-10)

**The question.** Plan 113 (T-003 stubs) identified two options for per-user
notifications: "a nullable userId on Notification or a separate table."

**Decision.** Separate `UserNotification` table.

**Rationale.** `Notification` is a broadcast model with `audience` (ALL/CHALLENGE/
PROGRAM/HACKATHON) and no concept of a specific recipient. Adding `userId` would
overload a clean model with two contradictory semantics — "sent to everyone in
this audience" vs. "sent to this one person." The queries, the admin surface, and
the feed-building logic would all need conditional branching. A separate table
keeps each model focused and lets the bell feed merge them as peers with different
`key:` prefixes.

### D-6: In-app delivery state is always 'sent' (decided 2026-09-10)

**The question.** Should in-app deliveries go through the state machine
(created → sending → sent)?

**Decision.** In-app deliveries are created with `state = 'sent'` immediately.
There is no provider call for in-app — the row's existence IS the delivery. The
state machine (claim, attempt, succeed/fail) only applies to email.

### D-7: No new npm dependency for templates (decided 2026-09-10)

**The question.** Use Handlebars, Mustache, or React Email for templates?

**Decision.** Simple string interpolation with `String.replace()`. Templates are
six files with `{{var}}` placeholders. No template library is added.

**Rationale.** Templates are minimal placeholders for Demo 1 (T-205 owns the
design). Adding a template engine for six files that will be replaced is
over-engineering. If T-205 introduces React Email or MJML, the adapter is a
one-function change in `email-delivery.ts`.

### D-8: Dedupe key format — `{eventType}:{recipientUserId}:{primaryEntityId}` (decided 2026-09-10)

**The question.** What should the dedupe key look like? Options: (a) a hash of the
event payload, (b) a composite of domain fields, (c) a caller-supplied opaque key.

**Decision.** Composite: `{eventType}:{recipientUserId}:{primaryEntityId}`.

**Rationale.** The key must be deterministic from the event's identity — "this
event type happened to this person about this entity." Including the timestamp
would make every dispatch unique, defeating dedupe. A hash of the full payload
would change if metadata (title, body) is tweaked on a retry, also defeating
dedupe. A caller-supplied key pushes correctness onto every call site. The
three-part composite is the smallest set of fields that uniquely identifies "what
happened to whom about what" — which is exactly the dedupe boundary. The colon
separator is safe because cuids contain only `[a-z0-9]` and event types use
`[a-z.]`.

### D-9: In-app suppression exemption — why some events cannot be turned off (decided 2026-09-10)

**The question.** Should all in-app notifications be disableable, or should some be
forced on?

**Decision.** In-app delivery is always on for all event types. Suppression-exempt
event types (`application.received`, `application.status_changed`,
`auth.password_reset`) are additionally protected: the API rejects attempts to
disable them with a 400, and the dispatcher ignores any preference row that
somehow exists.

**Rationale.** In-app notifications have near-zero cost to the user — they sit in a
bell panel, never interrupt, and are dismissed by opening the panel. Disabling them
would create a silent failure mode: an application arrives, no one is told, and the
recruiter discovers it days later by accident. For auth events
(`auth.password_reset`), suppression would be a security gap — the user must know
a reset was requested whether or not they initiated it. The suppression exemption
is a product-safety rule, not a convenience default.
