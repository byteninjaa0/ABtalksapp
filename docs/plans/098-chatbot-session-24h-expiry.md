# 098 — Rudra AI: expire chat sessions after 24h of inactivity

## 1. Goal

Rudra AI currently keeps every chat session in `localStorage` forever, so a user's
history accumulates from the first message they ever sent. Expire each session
24 hours after its **last** activity, so abandoned chats disappear while an
active conversation is never yanked out from under the user.

## 2. Current behavior

All state lives in one client component, [`src/components/chatbot/ChatWidget.tsx`](../../src/components/chatbot/ChatWidget.tsx):

- Sessions are a `Record<string, Session>` persisted under the single
  `localStorage` key `abtalks_chatbot_sessions` (`SESSION_KEY`, line 35).
- `Session` already carries `updatedAt: number` (line 32) — **nothing ever reads
  it for expiry**, only for sorting the "Recent Chats" list.
- The hydration effect (lines 76–96) blind-casts the parsed blob
  (`JSON.parse(saved) as Record<string, Session>`), sets it all, and selects the
  most recently updated session.
- The persist effect (lines 99–106) rewrites the whole map on every `sessions`
  change.
- `updatedAt` is already refreshed on the paths that matter: `startNewSession`
  (line 122), `updateSession` (line 135), `addUserMessage` (line 157), and the
  streaming placeholder insert (line 197). The per-character streaming updates
  (lines 282–292) and the finalize update (lines 305–314) deliberately do not
  bump it — leave that as is, the user's turn immediately prior already did.

So the TTL data is present; only the eviction is missing.

**Pre-existing hazard this change turns into a real crash.** Several
`setSessions` updaters index `prev[currentSessionId]` and immediately spread or
read `.messages` off the result with no guard. Today `currentSessionId` always
points at a live session so it never fires. Once sessions can be evicted while
mounted, an unguarded `{ ...undefined, messages: [...undefined.messages] }`
throws a `TypeError` and kills the widget. Step 4 fixes every one of these; it
is not optional cleanup.

## 3. Files to touch

| Path | Change | Note |
| --- | --- | --- |
| `src/components/chatbot/ChatWidget.tsx` | `[edit]` | The entire change. TTL constant, two helpers, prune on hydrate, sweep interval, undefined-session guards. |

**No new files.** The helpers are ~15 lines and used only here — per the standing
guardrail, they go at module scope in this same file, not in a new `src/lib/*`
module.

## 4. Server vs Client

- `ChatWidget.tsx` — **Client** (`"use client"`, line 1). Unchanged.
- No Server Component, Server Action, route handler, or Server→Client prop
  passing is involved. `localStorage` only; nothing crosses the boundary.
- Not in the middleware/edge import path.

## 5. Steps

### Step 1 — TTL constant and helpers (module scope, next to `SESSION_KEY`, line 35)

Add below the existing `SESSION_KEY` declaration:

```ts
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

function isExpired(session: Session, now: number): boolean {
  // A non-numeric updatedAt (hand-edited or truncated storage) would make every
  // comparison NaN and keep the row forever — treat it as expired instead.
  return !Number.isFinite(session.updatedAt) || now - session.updatedAt > SESSION_TTL_MS;
}

/**
 * Drops sessions idle for more than SESSION_TTL_MS. Returns the SAME object
 * reference when nothing expired, so `setSessions` bails out of the re-render
 * and the persist effect does not rewrite localStorage on every sweep.
 */
function pruneExpired(
  sessions: Record<string, Session>,
  now: number,
): Record<string, Session> {
  const kept: Record<string, Session> = {};
  let dropped = false;
  for (const [id, session] of Object.entries(sessions)) {
    if (isExpired(session, now)) dropped = true;
    else kept[id] = session;
  }
  return dropped ? kept : sessions;
}
```

The identity-preserving return is load-bearing — do not "simplify" it to always
return a fresh object.

### Step 2 — Prune on hydration (replace the body of the effect at lines 76–96)

