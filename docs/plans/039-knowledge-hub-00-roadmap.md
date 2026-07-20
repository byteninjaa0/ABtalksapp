# 039 — ABTalks AI Knowledge Hub (roadmap)

> **This file is not executable.** It is the architecture decision record for the Hub.
> Cursor executes `040`, `041`, `042` in order. Read this first, then the phase plan.

---

## 1. Goal

A premium, data-driven AI content destination at **`/hub`** — articles, tutorials,
research write-ups and guides — with categories, search, filters, featured/trending
surfaces, a first-class reading experience (TOC, reading progress, related content),
and a full admin authoring UI. Public, SEO-indexed, mobile-first, and architected so
the article count can grow into the thousands without a rewrite.

Why now: ABTalks is pre-launch and has no organic acquisition surface. Every route
today is either gated or a conversion funnel. The Hub is the only planned surface that
earns search traffic and gives the 60-day challenge a reason to be found.

## 2. Current behavior

Nothing like this exists. Relevant precedent already in the repo:

- **Content today is JSON → seed → Postgres** (`prisma/content/*.json`,
  `prisma/seed.ts`). There is no content CRUD UI anywhere; `/admin/content` is a
  read-only viewer. The Hub is the **first** admin-authored content system.
- **Markdown rendering** already ships via `react-markdown` in 7 places. The richest
  treatment is `src/components/program/markdown-code.tsx` (`programMdComponents`) —
  click-to-copy `code`/`pre`. It is Program-skinned (hard-coded `#E8E6E3`, `#968BEC`)
  so the Hub gets its **own** component map rather than reusing that one.
- **Public-page shape** is `src/app/jobs/[id]/page.tsx`: `AppHeader` + centered
  `max-w-3xl` column. The Hub follows it, wider for the index grid.
- **Admin CRUD precedent** is `src/app/actions/admin-job-actions.ts` +
  `/admin/jobs` — `requireAdmin()`, Zod, result envelope, `revalidatePath`. The Hub's
  admin actions mirror it exactly.
- **No `sitemap.ts`, no `robots.ts`, no `next/image` remote patterns exist yet.**
  Phase 2 adds all three; they are global files, so they must cover the existing
  public routes too, not just the Hub.

## 3. Prior art (researched July 2026 — this is where the decisions come from)

Three sources, in descending order of usefulness:

