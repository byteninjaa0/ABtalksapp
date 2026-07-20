# 042 — Knowledge Hub, phase 3: admin authoring

> Read `039-knowledge-hub-00-roadmap.md` first. **Requires 040 merged and migrated.**
> Independent of 041 except for the `revalidatePath` targets in step 6.
>
> **Revised after research (039 §3).** Write actions now run 040's
> `renderArticleContent()` pipeline and store the derived HTML/TOC; the editor preview
> is a Server Action running that same pipeline, so preview output is byte-identical to
> what publishes. If you are holding an earlier copy that previews with `react-markdown`
> client-side and warns about duplicate headings, that draft is superseded.

## 1. Goal

Give an admin a complete authoring loop — write, preview, publish, feature, retire — for
Hub articles, without a deploy and without touching a JSON seed file. This is the first
content CRUD UI in the codebase; `/admin/content` has always been read-only.

## 2. Current behavior

No article admin exists. The pattern to copy is `/admin/jobs`:

- `src/app/actions/admin-job-actions.ts` — `"use server"`, `requireAdmin()` first line
  of every export, Zod `safeParse`, `{ ok, ... }` envelope, `revalidatePath` on the
  public route *and* the admin routes.
- `src/app/admin/layout.tsx` already calls `requireAdmin()` and renders `AdminSidebar` +
  `AdminMobileNav` from a `navItems` array. **Every page under `/admin` is therefore
  already gated by the layout** — do not re-gate pages, but *do* gate every action
  (actions are not covered by a layout).
- `AdminSidebar` takes `{ href, label, icon }` where `icon` is a **string union**
  resolved to a Lucide component inside the client sidebar. Adding a nav item means
  extending that union, not passing a component.

040 added `renderArticleContent()` — the single write-time pipeline that turns markdown
into sanitized HTML + TOC + reading time. **Every article write in this phase goes
through it.** It is the only thing permitted to produce `contentHtml`.

## 3. Files to touch

- `[new] src/app/admin/articles/page.tsx` — list (Server)
- `[new] src/app/admin/articles/new/page.tsx` — create (Server shell)
- `[new] src/app/admin/articles/[id]/edit/page.tsx` — edit (Server shell)
- `[new] src/app/actions/hub-admin-actions.ts` — all mutations
- `[new] src/components/admin/article-form.tsx` — **Client**, RHF + Zod, write/preview tabs
- `[new] src/components/admin/article-row-actions.tsx` — **Client**, publish/feature/delete
- `[new] src/features/admin/get-articles-admin.ts` — list query
- `[edit] src/app/admin/layout.tsx` — one `navItems` entry
- `[edit] src/components/admin/admin-sidebar.tsx` — one icon-union member + mapping
- `[edit] src/components/admin/admin-mobile-nav.tsx` — same, only if it keeps its own icon map
- `[new] docs/plans/042-knowledge-hub-03-admin.md` (this file)

**Not touched:** `prisma/schema.prisma` (040 already has every column this needs),
`middleware.ts`, `auth.config.ts`, `next.config.ts`, `src/components/ui/*`,
`src/app/hub/*`.

## 4. Server vs Client

| File | Boundary | Notes |
|---|---|---|
| the 3 `page.tsx` | **Server** | fetch + pass serializable props; gated by the admin layout |
| `get-articles-admin.ts` | **Server** | `select`-only, no `content` |
| `hub-admin-actions.ts` | **Server Actions** | `requireAdmin()` in every export |
| `article-form.tsx` | **Client** | RHF, tabs, live preview |
| `article-row-actions.tsx` | **Client** | confirm dialogs, `useTransition` |

Boundary specifics:

- `article-form` receives `categories: { id, name }[]` and, in edit mode, a plain
  `defaultValues` object. **No `Date` objects** — pass `publishedAt` as an ISO string or
  null. **No Prisma model instances** — build a plain literal in the page.
- The form calls the Server Actions directly (imported into the client module); it does
  not post to an API route.
- `article-row-actions` receives `{ id, status, isFeatured, title }` — primitives only.

## 5. Steps

### Step 1 — `src/features/admin/get-articles-admin.ts`

```ts
export async function getArticlesAdmin(params: {
  q?: string;
  status?: ArticleStatus;
  page?: number;
}): Promise<{ articles: AdminArticleRow[]; total: number; totalPages: number }>;
```

Unlike the public query this one has **no status filter by default** (drafts must be
visible) and orders by `updatedAt: "desc"` — an author wants what they last touched, not
what published first. Page size 20. `select`: `id, slug, title, status, kind,
isFeatured, featuredRank, viewCount, readingMinutes, publishedAt, updatedAt, authorName`
plus `category: { select: { name: true } }`. **No `content`.**

Add `// Caller must be admin-gated (the /admin layout does this).`

