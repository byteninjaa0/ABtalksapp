"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { cn } from "@/lib/utils";
import { PwField } from "./wizard-fields";
import type { IndiaCityOption, IndiaState } from "@/data/india-locations";
import type { CountryOption } from "@/data/countries";

type Props = {
  city: string;
  region: string;
  countryCode: string;
  onCityChange: (city: string) => void;
  onRegionChange: (region: string) => void;
  onCountryCodeChange: (code: string) => void;
};

type LocationData = {
  states: IndiaState[];
  cities: IndiaCityOption[];
  countries: CountryOption[];
};

/**
 * The wizard's CSS (`profile-wizard.css`) styles any plain `<input>` that is
 * a descendant of `.pw-field`, `!important` and all — so these comboboxes
 * intentionally carry no className of their own on `Autocomplete.Input`. The
 * popup/list styling below has no wizard-native equivalent to match, so it
 * keeps its own Tailwind classes.
 */
const POPUP_CLASS =
  "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10";

/* ─── State combobox ─────────────────────────────────────────────────────── */

function StateCombobox({
  states,
  value,
  onSelect,
  onChange,
}: {
  states: IndiaState[];
  value: string;
  onSelect: (item: IndiaState) => void;
  onChange: (text: string) => void;
}) {
  const highlightedRef = useRef<IndiaState | null>(null);

  return (
    <Autocomplete.Root
      items={states}
      value={value}
      itemToStringValue={(item: IndiaState) => item.name}
      onItemHighlighted={(item) => {
        highlightedRef.current = item ?? null;
      }}
      onValueChange={(text, details) => {
        if (details.reason === "item-press") {
          const item = highlightedRef.current;
          if (item) onSelect(item);
          else onChange(text);
          return;
        }
        onChange(text);
      }}
    >
      <Autocomplete.Input
        id="bi-region"
        placeholder="e.g. Uttar Pradesh"
        autoComplete="nope"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore=""
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="isolate z-50"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup className={cn(POPUP_CLASS)}>
            <Autocomplete.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {value.trim() ? "No matching state or UT" : null}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: IndiaState) => (
                <Autocomplete.Item
                  key={item.name}
                  value={item}
                  className="relative flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  onClick={() => onSelect(item)}
                >
                  {item.name}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

/* ─── City combobox ──────────────────────────────────────────────────────── */

function CityCombobox({
  items,
  showState,
  value,
  onSelect,
  onChange,
}: {
  items: IndiaCityOption[];
  showState: boolean;
  value: string;
  onSelect: (item: IndiaCityOption) => void;
  onChange: (text: string) => void;
}) {
  const highlightedRef = useRef<IndiaCityOption | null>(null);

  return (
    <Autocomplete.Root
      items={items}
      value={value}
      itemToStringValue={(item: IndiaCityOption) => item.city}
      onItemHighlighted={(item) => {
        highlightedRef.current = item ?? null;
      }}
      onValueChange={(text, details) => {
        if (details.reason === "item-press") {
          const item = highlightedRef.current;
          if (item) onSelect(item);
          else onChange(text);
          return;
        }
        onChange(text);
      }}
    >
      <Autocomplete.Input
        id="bi-city"
        placeholder="e.g. Noida"
        autoComplete="nope"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore=""
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="isolate z-50"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup className={cn(POPUP_CLASS)}>
            <Autocomplete.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {value.trim() ? "No matching city" : null}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: IndiaCityOption) => (
                <Autocomplete.Item
                  key={`${item.city}|${item.state}`}
                  value={item}
                  className="relative flex w-full cursor-default flex-col gap-0.5 rounded-md py-1.5 pr-2 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  onClick={() => onSelect(item)}
                >
                  <span>{item.city}</span>
                  {showState ? (
                    <span className="text-xs text-muted-foreground">
                      {item.state}
                    </span>
                  ) : null}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

/* ─── Country combobox ───────────────────────────────────────────────────── */

/**
 * Unlike City/State (free text, up to 120 chars, anything typed is valid),
 * `countryCode` is server-validated to exactly 2 letters — so this combobox
 * cannot let arbitrary typed text win the way the others do. Typing filters
 * the list; only picking an item commits `onCountryCodeChange`. The input's
 * text is local state, seeded from the current code's country name and reset
 * to it on blur if nothing was picked, so a half-typed search never leaves
 * the field showing something that was never actually saved. Reverting on
 * blur (not on the popup closing) matters: the popup can close mid-typing
 * for reasons unrelated to the user being done — reverting there would fight
 * every keystroke, including backspace.
 */
function CountryCombobox({
  countries,
  code,
  onSelect,
}: {
  countries: CountryOption[];
  code: string;
  onSelect: (item: CountryOption) => void;
}) {
  const nameFor = (c: string) =>
    countries.find((x) => x.code === c)?.name ?? c;

  const [text, setText] = useState(nameFor(code));
  const [syncedCode, setSyncedCode] = useState(code);
  const highlightedRef = useRef<CountryOption | null>(null);

  // Re-derive `text` from `code` when it changes externally (e.g. a city
  // pick sets countryCode="IN"), without the extra render an effect would
  // cost — this adjustment happens during render, per React's documented
  // pattern for syncing local state to a prop.
  if (code !== syncedCode) {
    setSyncedCode(code);
    setText(nameFor(code));
  }

  function commit(item: CountryOption) {
    onSelect(item);
    setText(item.name);
  }

  return (
    <Autocomplete.Root
      items={countries}
      value={text}
      itemToStringValue={(item: CountryOption) => item.name}
      onItemHighlighted={(item) => {
        highlightedRef.current = item ?? null;
      }}
      onValueChange={(next, details) => {
        if (details.reason === "item-press") {
          const item = highlightedRef.current;
          if (item) commit(item);
          return;
        }
        setText(next);
      }}
    >
      <Autocomplete.Input
        id="bi-country"
        placeholder="e.g. India"
        autoComplete="nope"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-1p-ignore=""
        onBlur={() => setText(nameFor(code))}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="isolate z-50"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup className={cn(POPUP_CLASS)}>
            <Autocomplete.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {text.trim() ? "No matching country" : null}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: CountryOption) => (
                <Autocomplete.Item
                  key={item.code}
                  value={item}
                  className="relative flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  onClick={() => commit(item)}
                >
                  {item.name}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

/* ─── Location fields hook ───────────────────────────────────────────────── */

/**
 * City / State / Country for the candidate's home location, as three
 * independently-placeable `PwField`-wrapped nodes — a hook rather than a
 * single component because the wizard's basic-info layout groups City/State
 * into one row (with persona) and Country into a different row (with
 * headline); nothing here needs its own wrapping grid.
 *
 * The India states/cities dataset (~43 KB) and the world country list (~8 KB)
 * are loaded together, lazily, via dynamic import — neither lands in the main
 * bundle. Before they load, or once a non-India country is picked, City and
 * State degrade to plain text inputs — never blocked, never broken. The
 * India-specific cascade (state narrows city, either fills the other in) only
 * applies while the selected country is India; there is no state/city data
 * for anywhere else. Typing directly into City/State always wins; a dropdown
 * pick is a shortcut that also fills in the related fields. Country itself
 * has no free-text path — see the comment on `CountryCombobox`.
 */
export function useLocationFields({
  city,
  region,
  countryCode,
  onCityChange,
  onRegionChange,
  onCountryCodeChange,
}: Props): { cityField: ReactNode; stateField: ReactNode; countryField: ReactNode } {
  const [data, setData] = useState<LocationData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("@/data/india-locations"),
      import("@/data/countries"),
    ]).then(([india, world]) => {
      if (!cancelled) {
        setData({
          states: india.INDIA_STATES,
          cities: india.INDIA_CITIES,
          countries: world.COUNTRIES,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Empty countryCode defaults to the India experience — that is the
  // existing behaviour for every profile created before this field existed.
  const isIndia = countryCode === "" || countryCode === "IN";

  function selectState(item: IndiaState) {
    onRegionChange(item.name);
    onCountryCodeChange("IN");
    const stillValid = item.cities.some(
      (c) => c.toLowerCase() === city.trim().toLowerCase(),
    );
    if (city && !stillValid) onCityChange("");
  }

  function selectCity(item: IndiaCityOption) {
    onCityChange(item.city);
    onRegionChange(item.state);
    onCountryCodeChange("IN");
  }

  function selectCountry(item: CountryOption) {
    onCountryCodeChange(item.code);
    // Leaving India clears state/city rather than stranding an India place
    // name under an unrelated country; picking India back never fires this.
    if (item.code !== "IN") {
      if (region) onRegionChange("");
      if (city) onCityChange("");
    }
  }

  const matchedState = data?.states.find(
    (s) => s.name.toLowerCase() === region.trim().toLowerCase(),
  );
  const cityItems: IndiaCityOption[] = matchedState
    ? matchedState.cities.map((c) => ({ city: c, state: matchedState.name }))
    : (data?.cities ?? []);

  const cityField = (
    <PwField label="City" htmlFor="bi-city">
      {data && isIndia ? (
        <CityCombobox
          items={cityItems}
          showState={!matchedState}
          value={city}
          onSelect={selectCity}
          onChange={onCityChange}
        />
      ) : (
        <input
          id="bi-city"
          placeholder={isIndia ? "e.g. Noida" : undefined}
          autoComplete="address-level2"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
        />
      )}
    </PwField>
  );

  const stateField = (
    <PwField label="State / region" htmlFor="bi-region">
      {data && isIndia ? (
        <StateCombobox
          states={data.states}
          value={region}
          onSelect={selectState}
          onChange={onRegionChange}
        />
      ) : (
        <input
          id="bi-region"
          placeholder={isIndia ? "e.g. Uttar Pradesh" : undefined}
          autoComplete="address-level1"
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
        />
      )}
    </PwField>
  );

  const countryField = (
    <PwField label="Country" htmlFor="bi-country">
      {data ? (
        <CountryCombobox
          countries={data.countries}
          code={countryCode || "IN"}
          onSelect={selectCountry}
        />
      ) : (
        <input id="bi-country" value={isIndia ? "India" : countryCode} disabled />
      )}
    </PwField>
  );

  return { cityField, stateField, countryField };
}