**[Forem](https://github.com/forem/forem/blob/main/db/schema.rb) — the schema behind dev.to, open source, millions of articles.** Their `articles` table is the closest thing to a reference implementation that exists, and five things in it are load-bearing:

1. **`body_markdown` *and* `processed_html` are both stored columns.** Markdown is rendered to sanitized HTML **once, at write time**. Reads never parse markdown. [Their maintainers describe](https://dev.to/michael/how-should-markdown-be-saved-and-rendered-51f) the write-time pipeline as doing far more than a markdown pass — image rehosting, security restrictions, "always growing" — and keeping the source markdown is what lets them reprocess everything when it changes.
2. **Ranking is materialized, not computed at read time.** `hotness_score`, `score`, `reading_time`, `comments_count`, `public_reactions_count`, `organic_page_views_past_month_count` are all denormalized indexed columns.
3. **Hot indexes are partial** — `where: "(published IS TRUE)"` on the `[featured, published, published_at]` and `[user_id, published, score, published_at]` indexes. Drafts never enter the index.
4. **Author data is denormalized onto the article** — `cached_user`, `cached_user_name`, `cached_organization` — to avoid a join on every card.
5. **Search is a `tsvector` column (`reading_list_document`) with a GIN index.** Trigram (`gin_trgm_ops`) is used only on `cached_tag_list`, not on prose. There is also a `semantic_embedding vector(768)` with an HNSW index for semantic retrieval.

**[Ghost](https://docs.ghost.org/publishing)** stores canonical content as Lexical JSON and renders per destination. Confirms the "store a source format, derive the presentation format" split — but a structured JSON document model only pays off if you need multi-target rendering (web + native + email). We don't, so markdown stays the source (D3).

**GeeksforGeeks** — [inspected a live DSA article](https://www.geeksforgeeks.org/dsa/introduction-to-arrays-data-structure-and-algorithm-tutorials/). What it does well: a prominent **"Last Updated: 16 Feb, 2026"** directly under the title (they revise old articles and surface the freshness), multi-language tabbed code blocks, a "Related articles" block, and 30–40 internal links per page — that internal link graph is the engine of their search traffic. What it does *badly* and we should not copy: no table of contents on a very long page, no breadcrumb, no visible category or difficulty metadata. Vercel Docs and Medium are the better models for the reading column itself.

## 4. Decisions (locked — do not relitigate mid-build)

| # | Decision | Why |
|---|---|---|
| D1 | **Route namespace `/hub`** — `/hub`, `/hub/[slug]`, `/hub/category/[slug]`, `/hub/tag/[slug]` | Chosen by the owner. Unused, matches the brand name, reads as a destination not a blog. |
| D2 | **Postgres-backed, not MDX-in-repo** | "Thousands of articles", runtime search/filter/trending, and non-technical authoring all require a DB. MDX would make search build-time-only and every edit a deploy. |
| D3 | **Markdown is the stored source format** | Portable, diffable, no editor lock-in. Ghost's Lexical JSON solves a multi-target-rendering problem we don't have. |
| **D3b** | **Store `content` (markdown) *and* `contentHtml` (sanitized HTML) *and* `toc` (Json) — all produced by one write-time pipeline.** Reads do zero markdown work. | Forem's `body_markdown` + `processed_html` split, adopted directly. Three consequences, all good: the article page renders `contentHtml` from a **Server Component** so `react-markdown` leaves the client bundle entirely; heading anchors are generated once by `rehype-slug`, which **deletes the dual-slugify problem** rather than mitigating it; and the pipeline can be changed and every article reprocessed. Sanitization also happens once, at write, instead of being trusted per render. |
| D4 | **Full admin CRUD UI in Phase 3** (`/admin/articles`) | Chosen by the owner. No seed-file authoring path ships; the DB is the only source of truth. |
| **D5** | **Search is a Postgres generated `tsvector` column over title (weight A) + excerpt (B) + content (C), GIN-indexed.** `$queryRaw` returns ranked ids; the typed Prisma query hydrates them. | Revised after the Forem finding — they search prose with `tsvector` and reserve trigram for tag lists. The earlier plan searched title+excerpt only, which for a knowledge hub is close to useless: someone searching "vector database chunking" would miss every article that doesn't put those words in its title. A `GENERATED ALWAYS ... STORED` column needs **zero application code to stay in sync**, and confining the raw SQL to an id lookup keeps every filter, sort, `select` and pagination path typed and in one place. |
| D6 | **URL is the filter state** — `?q=&category=&tag=&kind=&sort=&page=` | Shareable, crawlable, back-button correct, works with JS off, and the page stays a Server Component. Client JS is only the debounced search input. |
| D7 | **ISR (`revalidate = 3600`) + `revalidatePath` on admin writes** | Matches the repo's existing revalidation style (`admin-job-actions.ts`). Deliberately **not** `unstable_cache` — despite what `project-context.md` §5 claims, nothing in `src/` uses it today. |
| D8 | **Trending = `viewCount` within a 30-day window**, incremented by a Server Action fired from a client effect | Keeps the article page statically cacheable — the write is a separate request, not part of render. Approximate by design; it ranks a strip, it is not analytics. **Known divergence from Forem:** they materialize `hotness_score` and `organic_page_views_past_month_count` as indexed columns because a query-time window doesn't scale. At a few hundred articles the windowed query with a partial index is fine. Revisit when the Hub passes ~2,000 articles or the index stops being used. |
| **D9** | **Withdrawn.** `rehype-slug` assigns heading ids during the write-time pipeline, and the TOC is extracted from that same pass and stored. | There is no longer a client-side markdown renderer, so there is no second slugify implementation to keep in agreement. The problem D9 existed to mitigate no longer exists. |
| **D10** | **`contentUpdatedAt` is a separate column from `updatedAt`**, set only by the admin write actions, and it is what feeds `dateModified` and the sitemap's `lastModified`. | Prisma's `@updatedAt` fires on `updateMany` too — so every **page view** would bump `updatedAt`. Feeding that to Google would claim every article is edited constantly, which devalues the freshness signal it is supposed to carry. GFG surfaces "Last Updated" prominently because it works; it only works if it is true. |

## 5. Phase map

| Plan | Scope | Ships |
|---|---|---|
| **040** | Schema, migration, **the write-time markdown pipeline**, validations, query layer | Nothing user-visible. Migration + `src/features/hub/*` + Zod schemas. Verified by a scratch script and `tsc`. |
| **041** | Public `/hub` — index, article reader, category/tag pages, SEO | The whole reader-facing product. Depends on 040. |
| **042** | `/admin/articles` — list, editor, publish/feature/delete actions | Authoring. Depends on 040; independent of 041 except for `revalidatePath` targets. |

**Sequencing rule:** 040 must be merged and migrated before 041 or 042 start. 041 and
042 can be built in either order — but until 042 ships there is no way to create an
article, so seed 2–3 rows by hand in Prisma Studio to develop 041 against.

## 6. Architecture at a glance

The shape of the whole thing is: **one expensive write, many free reads.**

```
                    ADMIN WRITE (rare)                    PUBLIC READ (constant)
                    ──────────────────                    ──────────────────────
  markdown ──▶ renderArticleContent()                     contentHtml ──▶ dangerouslySetInnerHTML
                 remark-parse                                              (Server Component,
                 remark-gfm                                                 zero client JS)
                 remark-rehype                            toc (Json)  ──▶ <ArticleToc />
                 rehype-slug        ──┐                   searchDocument ──▶ GIN index
                 rehype-sanitize      │                                      (generated, automatic)
                 rehype-stringify     │
                                      ▼
                    stores: contentHtml · toc · readingMinutes · contentUpdatedAt
```

```
prisma/schema.prisma
  Article, ArticleCategory, ArticleTag (implicit m2m)
  enum ArticleStatus  { DRAFT | PUBLISHED | ARCHIVED }
  enum ArticleKind    { ARTICLE | TUTORIAL | RESEARCH | GUIDE | NEWS }
  + generated tsvector column `searchDocument` (raw SQL, GIN)
  + partial indexes WHERE status = 'PUBLISHED'          (Forem pattern)

src/features/hub/            ← all reads, server-only, always `select`
  render-article-content.ts  THE write-time pipeline → { html, toc, readingMinutes }
  search-articles.ts         $queryRaw → ranked ids + total (the ONLY raw SQL)
  list-articles.ts           filters + pagination + count; delegates to search when q
  get-article.ts             published-by-slug (+ admin preview by id)
  get-related.ts             same category → shared tags → recent
  get-hub-surfaces.ts        featured strip + trending + category counts
  get-categories.ts

src/lib/validations/hub.ts   Zod for filters + admin create/update

src/app/hub/                 Server Components, ISR 3600
  page.tsx                   index: hero, featured, trending, filters, grid
  [slug]/page.tsx            reader
  [slug]/opengraph-image.tsx dynamic OG card
  category/[slug]/page.tsx
  tag/[slug]/page.tsx
src/app/sitemap.ts           NEW — all public routes + articles
src/app/robots.ts            NEW

src/components/hub/          ~13 components, only 4 of them "use client"
src/app/actions/
  hub-view-actions.ts        recordArticleViewAction  (public)
  hub-admin-actions.ts       create/update/publish/feature/delete (requireAdmin)
                             + renderPreviewAction (same pipeline → true WYSIWYG)
src/app/admin/articles/      list + new + [id]/edit
```

### New dependencies (deliberate — the only ones in this feature)

`unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-slug`,
`rehype-sanitize`, `rehype-stringify`, `unist-util-visit`.

All eight are small, and `react-markdown` (already installed) already pulls most of
them in transitively — they just have to become direct dependencies. This is a
considered exception to the "install nothing" rule, and it is the **only** one. In
exchange, `react-markdown` disappears from the public Hub bundle entirely.

## 7. Cross-phase guardrails (repeated in each plan — they are the failure modes)

- **`/hub/**` is PUBLIC.** Do **not** add `requireRole`, `requireAdmin`, or an `auth()`
  gate to any file under `src/app/hub/`. Do **not** add `/hub` to `protectedPaths` in
  `middleware.ts`. This is the single most likely Cursor error on this feature — the
  repo's own notes record it happening on `/login` and logout.
- **Do not touch `middleware.ts` or `auth.config.ts` at all.** Nothing in this feature
  needs them, and both are edge-bundle-critical.
- **Do not modify `src/components/ui/*`.** Missing primitives are added via
  `npx shadcn@latest add <name>`, never hand-edited.
- **Do not reuse `programMdComponents`** from `src/components/program/markdown-code.tsx`.
  It carries hard-coded Program colours, and the Hub does not render markdown at read
  time at all (D3b).
- **`contentHtml` is only ever written by `renderArticleContent()`.** Never accept HTML
  from a form field, never skip `rehype-sanitize`, and never render `content` (the raw
  markdown) with `dangerouslySetInnerHTML`. Authoring is admin-only, but an admin
  account compromise must not become stored XSS on a public page.
- **No `<Button asChild>` / `<Button render={<Link>}>`.** Use `buttonVariants()` on the
  `<Link>` — Base UI is strict about button semantics.
- **No `any`.** No `console.*` — use `lib/logger.ts`.
- **Every Prisma query uses `select`.** Never return a full `Article` row to a list view;
  `content` is a large column and must not appear in any list query's `select`.
- **Server → Client props must be serializable.** No functions, no Lucide icon
  components, no class instances across the boundary. Icons are chosen inside the
  client component from a string discriminant.
- Create **only** the files each plan lists. No helper/abstraction files invented for
  one-line logic.
- **Install only the eight packages listed in §6.** Nothing else — no syntax
  highlighter, no editor library, no analytics SDK, no font.
- If a build error contradicts an assumption in these plans, **trust the error**, gather
  the actual message and file, and report back — do not defend the plan.

## 8. Definition of done

- `/hub` renders on a 390px viewport with no horizontal scroll, in light **and** dark.
- Search finds an article by a phrase that appears **only in its body**, not its title.
- Search, category, tag, kind and sort compose in one URL and survive a refresh.
- An article page shows TOC, live reading progress, related articles, and passes
  Lighthouse SEO ≥ 95 with valid `Article` JSON-LD.
- The article route ships **no markdown parser to the browser** — verify in the build
  output, not by assumption.
- An admin can create → preview → publish → feature an article without a deploy, and it
  appears on `/hub` within one revalidation. The preview is byte-identical to the
  published page.
- `npx tsc --noEmit` and `npm run build` both clean.
- No file outside the phase plans' "Files to touch" lists was changed.

## 9. Post-ship follow-ups (explicitly out of scope)

Ordered by how strongly the research supports them:

1. **Semantic related-articles via pgvector** — Forem runs `semantic_embedding vector(768)`
   with an HNSW index. Neon supports pgvector, and `ANTHROPIC_API_KEY` is already on the
   roadmap for the B2B program. This would replace the three-tier heuristic in
   `get-related.ts` with real relatedness, in one file.
2. **Materialized `hotnessScore`** — Forem's answer to D8's known weakness. Needs a cron;
   `CRON_SECRET` is already planned.
3. **Multi-language tabbed code blocks** — GFG's signature feature (C++/Java/Python on
   one block). The AI-hub analogue is Python/TypeScript/cURL. A markdown convention plus
   a rehype plugin in the existing pipeline.
4. **Internal-link density** — GFG runs 30–40 internal links per article and it is the
   engine of their organic traffic. Related articles, tag pages and category pages give
   us the graph; an editor-side "link to another article" helper would raise it further.
5. Author accounts (`authorName` is a plain string in v1, not a `User` relation) ·
   comments · newsletter capture · series/multi-part articles · scheduled publishing ·
   image **upload** (v1 takes a URL, same as `resumeUrl`) · i18n.

## 10. Commit message

Roadmap only, no code:

`docs: add AI Knowledge Hub roadmap and phase plans`