### Step 2 — `/admin/articles` list page

- Status filter as `<Link>` tabs (All / Draft / Published / Archived) with counts, plus
  a search box. Reuse the URL-param approach from 041; do not introduce client filter
  state.
- A `<Table>` (the `ui/table.tsx` primitive exists): Title (+ slug in muted text below),
  Category, Status badge, Kind, Views, Updated, Actions.
- Status badge colours: `DRAFT` → `secondary`, `PUBLISHED` → `default`, `ARCHIVED` →
  `outline`. Featured rows get a small star next to the title.
- On mobile the table must not force horizontal page scroll — wrap it in
  `overflow-x-auto`, or render a stacked card list below `sm`. The admin area is used on
  a phone as much as anything else here.
- "New article" — a `<Link href="/admin/articles/new">` styled with `buttonVariants()`.
- Empty state: "No articles yet." + the same CTA.

### Step 3 — `article-form.tsx` (Client)

One component serving both create and edit, discriminated by a `mode: "create" | "edit"`
prop. React Hook Form + `zodResolver(articleInputSchema)` from `@/lib/validations/hub`.

Layout: a two-column grid on `lg` — main column (title, slug, excerpt, content) and a
sidebar column (category, kind, tags, cover, author, SEO). Above the content field, two
tabs: **Write** and **Preview**.

- **Write** — a monospace `<Textarea>`, `min-h-[28rem]`, `font-mono text-sm`.
- **Preview** — calls `renderPreviewAction(content)` (step 5), debounced 400ms, and
  renders the returned HTML into a `.hub-prose` container with
  `dangerouslySetInnerHTML`. Show a small spinner while the transition is pending and
  keep the previous HTML on screen rather than blanking it.

  **Why a server round trip instead of `react-markdown` in the browser:** it runs the
  *actual* publish pipeline, including `rehype-sanitize`. A client-side preview would
  render things that get stripped on save, which makes the preview a liar exactly where
  it matters most. The round trip is admin-only and cheap.

Behaviour:

- **Slug** auto-derives from the title via `slugify` from
  `@/features/hub/render-article-content` while the field is untouched; once the user
  edits the slug manually, stop overwriting it. In `mode: "edit"` never auto-change the
  slug — changing a published URL breaks inbound links, so show a warning when the user
  edits it deliberately.
- **Reading time** — read from the `renderPreviewAction` response (it returns
  `readingMinutes` alongside the HTML) and show it next to the tabs as "≈ 7 min read".
  Do not compute it separately on the client.
- **Tags** — a chip input: type, Enter or comma commits, ✕ removes, max 8, deduped
  case-insensitively. Submits `string[]` of raw names; the action handles slugging and
  upserting.
- **`canonicalUrl`** — an optional field in the SEO group, labelled "Originally
  published at" with help text explaining it should be set only when the piece ran
  somewhere else first (Medium, dev.to). 041 emits it as `rel="canonical"`.
- **Character counters** on `excerpt` (200), `seoTitle` (70), `seoDescription` (180) —
  these are search-result truncation limits, so make them visible rather than only
  validating on submit.
- **Cover preview** — plain `<img>` next to the URL field, hidden on error via
  `onError`.
- Submit buttons: **Save draft** and **Save & publish** in create mode; **Save**,
  **Publish** / **Unpublish**, and **Archive** in edit mode. `useTransition` for pending
  state, `toast.success` / `toast.error` via `sonner`, then `router.push` to the list on
  success (or `router.refresh()` when staying on the edit page).
- Show server-side field errors (e.g. slug already taken) by mapping the action's
  message onto the relevant field with RHF's `setError`, not just a toast.

### Step 4 — new / edit pages

`new/page.tsx` — fetch `getCategoriesWithCounts()`, render
`<ArticleForm mode="create" categories={...} />`. If there are zero categories, render a
short explainer ("Create a category in Prisma Studio first — see plan 040 step 13")
instead of an unusable form. There is no category CRUD UI in this phase.

`[id]/edit/page.tsx` — `getArticleForAdmin(id)` (from 040), `notFound()` if absent, map
to plain `defaultValues` (ISO strings, `tags: article.tags.map(t => t.name)`), render the
form. Add a "View" link — to `/hub/[slug]` when published, and a note that drafts are not
publicly visible.

### Step 5 — `hub-admin-actions.ts`

`"use server"`. Every export starts with `const admin = await requireAdmin();` — actions
are **not** covered by the admin layout's gate.

Exports:

