# ABtalks Conventions

## Server vs Client Components
- Default to Server Components
- Add "use client" only when interactivity is required
- Pass primitive props across boundary, never component references

## Server Actions
- All mutations via Server Actions
- Always validate input with Zod first
- Always return discriminated union: { ok: true, data } | { ok: false, message }
- Wrap multi-step writes in transactions with timeout: 20000

## Database Queries  
- Always use Prisma `select` clauses, never full-record returns
- Never expose phone, email, resumeUrl in public-facing fetchers
- Public profile fetcher must call getPublicProfile, not getProfile

## Errors
- Log via lib/logger.ts, never console.error
- User-facing messages are friendly, not technical
- Foreign key violations should never reach the user

## Imports in Edge-Runtime files
- middleware.ts must NOT import from @/lib/*
- middleware.ts uses only next-auth and next/server