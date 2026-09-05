# Plan 112 — Structured shipping address on marketplace redemption

> **Status: IMPLEMENTED in the working tree on `ab-dev`, migration NOT applied.**
> This plan was written *after* the code, at the owner's request, to record what
> happened. Everything in §4–§7 is already on disk. The one outstanding action is
> §8 (run the migration) — until it runs, **every redemption fails**, because the
> client writes columns the database does not have yet.
> Baseline commit before the change: `e7026ec`.

## 1. Goal

Replace the single free-text address textarea in the marketplace redeem dialog
with structured fields — recipient name, address line 1, address line 2, city,
state, pincode, country — so redemptions arrive as something a courier label can
be printed from instead of a paragraph a human has to re-key. State and city are
dependent dropdowns covering all of India, and the dialog states plainly that we
ship only within India.

## 2. Current behavior (before this change)

- `Redemption.shippingAddress` is one `String` column. `redeemItemSchema`
  validated it as `z.string().min(20).max(1000)` — length only, no structure.
- `redeem-dialog.tsx` collected it in a `<Textarea>` whose placeholder read
  "Full postal address — name, street, city, state, pincode, country", i.e. the
  structure existed only as a hint nobody was obliged to follow.
- The client sent the blob; `redeemItem` wrote `input.shippingAddress.trim()`
  straight to the column.
- Admin (`redemptions-table.tsx:217`, `:260`) renders that column with
  `whitespace-pre-wrap` inside a `max-w-[200px]` cell.
- There was no recipient name field at all — admin inferred the addressee from
  `studentName` on the row.
- No state/city reference data existed anywhere in the repo. The nearest prior
  art is the college picker: `src/components/shared/college-combobox.tsx`
  (Base UI `Autocomplete`, `mode="none"`, `filter={null}`, API-backed).
- `Redemption` is **not** a Plan 078 table — it has no repository and
  `redeem-item.ts` already talked to `writeClient()` directly. Only the points
  leg goes through `@/repositories/points`. That split is unchanged here.

## 3. Decisions locked (do not re-litigate)

These were put to the owner as explicit questions before any code was written.

| Question | Decision |
| --- | --- |
| The brief said "India and Dubai" in the country dropdown, but Dubai is a city in the UAE *and* the same brief says we only deliver in India | **India only in the dropdown.** Dubai is not an option. The "anywhere else, email us" notice covers it |
| How exhaustive should the city list be, and can a student type a city that isn't in it? | **Full list + free-text fallback.** All 36 states/UTs, district HQs and towns; the city field still accepts anything typed |
| The old placeholder asked for a name; structured fields as listed have none | **Add "Recipient name"**, required, prefilled from the candidate profile |
| Support address for non-India delivery | `team@abtalks.in`, rendered as a live `mailto:` |
| What happens to `shippingAddress`? | **Kept, still `NOT NULL`.** New redemptions compose it server-side from the parts. Legacy rows keep rendering; admin needs no change |
| Where is the composed block built? | **Server only.** Never accepted from the client, so it cannot disagree with the columns beside it |
| Are the new columns nullable? | **Yes, and with no `DEFAULT`.** A default would backfill a country onto legacy rows we never collected one for |

## 4. Files to touch

| File | | Note |
| --- | --- | --- |
| `src/data/india-locations.ts` | `[new]` | 36 states/UTs, 4,075 cities; `INDIA_STATE_NAMES`, `INDIA_CITY_OPTIONS`, `citiesForState`, `statesForCity`, `isKnownIndianState` |
| `src/components/marketplace/city-combobox.tsx` | `[new]` | Base UI `Autocomplete` over the dataset; ≤50 suggestions, prefix matches first |
| `prisma/migrations/20260905120000_redemption_structured_address/migration.sql` | `[new]` | 7 additive nullable `TEXT` columns |
| `prisma/schema.prisma` | `[edit]` | New fields on `Redemption` + doc comments |
| `src/lib/validations/marketplace.ts` | `[edit]` | Structured `redeemItemSchema`, `SHIPPING_COUNTRY`, `SHIPPING_SUPPORT_EMAIL`, `composeShippingAddress`, `RedeemItemInput` |
| `src/app/actions/marketplace-actions.ts` | `[edit]` | Read the new form fields instead of `shippingAddress` |
| `src/features/marketplace/redeem-item.ts` | `[edit]` | Take `RedeemItemInput`; write the columns and the composed block |
| `src/components/marketplace/redeem-dialog.tsx` | `[edit]` | The form, the cascade handlers, the India-only notice |
| `src/app/marketplace/page.tsx` | `[edit]` | Pass `defaultName` |
| `src/components/marketplace/product-grid.tsx` | `[edit]` | Thread `defaultName` |
| `src/components/marketplace/product-card.tsx` | `[edit]` | Thread `defaultName` |
| `src/components/marketplace/redeem-button.tsx` | `[edit]` | Thread `defaultName` |