| Action | Behaviour |
|---|---|
| `createArticleAction(input)` | `articleInputSchema.safeParse`; **`await renderArticleContent(content)`** → store `contentHtml`, `toc`, `readingMinutes`; `status: "DRAFT"`; `createdByAdminId: admin.id`; upsert tags; connect. Returns `{ ok: true, data: { id } }`. |
| `updateArticleAction(input)` | `articleUpdateSchema`; **re-run `renderArticleContent`** and overwrite all three derived fields; set `contentUpdatedAt: new Date()`; `tags: { set: [], connect: [...] }` to replace the tag set. |
| `publishArticleAction({ id })` | `status: "PUBLISHED"`, and `publishedAt: existing.publishedAt ?? new Date()` — republishing must **not** reset the original publish date. Do **not** touch `contentUpdatedAt` here; publishing is not editing. |
| `unpublishArticleAction({ id })` | `status: "DRAFT"`. Leave `publishedAt` intact. |
| `archiveArticleAction({ id })` | `status: "ARCHIVED"`. |
| `toggleArticleFeaturedAction({ id })` | Flip `isFeatured`. When turning **on**, set `featuredRank` to `(max existing rank ?? 0) + 10`; when off, null it. |
| `deleteArticleAction({ id })` | Hard delete. Requires a typed-confirmation dialog client-side. |
| `renderPreviewAction({ content })` | `requireAdmin()`, Zod (`content` ≤ 200k chars), `renderArticleContent(content)`, return `{ ok: true, data: { html, toc, readingMinutes } }`. **Read-only — no DB write.** |

Rules for all of them:

- **`contentHtml`, `toc` and `readingMinutes` are only ever written from
  `renderArticleContent()`'s return value.** Never from form input, never hand-assembled.
- **`contentUpdatedAt` is set only by `updateArticleAction`** — not by publish, not by
  feature, not by view counting (D10). It is the "Last updated" a reader sees and the
  `lastModified` Google sees, so it must mean "a human changed the words".

- Zod at entry, always `safeParse`, always return the envelope
  `{ ok: true, data } | { ok: false, message }`. Never throw to the client.
- **Slug uniqueness** — catch Prisma `P2002` on `slug` and return
  `{ ok: false, message: "That slug is already used by another article." }`. Do not let
  a raw Prisma error reach the UI.
- **Tag upsert + article write go in one `prisma.$transaction`** (multi-step write rule).
  Upsert each tag by `slug` (`slugify(name)` from
  `@/features/hub/render-article-content`), then connect.
- Empty optional strings (`""` from the form) must be written as `null`, not `""` —
  otherwise `coverImageUrl ?? fallback` checks in 041 silently fail on an empty string.
  Normalise once in a small local helper inside this file.
- `logger.error` on failure with the action name and article id. Never `console.error`.

### Step 6 — revalidation

After every successful mutation call this local helper:

```ts
function revalidateHub(slug?: string) {
  revalidatePath("/hub");
  revalidatePath("/hub/[slug]", "page");   // all article pages (ISR + generateStaticParams)
  revalidatePath("/hub/category/[slug]", "page");
  revalidatePath("/hub/tag/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/articles");
  if (slug) revalidatePath(`/hub/${slug}`);
}
```

The bracketed forms with `"page"` are required to invalidate **dynamic** ISR routes;
`revalidatePath("/hub/some-slug")` alone only clears that one path and leaves the
category and tag listings stale. Getting this wrong is the likely bug in this phase:
publish appears to work, but the article never shows up on `/hub`.

### Step 7 — admin navigation

Add `{ href: "/admin/articles", label: "Articles", icon: "articles" as const }` to
`navItems` in `src/app/admin/layout.tsx`, placed after "Content". Then extend the icon
string union **and** the icon→component map inside `admin-sidebar.tsx` (and
`admin-mobile-nav.tsx` if it keeps a separate map) with `articles` → `Newspaper` from
`lucide-react`. The icon crosses the boundary as the string `"articles"`, never as a
component (039 §6).

## 6. Guardrails for Cursor (DO NOT)

- **`requireAdmin()` goes in every Server Action in `hub-admin-actions.ts`** — the admin
  layout gates pages, not actions. Conversely, **do not** add `requireAdmin` to the
  three `page.tsx` files; the layout already did it, and double-gating has caused
  redirect loops in this codebase before.
- **Do not add `requireAdmin`/`requireRole` to anything under `src/app/hub/` or to
  `hub-view-actions.ts`.** That surface is public (039 §6).
- **Do not modify `prisma/schema.prisma` or add a migration.** Every field this phase
  writes was created in 040. If something appears to be missing, stop and report — do
  not add a column.
- **Do not touch `middleware.ts`, `auth.config.ts`, or `next.config.ts`.**
- **Do not modify `src/components/ui/*`.** Need `tabs`/`dialog`? Both already exist. Any
  genuinely missing primitive goes in via `npx shadcn@latest add`.
