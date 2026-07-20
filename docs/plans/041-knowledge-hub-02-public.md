# 041 — Knowledge Hub, phase 2: public `/hub`

> Read `039-knowledge-hub-00-roadmap.md` first. **Requires 040 merged and migrated.**
>
> **Revised after research (039 §3).** The reader no longer renders markdown in the
> browser — 040 stores pre-rendered `contentHtml` and a `toc` array, so this phase
> renders HTML from a Server Component. If you are holding an earlier copy that
> describes `article-body.tsx` and `hub-markdown.tsx`, that draft is superseded.
> Until 042 ships there is no authoring UI — hand-create 6–8 articles across 3
> categories in `npx prisma studio` to develop against. An index with one article
> cannot reveal the layout bugs this phase is meant to get right.

## 1. Goal

Ship the reader-facing product: a `/hub` index with featured, trending, search and
filters, and an article page whose reading experience (TOC, progress, related, share)
is the reason someone bookmarks ABTalks instead of bouncing.

## 2. Current behavior

Nothing at `/hub`. The public-page shape to follow is `src/app/jobs/[id]/page.tsx`:
`AppHeader` with a serializable `headerUser` object, then a centered column. Note that
page calls `redirect("/login")` when there is no session — **the Hub must not**; it is
public, and `AppHeader` needs to render for logged-out visitors too (§5 step 1).

`src/app/layout.tsx` already wraps everything in `MainShell` (adds `pb-16 md:pb-0` for
the bottom nav), `AppFooter`, `Toaster` and `ThemeProvider`. Hub pages inherit all of
it and must not re-add a footer or their own theme wrapper.

There is no `sitemap.ts` and no `robots.ts` in `src/app/` today. Both are created here
and are **global**, so they must cover the existing public routes (`/`, `/login`,
`/claude-signup`, `/ai-workshop`, `/ai-cohort-register`, `/students/[id]`), not only
`/hub`.

## 3. Files to touch

**Routes**
- `[new] src/app/hub/page.tsx` — index (Server, ISR)
- `[new] src/app/hub/[slug]/page.tsx` — reader (Server, ISR + `generateStaticParams`)
- `[new] src/app/hub/[slug]/opengraph-image.tsx` — dynamic OG card
- `[new] src/app/hub/category/[slug]/page.tsx`
- `[new] src/app/hub/tag/[slug]/page.tsx`
- `[new] src/app/hub/loading.tsx` — skeleton for the index
- `[new] src/app/hub/not-found.tsx`
- `[new] src/app/sitemap.ts` — **global**
- `[new] src/app/robots.ts` — **global**

**Action**
- `[new] src/app/actions/hub-view-actions.ts` — `recordArticleViewAction` (public, unauthenticated)

**Components** (`src/components/hub/`)
- `[new] article-card.tsx` — Server. One component, `variant: "featured" | "default" | "compact"`
- `[new] article-grid.tsx` — Server
- `[new] hub-hero.tsx` — Server
- `[new] hub-filter-rail.tsx` — Server, `<Link>` chips
- `[new] hub-pagination.tsx` — Server, `<Link>` prev/next
- `[new] trending-rail.tsx` — Server
- `[new] hub-search-bar.tsx` — **Client**, debounced
- `[new] article-content.tsx` — **Server**, renders stored `contentHtml`
- `[new] code-copy-enhancer.tsx` — **Client**, delegated copy handler over that HTML
- `[new] article-toc.tsx` — **Client**, IntersectionObserver
- `[new] reading-progress.tsx` — **Client**, framer `useScroll`
- `[new] share-buttons.tsx` — **Client**
- `[new] view-tracker.tsx` — **Client**, fires the view action once
- `[new] article-jsonld.tsx` — Server
- `[new] article-meta.tsx` — Server

**Nav + styles**
- `[edit] src/components/shared/app-header.tsx` — add one `/hub` link
- `[edit] src/components/shared/app-footer.tsx` — add one `/hub` link
- `[edit] src/app/globals.css` — append one `.hub-prose { ... }` block (step 6). Append only; do not touch the existing token blocks.

- `[new] docs/plans/041-knowledge-hub-02-public.md` (this file)