Deliberately **not** touched: `src/features/admin/get-redemptions.ts` and
`src/components/admin/redemptions-table.tsx`. Because `shippingAddress` is still
written and now holds a tidy multi-line block, admin keeps working unchanged.

## 5. Server vs Client

| Component | | Note |
| --- | --- | --- |
| `src/app/marketplace/page.tsx` | **Server** | Reads session + `getCandidateProfile`; passes plain strings down |
| `product-grid.tsx` | **Server** | Pure pass-through |
| `product-card.tsx` | **Server** | Pure pass-through |
| `redeem-button.tsx` | **Client** | Owns dialog open state |
| `redeem-dialog.tsx` | **Client** | Owns all seven field states + cascade |
| `city-combobox.tsx` | **Client** | Base UI `Autocomplete` |
| `src/data/india-locations.ts` | Isomorphic | Imported by the client dialog **and** by the Zod schema on the server |

**Server → Client boundary:** the only new prop is `defaultName: string`, a
plain string, crossing `page.tsx → ProductGrid → ProductCard → RedeemButton →
RedeemDialog`. No functions, icons or class instances cross the boundary.

`src/lib/validations/marketplace.ts` is now imported by a Client Component (for
`SHIPPING_COUNTRY` / `SHIPPING_SUPPORT_EMAIL`). It is a plain module with no
`server-only` marker and no Prisma import, so this is safe — but it does pull the
city dataset into the client bundle, which is intended (the dropdown needs it).
It is **not** in the middleware/edge import path.

## 6. Steps

1. **`src/data/india-locations.ts`** — export `IndiaStateLocations`, then
   `INDIA_LOCATIONS` as 36 `{ state, cities }` entries. Derive
   `INDIA_STATE_NAMES`, `INDIA_CITY_OPTIONS` (flat `{ city, state }`), and a
   private lowercased city → states map. Export `isKnownIndianState`,
   `citiesForState`, and `statesForCity` (returns an **array**, because 89 names
   are shared across states).
   - City names must be unique *within* a state — a duplicate string collides as
     a React key. Where one state genuinely has two, disambiguate the second in
     parentheses (Gujarat: `Mandvi` in Kutch vs `Mandvi (Surat)`).
2. **`prisma/schema.prisma`** — add `recipientName`, `addressLine1`,
   `addressLine2`, `city`, `state`, `pincode`, `country`, all `String?`, to
   `Redemption`. Leave `shippingAddress String` and `recipientPhone String`
   exactly as they are. Document *why* they are nullable (legacy rows).
3. **`prisma/migrations/20260905120000_redemption_structured_address/migration.sql`**
   — seven `ALTER TABLE "Redemption" ADD COLUMN … TEXT;` statements. No
   `DEFAULT`, no `NOT NULL`, no index.
4. **`src/lib/validations/marketplace.ts`** — export `SHIPPING_COUNTRY = "India"`
   and `SHIPPING_SUPPORT_EMAIL = "team@abtalks.in"`. Rewrite `redeemItemSchema`:
   drop `shippingAddress`; add the seven fields. `state` is `.refine(isKnownIndianState)`;
   `city` stays free text; `pincode` is `/^[1-9][0-9]{5}$/`; `country` is
   `.refine(v => v === SHIPPING_COUNTRY)` with the support-email message;
   `addressLine2` is `.optional().transform(v => v?.length ? v : null)`.
   Export `RedeemItemInput` and `composeShippingAddress`.