Inside the existing `try`, after `JSON.parse`, filter before anything reaches
state so expired sessions never enter React at all:

```ts
const parsed = JSON.parse(saved) as Record<string, Session>;
const live = pruneExpired(parsed, Date.now());
const sortedIds = Object.keys(live).sort((a, b) => live[b].updatedAt - live[a].updatedAt);
if (sortedIds.length > 0) {
  setSessions(live);
  setCurrentSessionId(sortedIds[0]);
} else {
  startNewSession();
}
```

Keep the surrounding `if (saved)` / `else` / `catch` structure and the
`hydrated.current` guard exactly as they are. When everything has expired,
`startNewSession` writes a map containing only the fresh session, and the
persist effect overwrites the stale blob on the next tick — no explicit
`removeItem` needed.

### Step 3 — Sweep while the tab stays open

A tab left open across a day (or a laptop resuming from sleep) must not keep
dead sessions alive until the next reload. Add a ref mirror plus one interval
effect, placed after the existing persist effect (line 106).

```ts
const sessionsRef = useRef(sessions);
useEffect(() => {
  sessionsRef.current = sessions;
}, [sessions]);

useEffect(() => {
  const timer = setInterval(() => {
    const current = sessionsRef.current;
    const live = pruneExpired(current, Date.now());
    if (live === current) return; // nothing expired — no state write, no storage write
    setSessions(live);
    const ids = Object.keys(live).sort((a, b) => live[b].updatedAt - live[a].updatedAt);
    if (ids.length > 0) {
      setCurrentSessionId((cur) => (cur && live[cur] ? cur : ids[0]));
    } else {
      startNewSession();
    }
  }, SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}, []);
```

Two things to get right:

- Read from `sessionsRef.current` and decide **outside** the `setSessions`
  updater. Do not compute the survivor list or touch a ref inside an updater —
  updaters must stay pure (React may invoke them twice in StrictMode).
- The `[]` dep array captures `startNewSession` stale. That is fine and
  intentional: it only calls `generateId` and the three stable `useState`
  setters. Do **not** add it to the dep array — that would re-create the
  interval on every render.

The widget's early return at line 409 (`if (!open && !minimized)`) sits *after*
all hooks, so this sweep runs even while the launcher is collapsed. That is
intended.

### Step 4 — Guard every `prev[currentSessionId]` lookup (required)

Eviction can now remove the session an in-flight handler is holding an id for.
Add an explicit early return at each of these sites — the exact line numbers are
pre-change:

| Line | Function | Fix |
| --- | --- | --- |
| 145 | `addUserMessage` | `const session = prev[currentSessionId]; if (!session) return prev;` before building `title` |
| 192 | `streamApiMessage` (placeholder insert) | `const s = prev[currentSessionId]; if (!s) return prev;` |
| 206 | `streamApiMessage` (history read) | `const session = sessions[currentSessionId]; if (!session) return;` before the `for` loop |
| 306 | `streamApiMessage` (finalize) | `const s = prev[currentSessionId]; if (!s) return prev;` |
| 320 | `streamApiMessage` (error path) | `const s = prev[currentSessionId]; if (!s) return prev;` |
| 350 | `handleSubmit` (menu branch) | `const s = prev[currentSessionId]; if (!s) return prev;` |
| 365 | `handleSubmit` (local-match branch) | `const s = prev[currentSessionId]; if (!s) return prev;` |

Line 286 already has this guard — leave it. `updateSession` (line 131),
`giveFeedback`, and `dismissSuggestion` are already guarded — leave them.

### Step 4b — Refresh `updatedAt` on the two `handleSubmit` branches (found during implementation)

Section 2 above claimed every write path already bumps `updatedAt`. That was
wrong for two of them: the menu branch (line 350) and the local-match branch
(line 365) rebuild `messages` without touching `updatedAt`. Under the old
never-expire behavior that was invisible. Under a rolling TTL it is a real bug —
a user who only ever clicks suggestion chips or types "menu" hits
`matchQuestion` every time, never reaches `addUserMessage`, and so their
actively-used session would still expire after 24 hours.