**Explicitly not touched:** `middleware.ts`, `auth.config.ts`, `auth.ts`,
`next.config.ts`, `prisma/schema.prisma`, `src/components/ui/*`,
`src/components/program/*`.

## 4. Server vs Client

| Component | Boundary | Why |
|---|---|---|
| all 5 route `page.tsx` | **Server** | data fetching, metadata, zero client JS for filters |
| `article-card`, `article-grid`, `hub-hero`, `hub-filter-rail`, `hub-pagination`, `trending-rail`, `article-meta`, `article-jsonld`, **`article-content`** | **Server** | pure presentation over serializable data; filters are `<Link>`s (D6) |
| `hub-search-bar` | **Client** | debounce + `router.replace` |
| `code-copy-enhancer` | **Client** | `navigator.clipboard`, attached by delegation |
| `article-toc` | **Client** | IntersectionObserver scroll-spy |
| `reading-progress` | **Client** | `useScroll` |
| `share-buttons` | **Client** | `navigator.share` / clipboard |
| `view-tracker` | **Client** | `useEffect` → Server Action |

**Boundary rules for this phase:**

- Every prop crossing Server → Client is a string, number, boolean, or a plain
  array/object of those. **No `Date` objects** — format to a string in the Server
  Component with `formatDateIST` from `lib/date-utils.ts` (display only; the Hub does
  no IST day-boundary maths) and pass the string. **No Lucide icon components** — pass a
  string discriminant and pick the icon inside the client component.
- `article-toc` receives the `toc` array **read from the database** — 040's pipeline
  extracted it at write time. It does not parse anything.
- `article-content` receives `contentHtml` **read from the database** and renders it.
  There is no markdown parser anywhere in this phase, on either side of the boundary.

## 5. Steps

### Step 1 — the public-header shape

Every Hub route needs `AppHeader`, and every Hub route may have **no session**. Do this
in each page, and do **not** redirect:

```ts
const session = await auth();          // may be null — that is normal here
const headerUser = session?.user
  ? { name: ..., email: ..., image: ..., role: ..., isAdmin: ... }
  : null;
```

If `AppHeader` currently requires a non-null `user`, widen its prop to
`user: HeaderUser | null` and render the logged-out state (theme toggle + a "Sign in"
`<Link>` styled with `buttonVariants({ variant: "ghost", size: "sm" })`). That widening
is the **only** change permitted to `app-header.tsx` beyond adding the `/hub` nav link.

### Step 2 — `/hub` index (`src/app/hub/page.tsx`)

```ts
export const revalidate = 3600;
export const metadata: Metadata = { /* title, description, openGraph, canonical */ };
```

`searchParams` is a `Promise` in Next 16 — `await` it, then
`parseHubFilters()` from `@/lib/validations/hub`.

Then, in parallel — `Promise.all([getHubSurfaces(), listArticles(filters)])`.

Layout, top to bottom:

1. **`hub-hero`** — eyebrow "ABTalks Knowledge Hub", an `h1`, one line of positioning
   copy, `hub-search-bar`. Constrained `max-w-2xl`, generous vertical rhythm
   (`py-14 sm:py-20`). This is the Medium/Vercel-docs register: a lot of whitespace, one
   clear action, no marketing gradient soup.
2. **Featured strip** — only when `filters` are at their defaults *and* `featured` is
   non-empty. `featured[0]` renders `variant="featured"` (16:9 cover, larger title,
   excerpt, spanning both columns on `lg`); `featured[1..2]` render `variant="default"`.
   Hidden entirely on a filtered view — a "featured" rail that ignores the active
   filter is noise.
3. **`hub-filter-rail`** — horizontally scrollable category chips
   (`overflow-x-auto` + `[scrollbar-width:none]`), an "All" chip, and the kind filter.
   Every chip is a `<Link>` to the same pathname with one search param toggled; the
   active chip gets `aria-current="page"`. Preserve all other params when building each
   href — a category click must not silently drop the user's `q`.
4. **Sort** — two `<Link>`s ("Latest" / "Most read"), not a `<select>`. Keeps the page
   JS-free and crawlable.
5. **`article-grid`** — `grid gap-6 sm:grid-cols-2 lg:grid-cols-3`. Above it, a result
   count line (`"24 articles"` / `"3 results for “rag”"`).
