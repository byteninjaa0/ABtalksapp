# 040 — Knowledge Hub, phase 1: schema + write pipeline + query layer

> Read `039-knowledge-hub-00-roadmap.md` first, **including §3 (prior art)** — the
> non-obvious parts of this schema are copied from Forem's production `articles` table,
> and §3 explains why each one is there. Decisions D1–D10 are locked.
>
> **Revised after research.** If you are holding an earlier copy of this plan: the
> markdown pipeline moved to write time, search moved to `tsvector`, and D9's slugify
> problem was deleted rather than mitigated. Work from this version.
>
> **Nothing in this plan is user-visible.**

## 1. Goal

Put the Hub's data model in Postgres, build the **write-time rendering pipeline** that
turns markdown into stored HTML + TOC, and build the typed `select`-only read layer that
phases 041 and 042 consume — so neither of those phases makes a data decision.

The organizing principle, from Forem: **one expensive write, many free reads.** Every
read path here must do zero markdown parsing and zero heading extraction.

## 2. Current behavior

No article models exist. `prisma/schema.prisma` is 777 lines across ~40 models; the
closest analogue is `Job` (line 352) — flat model, admin-authored, `isOpen` visibility
flag, `@@index([isOpen, createdAt(sort: Desc)])`. The Hub follows that shape and adds a
category relation, an implicit tag m2m, a status enum, and the derived-content columns.

`src/lib/validations/` holds 10 domain schema files; `src/features/<domain>/` holds one
exported function per file (see `features/jobs/get-open-jobs.ts` — 14 lines,
`select`-only). Match both conventions exactly.

`react-markdown` is installed and used in 7 places, but it is a **React renderer** — it
cannot produce an HTML string. That is why this phase adds the `unified`/`remark`/
`rehype` packages listed in 039 §6.

## 3. Files to touch

- `[edit] package.json` — add the 8 pipeline deps (039 §6). No other dependency changes.
- `[edit] prisma/schema.prisma` — 3 models + 2 enums, appended near `Job`
- `[new] prisma/migrations/<timestamp>_add_hub_articles/migration.sql` — generated, then hand-append the raw SQL in step 3
- `[new] src/lib/validations/hub.ts` — filter schema + admin create/update schemas
- `[new] src/features/hub/render-article-content.ts` — **the write-time pipeline**
- `[new] src/features/hub/search-articles.ts` — the only `$queryRaw` in the feature
- `[new] src/features/hub/list-articles.ts` — filtered, paginated list + count
- `[new] src/features/hub/get-article.ts` — by slug (published) / by id (admin)
- `[new] src/features/hub/get-related.ts`
- `[new] src/features/hub/get-hub-surfaces.ts` — featured + trending + category counts
- `[new] src/features/hub/get-categories.ts`
- `[new] docs/plans/040-knowledge-hub-01-foundation.md` (this file)

**Deleted from the earlier version of this plan:** `slugify.ts`, `toc.ts` and
`reading-time.ts` are no longer separate files. All three collapse into
`render-article-content.ts`, because heading ids now come from `rehype-slug` and the TOC
is extracted from the same pass (D9 withdrawn). Do not create them.

No routes, no components, no `middleware.ts`, no `auth.config.ts`, no `next.config.ts`.

## 4. Server vs Client

Everything in this phase is server-side. `render-article-content.ts` is invoked from
Server Actions in 042 and never from a browser.

Add `import "server-only";` to `render-article-content.ts` and `search-articles.ts`. The
unified/rehype chain is a meaningful bundle if it ever leaks into a client component,
and `server-only` turns that mistake into a build error instead of a slow page.

The five query files import `@/lib/db` and are server-only by consequence — do not add
`"use client"` to any of them.

## 5. Steps

### Step 1 — dependencies

```
npm i unified remark-parse remark-gfm remark-rehype rehype-slug rehype-sanitize rehype-stringify unist-util-visit
```

Nothing else. If you believe another package is needed, stop and report rather than
installing it.

### Step 2 — schema

Append to `prisma/schema.prisma`, next to the `Job` model:

