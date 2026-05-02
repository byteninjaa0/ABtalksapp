# AI Guardrails for ABtalks

Never do these without explicit approval:

- Modify prisma/schema.prisma in destructive ways (drop columns, drop tables)
- Change AUTH_SECRET, AUTH_URL, or any env var defaults
- Bypass the requireAdmin() check on admin routes
- Add wildcards to OAuth redirect URIs
- Run prisma migrate reset on production
- Use prisma.user.deleteMany() without scoped where clause
- Add features that bypass the consistency rules of the 60-day challenge

Special routes:
- middleware.ts: edge-safe only, no @/lib imports
- public profile fetcher: only safe fields (no phone/email/resume)
- admin actions: must create AdminAction audit log row

If you're unsure, stop and ask the human reviewer.