6. **Empty state** — inline in the grid, not a new file: an icon, "No articles match
   that yet.", and a `<Link>` back to `/hub` clearing filters.
7. **`hub-pagination`** — prev/next `<Link>`s + "Page 2 of 5", `rel="prev"`/`rel="next"`,
   `scroll` left at the default so the reader lands back at the top.
8. **`trending-rail`** — right column on `lg` (sticky, `top-20`), stacked below the grid
   on mobile. Numbered 01–05, `variant="compact"` cards.

### Step 3 — `article-card.tsx`

One Server Component, three variants, driven by a `variant` prop:

- `featured` — cover on top (`aspect-[16/9]`), category chip, `h2` title
  (`font-display text-2xl`), excerpt clamped to 2 lines, meta row.
- `default` — same, `aspect-[16/10]`, `text-lg` title.
- `compact` — no cover, title clamped to 2 lines, meta row only. Used by trending and
  related.

Shared: the whole card is one `<Link>` (no nested interactive elements — a card with a
link inside a link is an a11y failure and a hydration warning). Card chrome follows the
existing system: `rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md`.
Category chip uses `category.accentColor` as an inline `style` for `color` +
`backgroundColor` at low alpha — Tailwind cannot generate a class from a runtime hex, so
do not try to interpolate one.

**Covers use a plain `<img>`, not `next/image`:**

```tsx
<div className="aspect-[16/9] overflow-hidden rounded-t-xl bg-muted">
  <img src={coverImageUrl} alt={coverImageAlt ?? ""} loading="lazy"
       decoding="async" className="h-full w-full object-cover" />
</div>
```

Rationale: covers are arbitrary admin-entered remote URLs, so `next/image` would need a
wildcard `remotePatterns` entry **and** it would spend the Vercel free-tier
transformation quota on every one. The `aspect-*` wrapper prevents CLS, which is the
actual reason `next/image` is usually recommended here. When covers later move to Vercel
Blob, switch to `next/image` in this one file. Render the `bg-muted` block with the
category initial when `coverImageUrl` is null — never a broken image.

### Step 4 — `hub-search-bar.tsx` (Client)

`useState` for the input (seeded from the `q` prop), 300ms `setTimeout` debounce, then
`router.replace(\`${pathname}?${params}\`, { scroll: false })` with `page` reset to 1.
Wrap the navigation in `useTransition` and dim the grid via the pending flag.

- Clear the timeout in the effect cleanup.
- `<form onSubmit={e => e.preventDefault()}>` with `role="search"` so Enter doesn't do a
  full page post.
- `type="search"`, `aria-label="Search articles"`, a visible label for screen readers
  (`sr-only`), a clear (✕) button when non-empty.
- Sync from the `q` prop when it changes externally (back button) — but do **not** fight
  the user's typing; only re-sync when the prop differs from the last value this
  component pushed.

### Step 5 — `/hub/[slug]` reader

```ts
export const revalidate = 3600;
export async function generateStaticParams() {
  // 50 most recent PUBLISHED slugs. Not all of them — this must stay a bounded
  // build step as the article count grows. The rest render on demand and cache.
}
export async function generateMetadata({ params }): Promise<Metadata> { ... }
```

`generateMetadata`: `title: seoTitle ?? title`, `description: seoDescription ?? excerpt`,
`openGraph: { type: "article", publishedTime, modifiedTime: contentUpdatedAt, authors: [authorName] }`,
`twitter: { card: "summary_large_image" }`.

`alternates.canonical` is **`article.canonicalUrl ?? \`${APP_URL}/hub/${slug}\``** — when
a piece was first published on Medium or dev.to, pointing the canonical at the original
is what stops the two versions competing in search. That column exists for exactly this.

Call `notFound()` from the **page** when the article is missing; `generateMetadata`
returns a plain `{ title: "Not found" }` rather than throwing.

Page body:

