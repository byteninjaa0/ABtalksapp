# 107 — Cascading searchable city/state/country picker on the profile (India first)

## 1. Goal

Replace the three plain-text **City / State / Country code** inputs in the
profile's Basic information section with searchable dropdowns: picking a city
auto-fills its state and country, picking a state narrows the city list to
that state, and the whole thing works for India only for now (multi-country
is explicit future work, not part of this plan).

---

## 2. Current behavior

- [basic-info-section.tsx:97-123](src/components/profile/basic-info-section.tsx#L97-L123)
  renders three plain `<Input>`s in a `sm:grid-cols-3` grid, `register()`-bound
  to `locationCity`, `locationRegion`, `countryCode` on the same `useForm<BasicInfoValues>`
  that also drives `fullName`/`phone`/`headline`/`summary`/`primaryPersona`.
- All three are free text server-side too:
  [candidate-profile.ts:93-103](src/lib/validations/candidate-profile.ts#L93-L103) —
  `locationCity`/`locationRegion` are `nullableText(120)`, `countryCode` must be
  exactly 2 letters (uppercased) or empty. `saveBasicInfoAction` →
  `saveBasicInfo()` in
  [candidate-detail.ts:486-519](src/repositories/candidate-detail.ts#L486-L519)
  writes them straight into `CandidateProfile` (+ a legacy `StudentProfile`
  mirror). **None of this needs to change** — this plan is a client-side input
  upgrade only; the three fields stay the same free-text, already-validated
  columns, and still accept anything typed, listed or not.
- There is already a proven pattern for this exact shape of problem —
  [docs/plans/066-college-dropdown.md](docs/plans/066-college-dropdown.md) —
  a searchable `Autocomplete` (`@base-ui/react/autocomplete`) combobox where
  typed text always wins and a dropdown pick is just a shortcut. Two live
  implementations to copy the idiom from:
  [skill-combobox.tsx](src/components/profile/skill-combobox.tsx) and
  [college-combobox.tsx](src/components/shared/college-combobox.tsx). Both of
  those search a *server* endpoint because their datasets are large (54,651
  colleges). This feature's dataset is small enough to ship to the client
  instead — no new API route, no DB table, no server round trip at all.

### Data research (already done — the asset is ready to copy)

Source: `DarakhTech/India-State-Cities-Database`, commit
`bab7f23c2093fbcbeb34a4c995f0fd30345ce487` (MIT licensed, `combined.json` +
`cities.json`), fetched and inspected directly. Raw: 36 states/UTs, 3,727 city
entries, 86 KB.

**Three data bugs found and fixed** (same "verify before trusting a public
dataset" discipline as plan 066 — do not re-introduce any of them):

1. The state row labelled **"Daman and Diu" (code `DL`) held Delhi's
   neighbourhoods**, not Daman and Diu's towns — verified by cross-checking
   `cities.json`'s raw `DL` key (`Alipur`, `Central Delhi`, `New Delhi`,
   `Rohini`, `Karol Bagh`, …, 19 entries — unmistakably Delhi). There was no
   "Delhi" row anywhere in the state list. **Fix:** drop the mislabelled row;
   add a correct `Delhi` entry using that same 19-city list.
2. **Ladakh and Lakshadweep's names were swapped** relative to their city
   lists — code `LA`'s cities are `Kargil`/`Leh` (Ladakh's two districts,
   matching Ladakh's real code `LA`) but was labelled "Lakshadweep"; code
   `LD`'s cities are `Kavaratti`/`Lakshadweep` (Lakshadweep's actual capital
   and territory) but was labelled "Ladakh". **Fix:** swap the two names to
   match their real city lists.
3. Two malformed city strings: `"Govindapuram,Chilakaluripet,Guntur"` under
   Andhra Pradesh (a triple-concatenation typo — `Chilakalurupet` and `Guntur`
   already exist correctly-spelled elsewhere in the same list; `Govindapuram`
   is not recoverable without guessing, so the row is dropped, not fuzzily
   repaired) and `"Shyamnagar, West Bengal"` (redundant state suffix,
   normalized to `Shyamnagar`; verified no existing plain `Shyamnagar` to
   collide with).

Also renamed `Dadra and Nagar Haveli` → `Dadra and Nagar Haveli and Daman and
Diu` (the two UTs merged in 2020); no city-list change needed there — its list
already includes `Daman`, `Daman District`, and `Diu`.

Verified against every state/UT's well-known capital or largest city (Mumbai
in Maharashtra, Bengaluru in Karnataka, Hyderabad in Telangana not Andhra
Pradesh, Kolkata in West Bengal, Chandigarh as its own single-city UT, etc.) —
no further mislabelling found.

**Final cleaned dataset:** 36 states/UTs, 3,726 city entries, 43,002 bytes
(≈17 KB gzipped) — already built, verified, and saved at
[docs/plans/assets/107-india-states-cities.json](docs/plans/assets/107-india-states-cities.json).
Shape:

```json
{ "states": [ { "name": "Andhra Pradesh", "cities": ["Addanki", "Adoni", …] }, … ] }
```

94 city names repeat across more than one state (e.g. small towns with common
names) — this is why the client picks by `{ city, state }` pair, never by bare
city name (see §5 Step 3), so there is never any ambiguity about which state a
selected city belongs to.

---

## 3. Files to touch

- `docs/plans/assets/107-india-states-cities.json` — **already written**, the
  verified/cleaned dataset. Nothing to do here except copy it in Step 1.
- `src/data/india-states-cities.json` — `[new]` byte-for-byte copy of the asset
  above.
- `src/data/india-locations.ts` — `[new]` typed loader over that JSON.
- `src/components/profile/location-fields.tsx` — `[new]` the City/State/Country
  field group — searchable comboboxes for city and state, a `Select` for
  country.
- `src/components/profile/basic-info-section.tsx` — `[edit]` replace the
  3-column `<Input>` grid at lines 97-123 with `<LocationFields>`.

**Out of scope — do not touch:**
`src/lib/validations/candidate-profile.ts`, `src/repositories/candidate-detail.ts`,
`src/app/actions/candidate-profile-actions.ts` (no validation or persistence
change — the three fields stay exactly the free-text columns they are today),
`src/components/profile/experience-section.tsx` (its own per-role
`locationCity` field is unrelated free text, not the candidate's home
location), `prisma/schema.prisma` (no schema change at all), and
`src/lib/validations/hire.ts` (recruiter-search `locationCity`, unrelated
surface).

---

## 4. Server vs Client

| Component / module | Kind | Notes |
|---|---|---|
| `location-fields.tsx` | **Client** (`"use client"`) | Owns local combobox state; dynamically imports the data module (Step 2's guardrail). Receives only strings and callbacks from `basic-info-section.tsx`, which is already a client component. |
| `basic-info-section.tsx` | Client (already) | No new Server→Client boundary crossing. |
| `india-locations.ts` | Plain data/type module | No directive needed — never imported by a Server Component, only ever `import()`-ed lazily from the client component in Step 2. |
| `india-states-cities.json` | Static data | Imported once, by `india-locations.ts` only. |

No Server→Client prop passing is introduced. No functions, icons, or class
instances cross a boundary. No new Server Action, no new Route Handler — this
feature makes zero network requests.

---

## 5. Steps

### Step 1 — copy the data asset
Copy [docs/plans/assets/107-india-states-cities.json](docs/plans/assets/107-india-states-cities.json)
byte-for-byte to `src/data/india-states-cities.json`. Do not regenerate,
reformat, re-sort, or "clean up" it further — it is already verified (§2).

### Step 2 — `src/data/india-locations.ts`

```ts
import statesData from "@/data/india-states-cities.json";

export type IndiaState = { name: string; cities: string[] };

export type IndiaCityOption = { city: string; state: string };

export const INDIA_STATES: IndiaState[] = statesData.states;

/** Every city in every state, flattened, each paired with its own state.
 * 94 city names repeat across more than one state — this pairing is what
 * makes picking one from the national list unambiguous; there is no reverse
 * "look up a city's state" helper because none is needed. */
export const INDIA_CITIES: IndiaCityOption[] = INDIA_STATES.flatMap((s) =>
  s.cities.map((city) => ({ city, state: s.name })),
);
```

This module is the thing `location-fields.tsx` dynamically `import()`s — see
the guardrail in §6. Do not add a `"use client"` directive here.

### Step 3 — `src/components/profile/location-fields.tsx`

Props (mirrors how `basic-info-section.tsx` already wires `primaryPersona` via
`watch`/`setValue`, not `register`):

```ts
type Props = {
  city: string;
  region: string;
  countryCode: string;
  onCityChange: (city: string) => void;
  onRegionChange: (region: string) => void;
  onCountryCodeChange: (code: string) => void;
};
```

**Data loading — lazy, non-blocking:**

```ts
const [data, setData] = useState<{ states: IndiaState[]; cities: IndiaCityOption[] } | null>(null);

useEffect(() => {
  let cancelled = false;
  import("@/data/india-locations").then((mod) => {
    if (!cancelled) setData({ states: mod.INDIA_STATES, cities: mod.INDIA_CITIES });
  });
  // No .catch() logging — the fallback below is already the correct degraded
  // state, there is nothing actionable to log.
  return () => { cancelled = true; };
}, []);
```

While `data === null`, render City and State as **plain `<Input>`s** — lift
the exact markup and `<Field>` wrapper currently at
[basic-info-section.tsx:98-113](src/components/profile/basic-info-section.tsx#L98-L113)
verbatim into this branch, wired to the `city`/`region` props and
`onCityChange`/`onRegionChange` instead of `register()`. The field must always
be usable; it just doesn't upgrade to a combobox until the ~43 KB dataset
(dynamically chunked, not in the main bundle) finishes loading, which on a
mobile connection may be visibly after the section has already rendered.

**Country field — plain `Select` (from `@/components/ui/select`, same
component `primaryPersona` already uses in the parent), not a combobox — no
search needed for one option:**

```tsx
<Select value={countryCode} onValueChange={onCountryCodeChange}>
  <SelectTrigger aria-label="Country"><SelectValue placeholder="Select" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="IN">India</SelectItem>
    {countryCode && countryCode !== "IN" ? (
      <SelectItem value={countryCode}>{countryCode}</SelectItem>
    ) : null}
  </SelectContent>
</Select>
```

The conditional extra item is load-bearing: a candidate who saved a non-India
`countryCode` before this feature existed must not have it silently
disappear/blank out the first time they open this section — it stays selected
and visible (labelled by its raw code) until they deliberately pick something
else. Once the dataset has loaded, selecting a state or city (below) always
sets this to `"IN"` — the whole feature is scoped to India, so picking from
an India list implies the country is India.

**State field — searchable combobox, once `data` has loaded:**

Build on `Autocomplete` from `@base-ui/react/autocomplete`, following the
`onItemHighlighted` + `onValueChange`-with-`details.reason` idiom already
used in
[college-combobox.tsx:88-118](src/components/shared/college-combobox.tsx#L88-L118) —
copy that structure, not the fetch/debounce machinery around it (there is no
network call here).

```tsx
<Autocomplete.Root
  items={data.states}
  value={region}
  itemToStringValue={(item: IndiaState) => item.name}
  onItemHighlighted={(item) => { highlightedRef.current = item ?? null; }}
  onValueChange={(text, details) => {
    if (details.reason === "item-press") {
      const item = highlightedRef.current;
      if (item) selectState(item);
      else onRegionChange(text);
      return;
    }
    onRegionChange(text);
  }}
>
```

**Important divergence from `college-combobox.tsx`/`skill-combobox.tsx`: do
NOT pass `filter={null}`.** Those two disable Base UI's built-in filtering
because a server does the filtering instead. Here the data is fully local —
leave Base UI's default filter running over `items` (via `itemToStringValue`)
so typing searches the 36 states/UTs with no extra code.

Selecting a state (`selectState`, called both from `onValueChange`'s
`item-press` branch above and from each `<Autocomplete.Item>`'s `onClick`,
exactly like `college-combobox.tsx` does):

```ts
function selectState(item: IndiaState) {
  onRegionChange(item.name);
  onCountryCodeChange("IN");
  const stillValid = item.cities.some(
    (c) => c.toLowerCase() === city.trim().toLowerCase(),
  );
  if (city && !stillValid) onCityChange("");
}
```

Clearing the city on a mismatched state change is deliberate — standard
cascading-select behavior, and it only fires on an explicit dropdown pick,
never while the candidate is just typing.

**City field — searchable combobox, once `data` has loaded.** Same
`Autocomplete` idiom as State. The item source depends on whether the current
`region` value matches a known state (case-insensitive exact match):

```ts
const matchedState = data.states.find(
  (s) => s.name.toLowerCase() === region.trim().toLowerCase(),
);
const cityItems: IndiaCityOption[] = matchedState
  ? matchedState.cities.map((c) => ({ city: c, state: matchedState.name }))
  : data.cities; // the flattened, all-India, all-3,726-entry list
```

`itemToStringValue={(item) => item.city}` (filters by city name only, not
state — same "no `filter={null}`" reasoning as State). Render each row's
`item.state` as dimmed secondary text **only when `matchedState` is `null`**
(national list) — once a state is already selected it would be redundant on
every row, exactly the same "only show what disambiguates" call
`college-combobox.tsx` makes for `district`.

Selecting a city:

```ts
function selectCity(item: IndiaCityOption) {
  onCityChange(item.city);
  onRegionChange(item.state);
  onCountryCodeChange("IN");
}
```

Always sets region + country, scoped or not — harmless when scoped (`region`
already equals `item.state`), and it is exactly the "pick city first, state
and country fill in" behavior asked for.

**Typing directly into either combobox never touches the other two fields** —
only an explicit `item-press` (dropdown pick) runs `selectState`/`selectCity`.
Typed text is always what gets submitted, same convention as
`college-combobox.tsx`'s "No match — press Enter to use…" — do not block
submit on anything in this component.

### Step 4 — wire it into `basic-info-section.tsx`

Replace the whole grid block at
[basic-info-section.tsx:97-123](src/components/profile/basic-info-section.tsx#L97-L123)
with:

```tsx
<LocationFields
  city={watch("locationCity")}
  region={watch("locationRegion")}
  countryCode={watch("countryCode")}
  onCityChange={(v) => setValue("locationCity", v, { shouldDirty: true })}
  onRegionChange={(v) => setValue("locationRegion", v, { shouldDirty: true })}
  onCountryCodeChange={(v) => setValue("countryCode", v, { shouldDirty: true })}
/>
```

Add `import { LocationFields } from "./location-fields";`. `watch`/`setValue`
are already destructured from `useForm` in this file (used today for
`primaryPersona`) — no new hook wiring needed. `BasicInfoValues`, the Zod
schema, and `saveBasicInfoAction` are all unchanged; this is purely swapping
what renders the three fields.

---

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** add a Prisma migration, a new column, a DB table, or an API
  route. Nothing here talks to the server — `locationCity`/`locationRegion`/
  `countryCode` are already free-text and already validated; this plan only
  changes what UI writes into them.
- **DO NOT** statically `import` `@/data/india-locations` (or the JSON file
  directly) anywhere. It must only ever be reached via the dynamic `import()`
  inside `useEffect` in Step 3, so the ~43 KB dataset stays out of the main
  `/profile` bundle and out of every other route's bundle entirely.
- **DO NOT** block form submit on the dataset load or on anything in this
  component. Before the dataset loads, the plain-`<Input>` fallback must be
  fully typeable and must submit correctly.
- **DO NOT** pass `filter={null}` to either `Autocomplete.Root` here — that is
  correct for `skill-combobox.tsx`/`college-combobox.tsx` because a server
  filters; here the data is local and Base UI's own filter must run.
- **DO NOT** re-derive, re-sort, re-clean, or "improve" `docs/plans/assets/107-india-states-cities.json`
  before copying it — it is already verified (§2). If you find a fourth data
  bug, stop and flag it rather than hand-patching silently.
- **DO NOT** expand the Country field beyond India for now — no country list,
  no country search. That is explicit future work, not this plan.
- **DO NOT** touch `src/components/profile/experience-section.tsx`'s own
  `locationCity` field — it is a separate, per-role free-text field, unrelated
  to the candidate-level location this plan touches.
- **DO NOT** modify `src/components/ui/*}`. Reuse `Select`/`Input` styling
  exactly the way `skill-combobox.tsx`/`college-combobox.tsx` already do —
  copy their `INPUT_CLASS` constant rather than inventing new Tailwind.
- **DO NOT** use `<Button asChild>` / `<Button render={<Link>}>` anywhere (n/a
  here — no buttons are added — but keep to the house rule if one turns out to
  be needed).
- **DO NOT** silently drop a candidate's existing non-India `countryCode` —
  the conditional extra `<SelectItem>` in Step 3 is required, not optional
  polish.

---

## 7. DB safety

**Not applicable.** No schema change, no migration, no data backfill — this
plan touches only client-rendered form fields and adds one new static JSON
asset under `src/data/`. Skip straight to Verification.

---

## 8. Verification

**Build / typecheck**
- `npx prisma generate` then `npm run build` — clean. (The repo currently has
  a handful of *pre-existing, unrelated* type errors — missing `three`/`ogl`
  packages, `hire/virtual-candidate*` — confirm none of those counts change
  and no new error appears in `location-fields.tsx`, `basic-info-section.tsx`,
  or `india-locations.ts`.)
- `npm run lint` — clean. Strict TS, no `any`.

**Manual, on a phone-sized viewport, at `/profile` → Basic information**
1. Type "karnat" in State → dropdown filters to "Karnataka" as you type;
   click it → City field narrows to Karnataka's ~242 cities only, Country
   shows "India".
2. Clear State. Type "mumbai" in City (state not yet chosen) → dropdown shows
   "Mumbai" with "Maharashtra" as secondary text; click it → City="Mumbai",
   State="Maharashtra", Country="India" all fill in together.
3. With State="Karnataka" already selected, type a city that is not in
   Karnataka's list (e.g. "Pune") and do **not** select anything from the
   dropdown, just leave the typed text → Save → confirm it saves the typed
   text as-is (typed text always wins).
4. With a city already chosen, change State to a different one whose list
   does not contain that city → confirm the City field clears.
5. DevTools → offline. Confirm typing and selecting in State/City still work
   (no network dependency at all) and Save still succeeds.
6. Reload `/profile` after saving → City/State/Country pre-fill correctly
   from the saved values.
7. If a test account has a pre-existing non-`IN` `countryCode`: open the
   section and confirm the Country dropdown still shows that value rather
   than blanking to nothing.
8. Confirm the initial `/profile` page load's JS payload does not include
   `india-states-cities.json` inline — it should appear only as a separate
   chunk fetched after `location-fields.tsx` mounts (check the Network tab,
   filter by the file name).

**Files that should have changed** — exactly the 4 listed in §3 as `[new]`/`[edit]`,
plus nothing else. If `prisma/schema.prisma`, any file under
`src/repositories/`, `src/lib/validations/`, or `src/app/actions/` shows up in
`git status`, something went beyond scope.

---

## 9. Commit message

```
feat(profile): cascading searchable city/state/country picker for India

Replace the three free-text location inputs on the profile's Basic
information section with searchable dropdowns backed by a static,
verified India states-to-cities dataset (36 states/UTs, 3,726 cities,
~17 KB gzipped, lazy-loaded so it never lands in the main bundle).
Picking a city fills in its state and country; picking a state narrows
the city list to it. Typing directly still wins over the dropdown, same
convention as the existing college combobox.

The upstream source (DarakhTech/India-State-Cities-Database) had three
data bugs, found and fixed before shipping: Delhi's neighbourhoods were
mislabelled as "Daman and Diu", Ladakh and Lakshadweep's city lists were
swapped, and two malformed city strings were cleaned up.

No schema or backend change - locationCity/locationRegion/countryCode
stay the same free-text, already-validated columns and this makes no
network requests. Country is scoped to India only for now; a candidate's
existing non-India value is preserved rather than silently dropped.
```

---

## 10. Addendum (implemented) — full country list, not India-only

**Status: implemented**, directly, outside the normal architect→Cursor
handoff, at the user's explicit repeated request. Recorded here so this plan
stays an accurate description of what actually shipped.

The Country field originally specced in §3/§5 as a plain `<Select>` offering
only "India" was extended, in the same session, to a full searchable
combobox over all 249 ISO 3166-1 countries, because the user asked for "more
options other than India" immediately after the first version shipped.

**What changed from the plan above:**

- `src/data/countries.json` `[new]` — 249 `{ code, name }` entries, sorted by
  name. Source: `stefangabos/world_countries`, commit
  `7edbb1e30ddc9b616ee07f76a3cad3af2416b618`,
  `data/countries/en/world.json` (CC-BY-SA 4.0 — factual ISO code/name pairs,
  used here as internal reference data, not redistributed as a dataset). 20
  UN/ISO treaty-style names (`"United States of America"`,
  `"Korea, Republic of"`, `"Iran, Islamic Republic of"`, …) were swapped for
  the short common names people actually search for; build script and
  override list preserved at
  [docs/plans/assets/107-build-countries.js](docs/plans/assets/107-build-countries.js),
  raw output at
  [docs/plans/assets/107-countries.json](docs/plans/assets/107-countries.json).
  Verified: 249 unique codes, `IN` → `"India"`, spot-checked against a dozen
  well-known codes.
- `src/data/countries.ts` `[new]` — typed loader, `COUNTRIES: CountryOption[]`.
- `location-fields.tsx` — added `CountryCombobox`, a *selection-only*
  Autocomplete (unlike State/City, `countryCode` is server-validated to
  exactly 2 letters, so free-typed text cannot be allowed to commit — see the
  block comment on `CountryCombobox` in the file). Typing filters the 249-item
  list locally; only picking an item calls `onCountryCodeChange`. The input's
  displayed text is local component state, re-derived from the current code
  during render (not in an effect — avoids the `react-hooks/set-state-in-effect`
  cascading-render lint rule) whenever `code` changes externally, and reset to
  match the committed code whenever the popup closes without a pick.
- The India state/city cascade from §5 now only renders while the selected
  country is India (`countryCode === "" || countryCode === "IN"`) — there is
  no state/city data for anywhere else. Picking a non-India country clears
  `locationCity`/`locationRegion` (via `selectCountry`) so an India place name
  never sits stranded under an unrelated country; switching back to India
  never fires this. Outside India, City/State are the same plain-text-input
  fallback already used while the dataset is loading.
- The India dataset and the country list are now fetched together in one
  `Promise.all` inside the same lazy `useEffect` — one loading gate, ~51 KB
  total, still dynamically imported, still never in the main bundle.

**Verification done:** `npx tsc --noEmit` and `npx eslint` clean on all
touched files (no new errors/warnings beyond the same pre-existing,
unrelated ones noted in §8); `npx next build` compiled successfully (same
pre-existing unrelated `dotenv` type-check failures in `prisma/seed-*.ts`,
untouched by this change). Not yet verified in an actual browser — no
browser-driving tool was available in this session; the manual test steps in
§8 still apply and should be re-run including a pick outside India (confirm
City/State degrade to plain inputs and clear).