5. **`src/app/actions/marketplace-actions.ts`** — read the seven new
   `formData` keys. `addressLine2` uses `?? undefined` so an absent field hits
   `.optional()` rather than failing on `null`.
6. **`src/features/marketplace/redeem-item.ts`** — signature becomes
   `RedeemItemInput & { userId: string }`. In the `create`, write each column
   plus `shippingAddress: composeShippingAddress(input)`. Zod has already
   trimmed; do not re-trim.
7. **`src/components/marketplace/city-combobox.tsx`** — copy the
   `college-combobox.tsx` shape (`mode="none"`, `filter={null}`, the
   `onItemHighlighted` ref trick, because Base UI's `item-press` does not carry
   the item). Pool is `citiesForState(state)` when a state is set, else
   `INDIA_CITY_OPTIONS`. Show nothing until 2 characters when no state is set;
   cap at 50; prefix matches before substring matches. Show the state as a
   secondary label **only** when searching all of India.
8. **`src/components/marketplace/redeem-dialog.tsx`** — seven `useState`s. Two
   handlers:
   - `handleStateChange(next)`: set state; clear the city if it is not in
     `citiesForState(next)`.
   - `handleCityChange(city, impliedState)`: if picked from the list, set both.
     If typed, only infer the state when `statesForCity(city).length === 1`
     **and** no state is chosen yet.
   Render the India-only notice above the form with a `mailto:` link. Pincode
   input filters to digits on change (`replace(/\D/g, "").slice(0, 6)`).
   Country is a `Select` with a single `India` item.
9. **Prop chain** — add `defaultName: string` to `ProductGrid`, `ProductCard`,
   `RedeemButton`, `RedeemDialog`; source it in `page.tsx` as
   `candidate?.fullName?.trim() || session.user.name || ""`.

## 7. Guardrails for Cursor (DO NOT)

- **DO NOT** drop, rename or make `shippingAddress` nullable. Redemptions that
  predate this change have it and nothing else; it is the only field guaranteed
  populated and it is what admin and the courier label read.
- **DO NOT** add `@default("India")` to the new `country` column. In Postgres,
  `ADD COLUMN … DEFAULT` backfills existing rows — it would stamp a country onto
  legacy redemptions we never collected one for.
- **DO NOT** accept the composed address block from the client. It is built in
  `redeemItem` from validated parts, on purpose.
- **DO NOT** validate `city` against the list. No city list is complete; a
  student in an unlisted town must still be able to redeem. Only `state` — which
  comes from a closed dropdown — is list-checked.
- **DO NOT** auto-fill the state from a typed city when more than one state
  claims the name (Aurangabad, Kota, Bishnupur, Ramnagar, and 85 others), or when
  the student has already chosen a state.
- **DO NOT** turn the city field into a `Select`. It has 4,075 options and must
  accept free text.
- **DO NOT** add Dubai, the UAE, or any second country to the dropdown. That was
  asked and answered — India only.
- **DO NOT** use `type="number"` for the pincode; it permits `e`, `+` and `-` and
  adds a spinner. Filter the value on the way in instead.
- **DO NOT** style the new fields with bare utility classes and assume they win.
  The dialog portals out of the page's `dark` wrapper, and the shadcn primitives
  carry their own `dark:` and `data-[size=…]:` classes that outrank an unprefixed
  class — see the sizing note below.
- **DO NOT** touch `src/repositories/`. `Redemption` is not a Plan 078 table and
  gains no repository here.
- **DO NOT** add an index on any new column. Nothing queries by them.

### Two styling traps worth knowing

`cn()` is `twMerge(clsx(...))`. tailwind-merge only dedupes classes sharing the
same variant *and* property group:

- `SelectTrigger` ships `data-[size=default]:h-8`. A bare `h-10` does **not**
  dedupe it, and the variant-scoped class wins on specificity — the dropdowns
  render 8px shorter than the inputs beside them. Fix: pass
  `data-[size=default]:h-10`.
