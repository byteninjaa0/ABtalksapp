"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useMemo, useRef } from "react";
import {
  INDIA_CITY_OPTIONS,
  citiesForState,
  type IndiaCityOption,
} from "@/data/india-locations";
import { cn } from "@/lib/utils";

/**
 * City field for the redeem dialog, filtering against
 * `src/data/india-locations.ts`.
 *
 * Two modes, because the state field can be filled either before or after this
 * one. With a state chosen, only that state's cities are offered. Without one,
 * the whole country is searched and picking a result reports the state back so
 * the caller can fill it in ("Lucknow" -> Uttar Pradesh).
 *
 * Free text is always accepted — no city list is complete and a student in an
 * unlisted town still has to be able to redeem. That is why the input is a
 * plain `Autocomplete` in `mode="none"` rather than a Select.
 */

type Props = {
  id?: string;
  value: string;
  /** Currently selected state, or "" when the student has not picked one. */
  state: string;
  /**
   * `impliedState` is the state of the picked suggestion, or null when the text
   * was typed rather than chosen.
   */
  onChange: (city: string, impliedState: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
};

/** Enough to scroll, few enough to stay a cheap render. */
const MAX_SUGGESTIONS = 50;

/** Searching all of India unfiltered is noise; one letter is not a query. */
const MIN_QUERY_WITHOUT_STATE = 2;

export function CityCombobox({
  id,
  value,
  state,
  onChange,
  disabled,
  placeholder,
  className,
  "aria-invalid": ariaInvalid,
}: Props) {
  const highlightedRef = useRef<IndiaCityOption | null>(null);

  const pool = useMemo<readonly IndiaCityOption[]>(() => {
    if (!state) return INDIA_CITY_OPTIONS;
    return citiesForState(state).map((city) => ({ city, state }));
  }, [state]);

  const suggestions = useMemo<IndiaCityOption[]>(() => {
    const query = value.trim().toLowerCase();

    // With a state chosen the list is short enough to browse cold.
    if (!query) return state ? pool.slice(0, MAX_SUGGESTIONS) : [];
    if (!state && query.length < MIN_QUERY_WITHOUT_STATE) return [];

    // Prefix matches first: typing "luck" should surface Lucknow above
    // anything that merely contains the letters.
    const prefix: IndiaCityOption[] = [];
    const substring: IndiaCityOption[] = [];
    for (const option of pool) {
      const name = option.city.toLowerCase();
      if (name.startsWith(query)) {
        prefix.push(option);
        if (prefix.length >= MAX_SUGGESTIONS) break;
      } else if (
        substring.length < MAX_SUGGESTIONS &&
        name.includes(query)
      ) {
        substring.push(option);
      }
    }
    return [...prefix, ...substring].slice(0, MAX_SUGGESTIONS);
  }, [pool, state, value]);

  return (
    <Autocomplete.Root
      mode="none"
      filter={null}
      items={suggestions}
      value={value}
      itemToStringValue={(item: IndiaCityOption) => item.city}
      onItemHighlighted={(item) => {
        highlightedRef.current = item ?? null;
      }}
      onValueChange={(text, details) => {
        if (details.reason === "item-press") {
          const item = highlightedRef.current;
          onChange(item?.city ?? text, item?.state ?? null);
          return;
        }
        onChange(text, null);
      }}
    >
      <Autocomplete.Input
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        autoComplete="address-level2"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        className={className}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="isolate z-50"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup
            className={cn(
              "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-[#1C283D] bg-[#0B1124] p-1 text-white shadow-md ring-1 ring-white/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <Autocomplete.Empty className="px-2 py-1.5 text-xs text-zinc-400">
              {value.trim()
                ? "No match — you can still type your city."
                : null}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: IndiaCityOption) => (
                <Autocomplete.Item
                  key={`${item.state}|${item.city}`}
                  value={item}
                  className="relative flex w-full cursor-default items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-white/10"
                  onClick={() => onChange(item.city, item.state)}
                >
                  <span>{item.city}</span>
                  {/* Only useful while searching all of India — with a state
                      chosen every row would repeat the same name. */}
                  {state ? null : (
                    <span className="shrink-0 text-xs text-zinc-400">
                      {item.state}
                    </span>
                  )}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