```prisma
enum ArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum ArticleKind {
  ARTICLE
  TUTORIAL
  RESEARCH
  GUIDE
  NEWS
}

model ArticleCategory {
  id          String    @id @default(cuid())
  slug        String    @unique
  name        String
  description String?
  /// Hex for the category chip, e.g. "#8B5CF6". Applied as an inline style —
  /// Tailwind cannot generate a class from a runtime value. Null = neutral.
  accentColor String?
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  articles    Article[]

  @@index([sortOrder])
}

model ArticleTag {
  id        String    @id @default(cuid())
  slug      String    @unique
  name      String
  createdAt DateTime  @default(now())
  articles  Article[] @relation("ArticleToTag")
}

model Article {
  id               String          @id @default(cuid())
  slug             String          @unique
  title            String
  /// Card copy + fallback meta description. Enforced <= 200 chars in Zod.
  excerpt          String

  // ── Source of truth ────────────────────────────────────────────────
  /// Markdown as the author typed it. The only field a human edits.
  content          String

  // ── Derived at write time by renderArticleContent(). Never hand-edited. ──
  /// Sanitized HTML with heading ids already applied. Rendered directly.
  contentHtml      String
  /// TocEntry[] — [{ id, text, level }]. Extracted from the same rehype pass.
  toc              Json
  readingMinutes   Int             @default(1)

  kind             ArticleKind     @default(ARTICLE)
  status           ArticleStatus   @default(DRAFT)

  categoryId       String
  category         ArticleCategory @relation(fields: [categoryId], references: [id])
  tags             ArticleTag[]    @relation("ArticleToTag")

  coverImageUrl    String?
  coverImageAlt    String?
  /// Set when this article was first published elsewhere (Medium, dev.to).
  /// Emitted as <link rel="canonical"> so we don't compete with the original.
  canonicalUrl     String?

  /// v1 authorship is denormalized strings, not a User relation — Forem does the
  /// same (`cached_user_name`) to avoid a join on every card. See 039 §3.
  authorName       String
  authorRole       String?
  authorAvatarUrl  String?

  isFeatured       Boolean         @default(false)
  /// Manual order within the featured strip. Null sorts last.
  featuredRank     Int?
  viewCount        Int             @default(0)

  seoTitle         String?
  seoDescription   String?

  publishedAt      DateTime?
  /// Real editorial "Last updated" — set ONLY by the admin write actions.
  /// Do NOT use `updatedAt` for this: @updatedAt fires on the viewCount
  /// increment too, so it would claim every article changes hourly. (D10)
  contentUpdatedAt DateTime?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  createdByAdminId String

  @@index([status, publishedAt(sort: Desc)])
  @@index([categoryId, status, publishedAt(sort: Desc)])
  @@index([status, isFeatured, featuredRank])
  @@index([status, viewCount(sort: Desc)])
}
```

`category` uses the default `onDelete: Restrict` — a category with articles cannot be
deleted. Intentional; 042 surfaces it as a friendly error.

`toc` is `Json` rather than a relation because it is derived data with a fixed shape that
is always read whole, alongside its article, and never queried across articles.

### Step 3 — DB safety, then migrate

Follow `project-context.md` §17 **before** running anything:

1. `git add -A && git commit -m "checkpoint before hub schema"` — record the hash here.
2. Create a Neon branch as a snapshot.
3. `npx prisma migrate dev --name add_hub_articles`
4. `npx prisma generate`

Additive only — no column drops, no renames, no backfill. Existing rows are untouched.

### Step 4 — raw SQL: search column + partial indexes

Two things Prisma's schema language cannot express. After `migrate dev` generates the
file and **before** committing, append to that same `migration.sql`:

