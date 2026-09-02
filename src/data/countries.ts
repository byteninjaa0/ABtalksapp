import countriesData from "@/data/countries.json";

export type CountryOption = { code: string; name: string };

/** ISO 3166-1 alpha-2, sorted by display name. A few UN/ISO treaty-style
 * names ("United States of America", "Korea, Republic of") are swapped for
 * the short names people actually search for — see
 * docs/plans/assets/107-build-countries.js for the override list and source. */
export const COUNTRIES: CountryOption[] = countriesData;
