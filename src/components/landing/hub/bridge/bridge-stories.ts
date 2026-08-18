export type BridgeStoryKey = "candidates" | "abtalks" | "companies";

export type BridgeStory = {
  key: BridgeStoryKey;
  kicker: string;
  title: string;
  body?: string;
  items?: string[];
};

const CANDIDATE_ITEMS = [
  "Hackathons — weekend builds, judged and archived",
  "Cohorts — multi-week programs with mentors",
  "Challenges — scoped problems from real companies",
];

const COMPANY_ITEMS = [
  "Browse candidates by what they shipped",
  "Send us the role and the skills you need",
  "We build a cohort against that requirement",
];

export const BRIDGE_STORIES: BridgeStory[] = [
  {
    key: "candidates",
    kicker: "For the candidates",
    title: "Make yourself visible by building.",
    items: CANDIDATE_ITEMS,
  },
  {
    key: "abtalks",
    kicker: "The bridge",
    title: "ABTalks",
    body: "We run the programs, score the work, and match evidence to requirements. Profiles move only when the candidate releases them.",
  },
  {
    key: "companies",
    kicker: "For the companies",
    title: "Hire from proof, or commission it.",
    items: COMPANY_ITEMS,
  },
];

export const BRIDGE_TINTS: Record<BridgeStoryKey, string> = {
  candidates: "#B8C9D9",
  abtalks: "#A8A7BE",
  companies: "#E9AF96",
};

/* Must stay lighter than --hub-bg (#fbf9f7) or the idle top face disappears
   into the page and the slab reads as two floating shadow bands. */
export const BRIDGE_SLAB_IDLE = "#ffffff";