Both blocks therefore also gain `updatedAt: Date.now()` alongside the guard:

```ts
return { ...prev, [currentSessionId]: { ...s, messages: [...s.messages, userMsg, botMsg], updatedAt: Date.now() } };
```

### Step 5 — Nothing else

Do not touch the greeting text, the "Rudra AI" header label, the matcher, the
API route, or the streaming logic.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** create a new file. No `src/lib/chatbot-session-store.ts`, no
  `use-chat-sessions.ts` hook. Everything goes in `ChatWidget.tsx`.
- **DO NOT** make `pruneExpired` always return a new object. Returning `prev`
  unchanged is what stops a `localStorage` write every 60 seconds.
- **DO NOT** call `startNewSession`, mutate a ref, or read other state from
  inside a `setSessions` updater. Updaters stay pure.
- **DO NOT** add `startNewSession` or `sessions` to the sweep effect's dep array.
- **DO NOT** skip Step 4. Adding eviction without the guards ships a crash.
- **DO NOT** expire on a fixed IST midnight boundary or on a store-wide
  `createdAt`. This is a rolling per-session TTL keyed on `updatedAt` — that was
  the explicit product decision.
- **DO NOT** also cap message count per session, trim old messages inside a
  surviving session, or add a "clear history" button. Out of scope.
- **DO NOT** "fix" the adjacent pre-existing issues in this file — the
  `catch (err: any)` at line 316, the `console.warn`/`console.error` at lines 104
  and 317, or the raw `API Error: ${err.message}` shown to users. They are real,
  they are logged separately, and folding them in here would make the diff
  unreviewable.
- **DO NOT** switch the storage key or its shape. Existing rows must keep
  loading; they already carry `updatedAt`.
- Confirm the file was actually written and `npm run build` passes before
  reporting done.

## 7. DB safety

**N/A.** No Prisma schema change, no migration, no seed, no server-side data.
This is browser `localStorage` only.

## 8. Verification

**Typecheck / build**

```
npx tsc --noEmit
npm run build
```

Both must pass clean. No new `any`.

**Manual — expiry fires**

1. Open the site, click the Rudra AI launcher, send 2–3 messages. Reload — the
   chat is still there (sanity: TTL not misfiring).
2. DevTools → Application → Local Storage → `abtalks_chatbot_sessions`. Edit the
   session's `updatedAt` to `Date.now() - 25 * 60 * 60 * 1000` (paste
   `Date.now() - 90000000` into the console for the value).
3. Reload. The widget opens on a fresh "New Chat" with the greeting; the old
   session is gone from **both** the chat view and the "Recent Chats" list.

**Manual — active chat survives**

4. Create three sessions. Age two of them past 24h as above, leave one current.
   Reload → only the fresh one remains, and it is the one selected.

**Manual — sweep while mounted**

5. With the widget open, set the current session's `updatedAt` back 25h in
   storage, then trigger a re-persist (send a message in a *second* session, or
   just wait). Within ~60s the expired session disappears from Recent Chats and
   the widget stays interactive — no console error, no blank panel.

**Manual — no idle write churn**

6. With a fresh session and the widget open, watch the `abtalks_chatbot_sessions`
   value in DevTools for ~3 minutes of inactivity. It must **not** change. If it
   rewrites every 60s, `pruneExpired`'s identity-preserving return was broken.

**Files that should have changed**

Exactly one: `src/components/chatbot/ChatWidget.tsx`. Anything else in
`git status` means the scope leaked.

## 9. Commit message

```
fix(chatbot): expire Rudra AI sessions after 24h of inactivity

Chat history in localStorage grew unbounded from a user's first ever
message. Each session now carries a rolling 24h TTL keyed on its existing
updatedAt: expired sessions are dropped on hydration and by a 60s sweep
while the tab stays open, so abandoned chats clear themselves while an
active conversation keeps resetting its own clock.

Guards every prev[currentSessionId] lookup, since eviction can now remove
a session an in-flight streaming handler still holds an id for.
```