1. `<reading-progress />` — fixed 2px bar under the header, `z-40`.
2. Breadcrumb: `Hub / <Category> / <title>` — first two are `<Link>`s.
3. Header block: category chip, `h1` (`font-display text-3xl sm:text-4xl lg:text-5xl
   tracking-tight`), excerpt as a `text-lg text-muted-foreground` standfirst,
   `article-meta` (avatar, author name + role, formatted date, `· 7 min read`),
   `share-buttons`.

   **`article-meta` shows "Last updated <date>" when `contentUpdatedAt` is set and is
   more than a day after `publishedAt`; otherwise it shows the publish date.** This is
   lifted straight from GeeksforGeeks, which puts "Last Updated : 16 Feb, 2026" directly
   under the title on every article (039 §3) — it is a strong freshness signal for both
   readers and crawlers, and it is the reason revisiting old articles pays off. Use
   `contentUpdatedAt`, never `updatedAt` (D10).
4. Cover image, if present, `aspect-[21/9]`, `rounded-xl`.
5. Two-column on `lg`: `<article>` body (`max-w-[68ch]`) + sticky `article-toc` rail
   (`hidden lg:block sticky top-24`). On mobile the TOC is a `<details>` element
   labelled "Contents", collapsed by default — no dialog, no portal.
6. Tag chips → `<Link href={\`/hub/tag/${slug}\`}>`.
7. `<related-articles />` — `getRelatedArticles(...)`, 3 `variant="compact"` cards.
8. A single CTA card at the end linking to `/` — "Ready to build this for real? Join the
   60-day challenge." One CTA, not a stack.
9. `<article-jsonld />` and `<view-tracker articleSlug={slug} />`.

**`max-w-[68ch]` on the prose column is not decorative** — line length is the single
biggest lever on reading comfort and it is what makes this feel like Medium rather than
a docs dump. Do not widen it to fill the grid.

### Step 6 — `article-content.tsx` (Server) + `code-copy-enhancer.tsx` (Client)

This is where the D3b payoff lands: the article body ships as HTML with **no markdown
parser in the client bundle at all**.

`article-content.tsx` is a **Server Component**:

```tsx
export function ArticleContent({ html }: { html: string }) {
  return (
    <>
      <div
        id="article-content"
        className="hub-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeCopyEnhancer targetId="article-content" />
    </>
  );
}
```

`dangerouslySetInnerHTML` is safe **here specifically** because 040's pipeline ran
`rehype-sanitize` before storing, and `contentHtml` is only ever written by that
pipeline (039 §7). Do not relax either half of that.

**Styling.** Since the HTML is opaque to Tailwind's class scanner, style it with a
`.hub-prose` block in `globals.css` using descendant selectors — this is the one place
in the codebase where that is the correct approach rather than a smell:

- `h2` / `h3` → `font-display`, tight tracking, generous `margin-top`, and
  **`scroll-margin-top: 6rem`** (required, or TOC jumps land under the sticky header).
- body copy at `1.0625rem` / `line-height: 1.75`, paragraph spacing ~`1.25em`.
- `pre` → `bg-muted`, `overflow-x: auto`, `rounded-lg`, `padding`, and
  `position: relative` so the copy button can anchor to it.
- inline `code` → `bg-muted`, small horizontal padding, `border-radius: 4px`.
- `a` → `text-primary`, underline with `text-underline-offset`.
- `table` → wrapped in `overflow-x: auto`; `img` → `max-width: 100%`, `border-radius`.
- `blockquote`, `ul`, `ol`, `hr` → the same typographic scale.

Use theme tokens (`hsl(var(--muted))` etc.) throughout so light and dark both work.

`code-copy-enhancer.tsx` is `"use client"`, renders `null`, and in one `useEffect`:
queries `#article-content pre`, appends a small absolutely-positioned copy button to
each, and copies `pre.innerText` on click with a 1.5s "Copied" state and a `sonner`
toast. One delegated listener on the container, removed in the effect cleanup. ~40
lines, and it replaces what would otherwise be `react-markdown` plus a component map on
every reader's device.

**Do not import `programMdComponents`** or anything else from `src/components/program/*` —
it hard-codes Program hexes (`#E8E6E3`, `#968BEC`) that are wrong in light mode.

No syntax highlighter in this phase. `pre` gets `bg-muted` + `overflow-x-auto` and that
is enough. When you do want highlighting, the right move is `rehype-pretty-code` **in
040's write-time pipeline**, which costs the browser nothing — not a client-side
highlighter.

