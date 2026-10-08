# 188 — Security email when a password is changed, reset or set

**Owner:** Manuvrtti (notification email).
**CROSS-MODULE — Sohail must review:** one call added to `storePassword` in
`src/lib/email-auth.ts` (authentication architecture).

## 1. Goal
Tell the owner of an address whenever the account's password changes, so a
takeover is noticed. Today nothing is sent.

## 2. Current behavior
`storePassword` (the one writer for PASSWORD_SET / PASSWORD_CHANGED /
PASSWORD_RESET, used by the settings page, "Forgot password?" and recruiter
set-password) updates the hash and writes an audit row. No email.

## 3. Files to touch
- `src/features/notification/password-changed-email.ts` `[new]` — render + send, never throws.
- `src/lib/email-auth.ts` `[edit]` — one call after the transaction (Sohail).
- `src/lib/abt-mailer.ts` / `.test.ts` `[edit]` — `account.password_changed` is essential.
- `docs/CHANGELOG.md` `[edit]`.

## 4. Server vs Client
Server-only. Not in the edge path.

## 5. Steps
1. `sendPasswordChangedEmail({ userId, kind })`: load email, name and whether
   the user is a recruiter; send kind `account.password_changed`, no
   List-Unsubscribe, no secret in it. Copy per kind; "If this wasn't you" points
   to `/login` or `/recruiter-onboarding/signin`.
2. `storePassword`: `await sendPasswordChangedEmail(...)` after the transaction
   commits, so a send failure can never roll back the change.

## 6. Guardrails (DO NOT)
No password, code or reset link in the email. Do not send before the
transaction commits. No change to rate limits, hashing or session handling.

## 7. DB safety
None.

## 8. Verification
`npm run test:email-login` (15/15), `npm run test:abt-mailer`, typecheck, lint.
Manual: change the password on /settings/security → "Your ABTalks password was
changed" arrives; "Forgot password?" → "…was reset"; first password → "A
password was added…".

## 9. Commit message
`feat(auth): email the account owner when its password changes (plan 188)`