```sql
-- Full-text search document. GENERATED ALWAYS means Postgres maintains it on every
-- insert/update with zero application code — it can never drift from the content.
-- Weights: A = title, B = excerpt, C = body. ts_rank uses them to rank results.
ALTER TABLE "Article" ADD COLUMN "searchDocument" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')),   'A') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'C')
  ) STORED;

CREATE INDEX "Article_search_idx" ON "Article" USING GIN ("searchDocument");

-- Partial indexes: drafts and archived rows never enter them, so the public
-- read paths scan a smaller index. Forem does this on every hot index.
CREATE INDEX "Article_published_recent_idx"
  ON "Article" ("publishedAt" DESC) WHERE "status" = 'PUBLISHED';
CREATE INDEX "Article_published_popular_idx"
  ON "Article" ("viewCount" DESC, "publishedAt" DESC) WHERE "status" = 'PUBLISHED';
CREATE INDEX "Article_published_featured_idx"
  ON "Article" ("featuredRank" ASC, "publishedAt" DESC)
  WHERE "status" = 'PUBLISHED' AND "isFeatured" = true;
```

Then re-run `npx prisma migrate dev` to apply the amended file.

**`searchDocument` is invisible to Prisma Client** — it is not in `schema.prisma`, so it
never appears in a generated type. That is fine and intended: only
`search-articles.ts` touches it, via raw SQL. Do **not** add it to the Prisma model;
Prisma has no `tsvector` type and would try to "fix" the drift on the next migration.

> Prisma **will** report drift on this column in `migrate dev` going forward. That is
> expected. Never resolve it by dropping the column.

### Step 5 — `src/features/hub/render-article-content.ts`

The heart of this phase. One export:

```ts
import "server-only";

export type TocEntry = { id: string; text: string; level: 2 | 3 };
export type RenderedArticle = {
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
};

export async function renderArticleContent(markdown: string): Promise<RenderedArticle>;
```

Pipeline, in order:

```
unified()
  .use(remarkParse)
  .use(remarkGfm)                    // tables, strikethrough, task lists, autolinks
  .use(remarkRehype)
  .use(rehypeSlug)                   // assigns id="..." to every heading
  .use(rehypeSanitize, schema)       // MUST come after slug so ids survive
  .use(rehypeStringify)
```

Then, to build the TOC, run `unist-util-visit` over the **same** HAST tree after
`rehype-slug` has run, collecting `h2`/`h3` nodes as `{ id: node.properties.id, text:
<flattened text>, level }`. Do not re-parse the markdown and do not regex the output
HTML — the whole point is that ids and TOC come from one pass and therefore cannot
disagree.

Implementation note: to read the tree mid-pipeline, either write a tiny local plugin
that captures headings into a closure array, or run `.run()` on the parsed tree and walk
it before stringifying. The closure-plugin approach is fewer moving parts.

**Sanitize schema.** Start from `defaultSchema` and extend it, do not replace it:

- allow `id` on `h1`–`h6` (otherwise `rehype-slug`'s work is stripped and the TOC links
  point at nothing — this is the single most likely bug in this file)
- allow `className` on `code` and `pre` (language hints)
- allow `target` and `rel` on `a`
- allow `loading`, `decoding`, `width`, `height` on `img`

Do not loosen it further. No `script`, no `style`, no `iframe`, no `on*` handlers.

`readingMinutes` — count words on the **markdown** with fenced code blocks stripped,
`Math.max(1, Math.ceil(words / 200))`.

Also export `slugify(input: string): string` from this file (lowercase, strip
non-alphanumerics, collapse whitespace to `-`) — 042 uses it to derive an article slug
from its title. It is **not** used for heading anchors any more; `rehype-slug` owns
those.

### Step 6 — `src/lib/validations/hub.ts`