### Step 7 — `article-toc.tsx` (Client)

Props: `{ entries: TocEntry[] }` — read straight off `article.toc`, which 040 stored at
write time. **Do not parse anything here.** Renders `<nav aria-label="Table of contents">`
with `<a href={"#" + id}>`, H3s indented one step. The ids match because `rehype-slug`
produced both these entries and the ids in `contentHtml` in a single pass.

A TOC is the most visible thing GeeksforGeeks gets wrong — their long-form DSA articles
have none, and finding anything means scrolling blind. Vercel Docs is the model here.

Scroll-spy: one `IntersectionObserver` over `entries.map(e => document.getElementById(e.id))`
with `rootMargin: "-88px 0px -70% 0px"`, tracking the topmost intersecting id. Active link
gets `aria-current="location"` and a `text-foreground` + left-border treatment; inactive
is `text-muted-foreground`.

- Disconnect the observer in the effect cleanup.
- Bail out and render nothing when `entries.length < 2` — a one-item TOC is clutter.
- Let native anchor scrolling do the work; `scroll-mt-24` on the headings handles the
  offset. Do **not** hand-roll `scrollIntoView` with a smooth-scroll animation — it
  breaks `prefers-reduced-motion` and the back button.

### Step 8 — `reading-progress.tsx` (Client)

`useScroll({ target: ref, offset: ["start start", "end end"] })` from `framer-motion`
(already a dependency), passed through `useSpring` for damping, bound to a
`<motion.div style={{ scaleX }} className="origin-left h-0.5 bg-primary" />`.

Gate the spring on `useSafeReducedMotion()` from `@/lib/motion` — when reduced motion is
on, bind `scrollYProgress` directly with no spring. That hook is SSR-safe by design;
use it rather than reading `matchMedia` yourself.

Add `aria-hidden="true"` — it is decorative, and a screen reader announcing a
continuously-changing value is hostile.

### Step 9 — `view-tracker.tsx` + `hub-view-actions.ts`

`view-tracker` is a client component rendering `null`:

```ts
useEffect(() => {
  const key = `hub:viewed:${slug}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  void recordArticleViewAction({ slug });   // fire and forget
}, [slug]);
```

The `sessionStorage` guard makes a refresh idempotent within a session. Wrap the
`sessionStorage` access in `try/catch` — it throws in Safari private mode.

`recordArticleViewAction` in `src/app/actions/hub-view-actions.ts`:

- `"use server"`, **public — no `requireRole`, no `requireAdmin`, no session check.**
  Mark it with an explicit comment: `// PUBLIC: /hub is unauthenticated.`
- Zod-parse `{ slug: z.string().max(140) }`; on failure return
  `{ ok: false, message: "Invalid input" }`.
- `prisma.article.updateMany({ where: { slug, status: "PUBLISHED" }, data: { viewCount: { increment: 1 } } })`.
  `updateMany` (not `update`) so an unknown slug is a no-op instead of a throw.
- Return the result envelope. Catch and `logger.error`, never `console.error`.
- **Do not `revalidatePath` here.** It fires on every read; revalidating would defeat
  the ISR cache the whole design depends on. The trending rail picks the new count up on
  its own hourly revalidation.

### Step 10 — `/hub/category/[slug]` and `/hub/tag/[slug]`

Thin wrappers: resolve the slug (404 if unknown), then render the **same** filter rail +
grid + pagination as the index with that facet pinned. Own `generateMetadata`
(`"AI Careers — ABTalks Knowledge Hub"`) and an `h1` naming the facet. These exist for
SEO and shareability — `?category=` alone is a weaker crawl target.

To avoid triplicating the grid section, extract it into `article-grid.tsx` taking
`{ articles, total, page, totalPages, basePath, filters }` and have all three pages
render it. That is one shared component, not a new abstraction layer.

### Step 11 — `opengraph-image.tsx`

`ImageResponse` from `next/og` (built into Next, no install), `size = { width: 1200,
height: 630 }`, `contentType = "image/png"`, `export const runtime = "nodejs"`.

Card: dark background, ABTalks wordmark, category label, the article title at
~60px `font-display`, author + reading time. Fetch only the fields needed — do **not**
pull `content` into an OG route. If the article is missing, return a generic Hub card
rather than throwing.

