import { z } from "zod";

/*
 * What the recruiter has typed so far, and where it goes.
 *
 * Nothing here is written to the server. The account fields reach
 * `registerRecruiterWithOtpAction` on the Verify step (or
 * `registerRecruiterAction` when a session already proves the address); the
 * optional company fields reach `updateRecruiterProfileAction` once the
 * recruiter is signed in.
 *
 * The draft lives in localStorage, on the device, for at most DRAFT_TTL_MS. It
 * used to live in sessionStorage, which was wrong for this flow rather than
 * merely conservative: Verify emails a 6-digit code, so leaving the tab is a
 * REQUIRED step, and on a phone that tab is routinely evicted — a code tapped
 * from the mail app opens a new one either way. The recruiter came back to a
 * blank welcome card and retyped all seven fields. Worse, `registered` was the
 * only record that the account already existed, so losing it turned a missed
 * sign-in into a full second pass that ended at "already registered".
 *
 * It holds a name and a work email, so: device-only, never sent to the server,
 * expired after a week, cleared the moment onboarding finishes — and it never
 * holds a code or a password.
 */

export const STEP_IDS = ["welcome", "identity", "company", "verify", "complete"] as const;
export type StepId = (typeof STEP_IDS)[number];

/** The three steps the progress rail names. Welcome and the finish sit outside. */
export const PROGRESS_STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "You" },
  { id: "company", label: "Company" },
  { id: "verify", label: "Verify" },
];

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"] as const;

export const INDUSTRIES = [
  "Software & SaaS",
  "IT services & consulting",
  "AI & data",
  "Fintech & banking",
  "E-commerce & retail",
  "Edtech",
  "Healthcare",
  "Manufacturing",
  "Media & marketing",
  "Staffing & recruitment",
  "Other",
] as const;

export const draftSchema = z.object({
  v: z.literal(1),
  step: z.enum(STEP_IDS),
  fullName: z.string().max(120),
  email: z.string().max(254),
  company: z.string().max(200),
  website: z.string().max(200),
  industry: z.string().max(80),
  companySize: z.string().max(40),
  companyLocation: z.string().max(120),
  newsletterOptIn: z.boolean(),
  /** The account exists. Verify can never run twice for this draft. */
  registered: z.boolean(),
});

export type OnboardingDraft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: OnboardingDraft = {
  v: 1,
  step: "welcome",
  fullName: "",
  email: "",
  company: "",
  website: "",
  industry: "",
  companySize: "",
  companyLocation: "",
  newsletterOptIn: true,
  registered: false,
};

const DRAFT_KEY = "klymb-recruiter-onboarding.v2";
/** The sessionStorage key this replaced. Only ever removed, never read. */
const LEGACY_DRAFT_KEY = "klymb-recruiter-onboarding";
/** Long enough to survive a distracted week; short enough not to be a record. */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The stored envelope. Separate from `draftSchema` on purpose: `savedAt` is
 * storage bookkeeping, not part of the draft the wizard passes around, and
 * adding it to the draft would put it in front of every step.
 */
const storedSchema = z.object({ savedAt: z.number(), draft: draftSchema });

export function readDraft(): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (Date.now() - parsed.data.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed.data.draft;
  } catch {
    return null;
  }
}

export function writeDraft(draft: OnboardingDraft): void {
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ savedAt: Date.now(), draft }),
    );
  } catch {
    // Private mode or a full quota: the flow still works, it just won't
    // survive leaving the page.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
  try {
    // A draft left by the sessionStorage version, in a tab old enough to still
    // hold one.
    window.sessionStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasCompanyExtras(draft: OnboardingDraft): boolean {
  return Boolean(
    draft.website.trim() ||
      draft.industry.trim() ||
      draft.companySize.trim() ||
      draft.companyLocation.trim(),
  );
}
