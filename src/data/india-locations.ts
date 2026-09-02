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