### Step 12 — `sitemap.ts` and `robots.ts` (global)

`src/app/sitemap.ts` — `MetadataRoute.Sitemap`:

- Static entries for the existing public routes: `/`, `/login`, `/claude-signup`,
  `/ai-workshop`, `/ai-cohort-register`, `/hub`.
- All `PUBLISHED` articles: `/hub/[slug]` with
  **`lastModified: contentUpdatedAt ?? publishedAt`** — **not `updatedAt`**, which every
  page view bumps (D10). Getting this wrong tells Google the whole Hub changes hourly,
  which burns the freshness signal you are trying to build. `changeFrequency: "monthly"`,
  `priority: 0.7`.
- All categories and tags that have ≥1 published article.
- **Do not** list `/dashboard`, `/admin/*`, `/challenge/*`, `/profile`, `/quiz/*`,
  `/program/*`, `/mission/*`, `/talent`, `/jobs` — every one is behind `middleware.ts`
  and listing them tells crawlers to hammer a redirect.

`src/app/robots.ts` — allow `/`, disallow `/admin/`, `/api/`, `/dashboard`, `/profile`,
`/challenge`, `/quiz`, `/program`, `/mission`, `/talent`, `/jobs`, `/register`; point
`sitemap` at `${NEXT_PUBLIC_APP_URL}/sitemap.xml`.

Both read `process.env.NEXT_PUBLIC_APP_URL`. Fall back to
`"https://abtalksapp.vercel.app"` if unset so a missing env var cannot emit relative
URLs into a sitemap.

### Step 13 — navigation