Filters (consumed by 041's Server Components, parsing `searchParams`):

```ts
export const hubFiltersSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(80).optional(),   // category slug
  tag: z.string().max(80).optional(),        // tag slug
  kind: z.enum(["ARTICLE","TUTORIAL","RESEARCH","GUIDE","NEWS"]).optional(),
  sort: z.enum(["recent", "popular"]).default("recent"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type HubFilters = z.infer<typeof hubFiltersSchema>;
export const HUB_PAGE_SIZE = 12;
```

It must be **lenient**: `searchParams` is attacker-controlled and a junk `?sort=lol` must
fall back to defaults, not 500. Export
`parseHubFilters(searchParams: Record<string, string | string[] | undefined>): HubFilters`
that `safeParse`s and returns `hubFiltersSchema.parse({})` on failure.

Admin schemas (consumed by 042) — `articleInputSchema` with `title` (4–140), `slug`
(`/^[a-z0-9-]+$/`), `excerpt` (20–200), `content` (min 50), `kind`, `categoryId`, `tags`
(≤8), `coverImageUrl`/`coverImageAlt`, `canonicalUrl`, `authorName`/`authorRole`/
`authorAvatarUrl`, `seoTitle` (≤70), `seoDescription` (≤180). URL fields are
`.url().max(500).optional().or(z.literal(""))`. Plus
`articleUpdateSchema = articleInputSchema.extend({ id: z.string().min(1) })`.

`contentHtml`, `toc`, `readingMinutes`, `status`, `publishedAt`, `contentUpdatedAt`,
`viewCount`, `isFeatured` and `createdByAdminId` are **not** author inputs — they are
derived or set by the actions in 042. A form field for any of them is a bug.

### Step 7 — `src/features/hub/search-articles.ts`

The only raw SQL in the feature. One export:

```ts
import "server-only";
/** Ranked article ids for a full-text query. Callers hydrate via Prisma. */
export async function searchArticleIds(q: string, limit: number, offset: number):
  Promise<{ ids: string[]; total: number }>;
```

Build the tsquery so that the **last term gets a prefix wildcard** — a search box must
match "mach" → "machine" as the user types, and `websearch_to_tsquery` alone will not:

```ts
const terms = q.trim().toLowerCase().split(/\s+/)
  .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))   // strip tsquery operators
  .filter(Boolean);
if (terms.length === 0) return { ids: [], total: 0 };
const tsquery = terms.map((t, i) => (i === terms.length - 1 ? `${t}:*` : t)).join(" & ");
```

Stripping every non-alphanumeric character is what makes this injection-safe at the
tsquery level — `&`, `|`, `!`, `(`, `)`, `:` and `'` can never reach the parser. Pass
`tsquery` as a **parameter** via `Prisma.sql` / tagged-template `$queryRaw`, never string
interpolation. Both defences, not one.

```sql
SELECT id, COUNT(*) OVER() AS total
FROM "Article"
WHERE "status" = 'PUBLISHED'
  AND "publishedAt" IS NOT NULL
  AND "searchDocument" @@ to_tsquery('english', $1)
ORDER BY ts_rank("searchDocument", to_tsquery('english', $1)) DESC, "publishedAt" DESC
LIMIT $2 OFFSET $3
```

`COUNT(*) OVER()` returns the total alongside the page in one round trip. Postgres
returns `bigint` for it, which Prisma surfaces as `BigInt` — convert with `Number()`
before it reaches any JSON boundary or it will throw at serialization.

Wrap in try/catch, `logger.error`, and return `{ ids: [], total: 0 }` on failure. A
malformed query must degrade to "no results", never a 500 on a public page.

### Step 8 — `src/features/hub/list-articles.ts`

```ts
export type ArticleCardData = { /* the select below, flattened */ };
export async function listArticles(filters: HubFilters): Promise<{
  articles: ArticleCardData[];
  total: number;
  totalPages: number;
}>;
```

Two paths:

**With `q`** — call `searchArticleIds(q, HUB_PAGE_SIZE, offset)`, then run the normal
typed Prisma query with `where: { id: { in: ids }, ...otherFilters }` and **re-sort the
result in JS to match `ids` order** (`ids.map(id => byId.get(id))`), because
`WHERE id IN (...)` does not preserve order and losing the ranking defeats the search.
Note the tradeoff honestly: category/tag/kind filters are applied *after* the search
page is cut, so a heavily-filtered search can return fewer than 12 rows on a page. That
is acceptable for v1; the fix is moving the filters into the raw query, and it is not
worth the complexity until someone reports it.

**Without `q`** — pure typed Prisma. `where` is `status: "PUBLISHED"`,
`publishedAt: { not: null }`, plus optional `category: { slug }`,
`tags: { some: { slug } }`, `kind`. `orderBy`: `recent` → `{ publishedAt: "desc" }`;
`popular` → `[{ viewCount: "desc" }, { publishedAt: "desc" }]`. One
`prisma.$transaction([findMany, count])` so the list and count agree.

`select` for both paths: `id, slug, title, excerpt, kind, coverImageUrl, coverImageAlt,
authorName, authorAvatarUrl, readingMinutes, publishedAt, viewCount`, plus
`category: { select: { slug, name, accentColor } }` and
`tags: { select: { slug, name }, take: 3 }`.

**`content` and `contentHtml` must not appear in any list `select`.** They are the two
largest columns in the table and pulling either into a 12-row grid query is the most
expensive mistake available in this feature.

### Step 9 — `src/features/hub/get-article.ts`

- `getPublishedArticle(slug)` — `status: "PUBLISHED"`, selects `contentHtml`, `toc`,
  `readingMinutes`, all SEO fields, `canonicalUrl`, `publishedAt`, `contentUpdatedAt`,
  category and all tags. **Does not select `content`** — the reader page renders HTML and
  has no use for the markdown source. Returns `null` if absent.
- `getArticleForAdmin(id)` — selects `content` (the editable source) and **not**
  `contentHtml`, with no status filter so 042 can edit drafts. Add
  `// Caller must be admin-gated.`

The two functions selecting different columns is deliberate, not an oversight: the
public page never needs markdown, the editor never needs HTML.

Cast `toc` through the `TocEntry[]` type at this boundary — `Json` arrives as
`Prisma.JsonValue`. Validate with a small Zod array parse rather than a bare `as`; the
column is derived data, but a bad cast here surfaces as a crash on a public page.

### Step 10 — `src/features/hub/get-related.ts`

`getRelatedArticles(articleId, categoryId, tagSlugs, limit = 3)`. Three tiers, stop once
`limit` is filled, always excluding `articleId` and anything already picked:

1. published, shares ≥1 tag, same category — `orderBy: publishedAt desc`
2. published, same category
3. published, most recent overall

Reuse the `ArticleCardData` select from step 8 so 041 renders related items with the same
card component. (039 §9 notes pgvector as the eventual replacement for this heuristic.)

### Step 11 — `src/features/hub/get-hub-surfaces.ts`

`getHubSurfaces()` → `{ featured, trending, categories }` from one
`prisma.$transaction([...])`:

- `featured` — `status: PUBLISHED, isFeatured: true`,
  `orderBy: [{ featuredRank: "asc" }, { publishedAt: "desc" }]`, `take: 5`. Postgres
  sorts `NULL` last on `ASC`, which is what we want.
- `trending` — `status: PUBLISHED`, `publishedAt: { gte: subDays(new Date(), 30) }`,
  `orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }]`, `take: 5`.
  **Fallback:** if fewer than 3 rows return, re-query without the date window. A new Hub
  has no 30-day history and an empty trending rail looks broken.
- `categories` — via `get-categories.ts`.

Use `date-fns` `subDays`. Do **not** reach for `lib/date-utils.ts` — that module is about
IST *challenge-day* boundaries, and publishing windows are not challenge days.

### Step 12 — `src/features/hub/get-categories.ts`

`getCategoriesWithCounts()` — all categories by `sortOrder` then `name`, each with
`_count: { select: { articles: { where: { status: "PUBLISHED" } } } }`. Used by the index
filter rail and by 042's category select.

### Step 13 — seed the categories

No seed file in this plan and no category admin UI in 042. Create these by hand in
`npx prisma studio` after migrating:

| slug | name | accentColor | sortOrder |
|---|---|---|---|
| `fundamentals` | AI Fundamentals | `#8B5CF6` | 10 |
| `tutorials` | Hands-on Tutorials | `#0891B2` | 20 |
| `research` | Research Notes | `#4F46E5` | 30 |
| `career` | AI Careers | `#10B981` | 40 |
| `tooling` | Tools & Workflows | `#F59E0B` | 50 |

Colours come from the existing domain palette in `globals.css` so the Hub reads as the
same product.

## 6. Guardrails for Cursor (DO NOT)

- **Do not create any route or component in this phase.** No `src/app/hub/**`, no
  `src/components/hub/**`. If you are writing JSX, stop — that is 041.
- **Do not create `slugify.ts`, `toc.ts`, or `reading-time.ts` as separate files.** They
  are all inside `render-article-content.ts` now (§3). An older draft of this plan listed
  them; that draft is superseded.
- **Do not add `searchDocument` to `schema.prisma`.** Prisma has no `tsvector` type. The
  drift warning it produces is expected and must never be resolved by dropping the
  column.
- **Do not put `rehype-sanitize` before `rehype-slug`.** It will strip the heading ids
  and every TOC link will silently go nowhere.
- **Do not string-interpolate the search query into SQL.** Tagged-template `$queryRaw`
  with bound parameters, plus the character strip in step 7. Both.
- **Do not select `content` or `contentHtml` in any list query.**
- **Do not use `updatedAt` for "last updated" display or sitemap `lastModified`.** That
  is `contentUpdatedAt` (D10). `updatedAt` is polluted by view-count writes.
- **Do not edit or reorder existing models/enums in `schema.prisma`.** Append only. A
  stray edit in a 777-line schema turns an additive migration into a destructive one.
- Do not run `npm run db:seed`, `db:cleanup:*`, or any script that writes existing
  tables. The only DB commands here are `migrate dev`, `generate`, `studio`.
- **Install exactly the 8 packages in step 1.** Nothing else.
- Do not invent extra files — no `hub-constants.ts`, no `hub-types.ts`. Types are
  exported from the file that produces them.
- No `any`. `searchParams` values are `string | string[] | undefined` — narrow them in
  `parseHubFilters`, don't cast. No `console.*` — use `lib/logger.ts`.

## 7. DB safety

**Required — this phase changes the schema.**

1. `git add -A && git commit -m "checkpoint before hub schema"`
2. Record the commit hash in the PR description.
3. Create a Neon branch from `main` as a restore point.
4. `npx prisma migrate dev --name add_hub_articles`
5. Append the raw SQL (step 4), re-run `npx prisma migrate dev`
6. `npx prisma generate`

Additive only: 3 new tables, 2 new enums, 0 changes to existing tables. Rollback is
`prisma migrate resolve --rolled-back` plus restoring the Neon branch.

## 8. Verification

- `npx prisma migrate status` — clean.
- `npx tsc --noEmit` — clean.
- `psql $DATABASE_URL -c '\d "Article"'` — `searchDocument` is present, is `tsvector`,
  and the four new indexes exist.
- In `npx prisma studio`: the 5 categories exist.
- Scratch script (`npx tsx scratch.ts`, **delete it afterwards**) asserting:
  - `renderArticleContent(md)` on a body with two H2s, one H3, a fenced code block, a
    GFM table and a `<script>alert(1)</script>`:
    - `html` contains `<h2 id="...">` — **ids present** (this is the sanitize-order check)
    - `html` contains a rendered `<table>` — GFM is on
    - `html` contains **no** `<script>` — sanitize is on
    - `toc` has 3 entries, levels `[2,2,3]`, ids matching the ids in `html` exactly
    - `readingMinutes >= 1`
  - Insert that article as `PUBLISHED`, then:
    - `listArticles({ sort: "recent", page: 1 })` returns it, and the object has **no**
      `content` and **no** `contentHtml` key
    - **the key test:** search for a distinctive phrase that appears **only in the body**,
      not the title or excerpt — `listArticles({ q: "<that phrase>", ... })` finds it.
      If it doesn't, `searchDocument` is not wired up.
    - `listArticles({ q: "mach" })` matches an article containing "machine" — prefix
      matching works
    - `listArticles({ q: "zzzznope" })` → `{ total: 0 }`, no throw
    - `listArticles({ q: "foo & bar | baz ! (qux)" })` → no throw, no SQL error
  - `parseHubFilters({ sort: "lol", page: "-4" })` returns defaults rather than throwing.
- Changed files match §3 — plus the generated migration folder and `package.json` /
  `package-lock.json`, minus the deleted scratch file.

## 9. Commit message

`Add Knowledge Hub schema, write-time render pipeline, and query layer`