- `Input` ships a `dark:` background. A bare `bg-[#050C1D]` does not override it.
  Fix: repeat it as `dark:bg-[#050C1D]` — which is exactly why the *original*
  dialog already had that duplicate on its `Input` and `Textarea`.

## 8. DB safety — OUTSTANDING, run this before deploying

The migration is written but **not applied**. Production is Neon.

1. Commit the working tree first. Baseline before this change: `e7026ec`
   (branch `ab-dev`).
2. Take a **Neon branch snapshot** of production and note its name/commit here.
3. Apply:

   ```bash
   npm run db:migrate:deploy
   ```

4. Confirm the seven columns exist on `Redemption` and that existing rows have
   `NULL` in all seven and an unchanged `shippingAddress`.

The change is additive and nullable, so rollback is dropping the seven columns;
no data written before it is at risk. **Until step 3 runs, every redemption
fails** — the client sends fields Prisma cannot write.

## 9. Verification

Already run against the working tree:

| Check | Result |
| --- | --- |
| `npx prisma generate` | Client regenerated, v6.19.3 |
| `npx tsc --noEmit` | Clean |
| `npx eslint` on all 12 touched files | Clean |
| `npm run build` | Compiles; `/marketplace` builds. One pre-existing Turbopack NFT warning on `next.config.ts`, unrelated |
| Dataset integrity script | 36 states/UTs, 4,075 cities, 0 duplicates within a state, 89 names shared across states, UP = 412 cities |
| Cascade + validation script (25 assertions) | All pass — see below |
| Client chunk size | City data lands in its own 62 KB chunk (~15 KB gzipped), code-split off the main bundle |

The 25 assertions cover: pick-state-then-city narrowing; `Lucknow` →
Uttar Pradesh both by picking and by typing; `Pune` → Maharashtra; `Aurangabad`
typed stays unresolved but picked resolves to the chosen state; unlisted town
accepted; changing state clears a non-member city but keeps a member one; a
chosen state never overwritten; the composed block exactly equal to
`"Asha Verma\n42 Gomti Nagar, Vibhuti Khand\nLucknow, Uttar Pradesh 226010\nIndia"`;
empty line 2 → `null`; and rejections for 5-digit, alphabetic and 0-leading
pincodes, an invented state, an empty state, a non-India country, a blank name
and a too-short line 1.

**Not verified:** the dialog was never opened in a browser. The dev server was
declined and `/marketplace` is behind auth. The *visual* layout of the two new
two-column rows (State/City, Pincode/Country) is therefore unconfirmed — the
sizing and `dark:` fixes above were reasoned from the primitives' source, not
seen. Manual pass still to do, logged in:

1. Open any affordable item → Redeem.
2. Confirm the India-only notice and that `team@abtalks.in` opens a mail client.
3. Pick Uttar Pradesh → city list offers only UP cities.
4. Clear it; type `luckno` → pick Lucknow → state fills with Uttar Pradesh.
5. Type `Aurangabad` → state stays empty; the dropdown offers both states.
6. Type letters into pincode → nothing appears.
7. Confirm the two dropdowns are the same height as the inputs.
8. Submit; check the admin redemptions table shows the four-line block.

Files that should have changed: the 12 in §4, plus this plan. Nothing under
`src/repositories/`, nothing in admin, no `package.json` change (no new
dependency — Base UI `Autocomplete` was already in use).

## 10. Commit message

```
feat(marketplace): structured shipping address on redemption

Replace the free-text address textarea in the redeem dialog with recipient
name, address line 1/2, city, state, pincode and country.

State and city are dependent dropdowns over a new 36-state / 4,075-city
dataset: choosing a state narrows the cities, and choosing or typing a city
fills the state back in when exactly one state claims the name. Free text is
still accepted, since no city list is complete. Pincode takes digits only.

Delivery is India-only; the dialog says so and points elsewhere at
team@abtalks.in.

Redemption gains seven nullable columns — legacy rows have no parts to fill
them with. shippingAddress stays NOT NULL and is now composed on the server
from the validated parts, so admin and existing rows are untouched.

Migration is additive and not yet applied.
```