`app-header.tsx`: one nav `<Link href="/hub">Hub</Link>` alongside the existing items,
matching their styling. `app-footer.tsx`: one link in the existing list. That is the
whole nav change — **do not** add `/hub` to `bottom-nav.tsx` (it is the authenticated
student's task bar) and do not restructure either component.

### Step 14 — responsive + a11y pass

- Test at **390px** (the documented target), 768px, 1280px. No horizontal scroll at any
  width — the filter rail scrolls *within itself*, the page never does.
- Test light **and** dark. Every colour comes from a theme token except the category
  accent hex.
- Headings are a single ordered outline: one `h1` per page, card titles are `h2`/`h3`.
- Focus-visible rings on every link, chip and button (`focus-visible:ring-2
  focus-visible:ring-ring`). Verify the whole index is keyboard-reachable in order.
- Tap targets ≥ 44px on mobile — chips need real `py`, not just `text-xs`.
- Category chips must not rely on colour alone to convey the active filter; the active
  chip also gets a filled background and `aria-current`.

## 6. Guardrails for Cursor (DO NOT)

- **`/hub/**` IS PUBLIC.** No `requireRole`, no `requireAdmin`, no `redirect("/login")`
  in any file under `src/app/hub/`, and **no `/hub` entry in `middleware.ts`'s
  `protectedPaths`**. `recordArticleViewAction` is public too. A logged-out visitor in
  an incognito window must reach every Hub page — that is the acceptance test.
- **Do not modify `middleware.ts`, `auth.config.ts`, `auth.ts`, `next.config.ts`, or
  `prisma/schema.prisma`.** If a cover image seems to need `remotePatterns`, re-read
  step 3 — plain `<img>` is the decision.
- **Do not import `programMdComponents`** or anything else from
  `src/components/program/*`.
- **Do not add `react-markdown`, `marked`, or any markdown parser to a Hub component.**
  The body arrives as HTML from the database (D3b). If you find yourself importing a
  parser in this phase, the wiring to 040 is wrong — fix that instead.
- **Do not render `article.content` with `dangerouslySetInnerHTML`.** `contentHtml` is
  the sanitized one; `content` is raw markdown and 040's `getPublishedArticle` does not
  even select it.
- **Do not use `updatedAt`** for the "last updated" line, `modifiedTime`, or sitemap
  `lastModified`. It is `contentUpdatedAt` in all three places (D10).
- **Do not modify `src/components/ui/*`.** Need a primitive that isn't there? Add it
  with `npx shadcn@latest add <name>` and say so.
- **No `<Button asChild>` and no `<Button render={<Link>}>`.** `buttonVariants()` on the
  `<Link>`, always.
- **Do not pass `Date` objects or icon components across the Server → Client boundary.**
  Format dates to strings server-side; pass string discriminants for icons.
- **Do not make the index page a Client Component** to simplify filter state. Filters
  are URL params read on the server (039 D6). Only `hub-search-bar` is client.
- **Do not slugify headings anywhere in this phase.** `rehype-slug` already assigned the
  ids at write time and the stored `toc` already carries them. Any slugify call here is
  a second implementation that must agree byte-for-byte with the first — which is the
  exact bug D3b was adopted to eliminate.
- **Do not call `revalidatePath` from `recordArticleViewAction`.**
- **Do not add a syntax-highlighting library**, an analytics script, a font, or any new
  dependency. Everything here uses what is already installed.
- Do not create files beyond §3. In particular: no `hub-utils.ts`, no `hub-config.ts`,
  no `use-debounce.ts` — the debounce is six lines inside `hub-search-bar.tsx`.
- No `any`. No `console.*` — `lib/logger.ts`.

## 7. DB safety

N/A — no schema change. One new column *write* (`viewCount` increment) against the
tables created in 040.

## 8. Verification

Manual, in this order:

1. **Logged out, incognito:** `/hub` loads; click a category chip; type a query; click
   an article; the whole path works with no redirect to `/login`. This is the
   highest-value check — it catches the failure mode most likely to occur.
2. `/hub?q=rag&category=tutorials&sort=popular&page=2` — refresh, then use the browser
   back button. Filters survive both.
3. Junk params: `/hub?sort=lol&page=-3&kind=BANANA` renders defaults, does not 500.
4. **JS disabled:** category chips, sort links, pagination and article links all still
   work (only the search box goes dead). Confirms D6 was honoured.
5. Article page: TOC entries match the H2/H3s; clicking one lands with the heading
   clear of the sticky header; the active TOC item updates while scrolling; the progress
   bar reaches 100% at the end; related articles render; the code-copy button copies.
   Tables, task lists and inline code all render (confirms GFM survived the pipeline).
6. **Bundle check — this is the D3b payoff, verify it rather than assuming it.** In the
   production build output, the First Load JS for `/hub/[slug]` should be close to the
   app baseline. Then open DevTools → Sources on a published article and confirm no
   `react-markdown` / `unified` / `micromark` chunk was fetched. If one was, a client
   component is importing a parser.
7. Search a phrase that appears **only in an article's body** — it is found. Then search
   a partial word (`"transfo"`) — it matches "transformer". Then paste
   `foo & bar | (baz)` into the box — no error, no 500.
8. An article with `canonicalUrl` set emits that URL in `<link rel="canonical">`, not the
   `/hub/...` one.
9. Publish an article, then load it 5 times → the "Last updated" line does **not** change
   and `contentUpdatedAt` in Prisma Studio is untouched. This is the D10 regression test;
   if the date moves, something is reading `updatedAt`.
10. `prefers-reduced-motion: reduce` (macOS System Settings → Accessibility): the
   progress bar still tracks, without spring easing.
11. 390px viewport, light and dark: no horizontal scroll anywhere; the mobile TOC
   `<details>` opens; tap targets are comfortable.
12. Reload an article twice in one tab → `viewCount` increments **once** (check Prisma
   Studio). New incognito tab → increments again.
13. `curl localhost:3000/sitemap.xml` and `/robots.txt` — valid XML/text, articles
   present, no `/admin` or `/dashboard` entries.
14. View source on an article: one `application/ld+json` block, valid `Article` schema
    (paste into Google's Rich Results Test). `og:image` resolves to the OG route.
15. Lighthouse on an article page (mobile, production build): SEO ≥ 95,
    Accessibility ≥ 95, CLS < 0.1.
16. `npx tsc --noEmit` and `npm run build` — both clean, and the build log shows
    `/hub/[slug]` as ISR, not `ƒ (Dynamic)`.
17. `git status` — changed files match §3 exactly. Two edited files
    (`app-header.tsx`, `app-footer.tsx`) and nothing else pre-existing.

## 9. Commit message

`Add public AI Knowledge Hub at /hub`