- **Do not install an editor library** — no TipTap, no MDX editor, no Monaco, no
  `react-markdown-editor`. A `<Textarea>` plus a preview tab is the decision (039 D3).
- **Do not preview with `react-markdown` on the client.** It skips `rehype-sanitize`, so
  the preview would show content that gets stripped on save. Use `renderPreviewAction`.
- **Do not re-implement the pipeline, `slugify`, reading time, or TOC extraction.** All
  of it lives in `@/features/hub/render-article-content`. This phase calls it; it does
  not reproduce any part of it.
- **Do not write `contentHtml` from anything other than `renderArticleContent()`'s
  return value**, and never expose it as a form field.
- **No `<Button asChild>` / `<Button render={<Link>}>`** — `buttonVariants()` on the
  `<Link>`.
- **Do not pass `Date` objects or icon components from Server to Client.**
- **Do not soft-delete via a flag** — `ARCHIVED` already covers "retire it", and
  `deleteArticleAction` is a real delete. Do not add a `deletedAt`.
- Do not create files beyond §3 — no `article-editor-utils.ts`, no `hub-admin-types.ts`.
- No `any`. No `console.*`.

## 7. DB safety

No schema change — 040 owns the migration. But this phase writes **and deletes** article
rows, so before first run: `git add -A && git commit -m "checkpoint before hub admin"`.
`deleteArticleAction` is irreversible; the typed-confirmation dialog is not optional.

## 8. Verification

1. Non-admin (a test student account) hits `/admin/articles` → redirected to
   `/dashboard` by the existing layout gate.
2. Create: fill the form, watch the slug auto-derive from the title, edit the slug
   manually, confirm it stops auto-updating. Save as draft → row appears with a `DRAFT`
   badge.
3. The draft's `/hub/[slug]` URL 404s while unpublished (`getPublishedArticle` filters
   on status). If it renders, the public query is wrong — fix it in 040's file.
4. Publish → the article appears on `/hub` **and** on its category page **and** on its
   tag page. This is the step 6 revalidation check; if the category page is stale, the
   `"page"` variants are missing.
5. Unpublish → gone from `/hub`; republish → `publishedAt` in Prisma Studio is
   **unchanged** from the first publish.
6. Feature it → it appears in the featured strip. Feature a second → both appear, in
   `featuredRank` order.
7. Create a second article with an existing slug → an inline field error on the slug
   input reading "That slug is already used…", not a crash and not a bare toast.
8. Paste `<script>alert(1)</script>` and an `onerror=` attribute into the body → the
   preview shows them stripped, and after save `contentHtml` in the DB contains neither.
   This is the sanitize check, and the preview and the stored value must agree.
9. Paste ~2000 words → the reading time reads ≈10 min in the preview; after save,
   `readingMinutes` in the DB matches what the preview showed.
10. Edit a published article's body and save → `contentUpdatedAt` moves, `publishedAt`
    does not, and 041's "Last updated" line reflects the new date. Then publish/unpublish
    it → `contentUpdatedAt` does **not** move (D10).
11. Save an article with two `## Setup` headings → both get distinct ids in
    `contentHtml` (`rehype-slug` appends `-1`) and both TOC links land correctly. No
    warning is needed; this is handled, not mitigated.
12. Add 3 tags, save, reopen the edit page → all 3 are present. Remove one, save, reopen
    → 2 remain, and `ArticleTag` rows were not duplicated (check Prisma Studio).
13. Preview tab renders the same markdown as the published page (headings, lists, code,
    links).
14. Delete an article → typed confirmation required; afterwards it is gone from `/hub`
    and from the sitemap.
15. 390px viewport: the list is readable without horizontal page scroll and the form is
    usable.
16. `npx tsc --noEmit` and `npm run build` clean.
17. `git status` — changed files match §3. The three edited files are `admin/layout.tsx`,
    `admin-sidebar.tsx`, and (only if it has its own icon map) `admin-mobile-nav.tsx`.

## 9. Commit message

`Add admin authoring UI for Knowledge Hub articles`

---

## Post-042: update the context doc

Once 040–042 have all shipped, add to `docs/project-context.md`:

- §7 Public routes — `/hub`, `/hub/[slug]`, `/hub/category/[slug]`, `/hub/tag/[slug]`
- §7 Admin routes — `/admin/articles`
- §4 Domain model — `Article`, `ArticleCategory`, `ArticleTag`, `ArticleStatus`, `ArticleKind`
- §8 Server Actions — `hub-view-actions.ts`, `hub-admin-actions.ts`
- §9 Feature modules — `hub/`
- §10 Content management — note that Hub articles are **admin-authored in the DB**, the
  first content type in the product that is not seeded from JSON
- §16 — move "no sitemap/robots" off any pending list; `src/app/sitemap.ts` and
  `src/app/robots.ts` now exist and are global
