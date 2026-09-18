"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  accomplishmentsSchema,
  basicInfoSchema,
  educationSectionSchema,
  experienceSectionSchema,
  linksSectionSchema,
  mergeCodingProfileLinks,
  preferencesSchema,
  projectSectionSchema,
  resolveSkillSchema,
  skillSectionSchema,
} from "@/lib/validations/candidate-profile";
import {
  saveAccomplishments,
  saveBasicInfo,
  saveEducation,
  saveExperience,
  saveLinks,
  savePreferences,
  saveProjects,
  saveSkillClaims,
} from "@/repositories/candidate-detail";
import {
  deleteAvatarBlob,
  isAvatarStorageConfigured,
  isOurAvatarUrl,
  storeAvatarFile,
} from "@/features/profile/avatar-storage";
import { isOtpVerificationRequired } from "@/lib/feature-flags";
import { isIndianPhone } from "@/lib/validations/phone";
import { resolveOrCreateSkill } from "@/features/skill/resolve-skill";
import type { SkillOption } from "@/features/skill/search-skills";

/**
 * One failed field, addressed the way the form addresses it: a dotted path such
 * as `rows.1.expiresYear`.
 *
 * The schemas already know exactly which field each rule is about — every
 * `addIssue` here carries a `path`. That knowledge used to be flattened into a
 * single sentence for a toast ("Entry 2: This certificate cannot expire before
 * it was issued"), which landed in a corner of the screen, far from the field
 * it described and on top of whatever was underneath. Returning the path lets
 * the form put the sentence under the input it belongs to.
 */
export type FieldIssue = { path: string; message: string };

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; issues?: FieldIssue[] };

/** "expiresYear" → "Expires year", so an error never shows a code name. */
function humanField(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * One readable sentence for the toast.
 *
 * Messages written in the schema already read as sentences ("This certificate
 * cannot expire before it was issued"), so bolting the field name onto the
 * front of them produced "expiresYear — This certificate…". The field name is
 * only added when the message is a bare Zod default that would otherwise say
 * nothing about what to fix.
 */
/** Every issue, as form field paths. Array indices keep their position. */
function fieldIssues(error: z.ZodError): FieldIssue[] {
  const out: FieldIssue[] = [];
  const seen = new Set<string>();
  for (const issue of error.issues) {
    if (issue.path.length === 0) continue;
    const path = issue.path.join(".");
    // One message per field: the first rule to fire is the one to fix.
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, message: issue.message });
  }
  return out;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Something in this section is not valid.";

  // Row index is far more useful than a bare field name in a repeatable list.
  const rowIndex = issue.path.find((p) => typeof p === "number");
  const field = [...issue.path].reverse().find((p) => typeof p === "string");
  const where = typeof rowIndex === "number" ? `Entry ${rowIndex + 1}: ` : "";

  const message = issue.message.trim();
  const readsAsSentence = /^[A-Z]/.test(message) && message.includes(" ");
  if (readsAsSentence || !field) return `${where}${message}`;
  return `${where}${humanField(String(field))} — ${message}`;
}

/**
 * Every section save runs through here: authenticate, validate at the boundary,
 * write, revalidate. Sections are saved independently so a validation error in
 * one repeatable list never discards a candidate's work in another.
 */
async function runSection<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  label: string,
  write: (userId: string, value: z.infer<S>) => Promise<void>,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: firstIssue(parsed.error),
      issues: fieldIssues(parsed.error),
    };
  }

  try {
    await write(session.user.id, parsed.data);
  } catch (error) {
    logger.error(`[profile] ${label} save failed`, {
      userId: session.user.id,
      error: String(error),
    });
    return { ok: false, message: "Could not save. Please try again." };
  }

  const { scheduleGamificationEvent } = await import(
    "@/features/gamification/record-event"
  );
  scheduleGamificationEvent({
    type: "profile.section_completed",
    userId: session.user.id,
    sourceType: "CandidateProfile",
    sourceId: `${session.user.id}:${label}`,
    scopeKey: `${session.user.id}:${label}`,
    occurredAt: new Date(),
    payload: { sectionKey: label },
  });

  revalidatePath("/profile");
  return { ok: true };
}

export async function saveBasicInfoAction(raw: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = basicInfoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: firstIssue(parsed.error),
      issues: fieldIssues(parsed.error),
    };
  }

  const value = parsed.data;
  const phone = value.phone === "" ? null : value.phone;

  if (isOtpVerificationRequired()) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { phone: true, phoneVerified: true },
    });
    const effectivePhone = phone ?? profile?.phone ?? null;
    if (
      effectivePhone &&
      isIndianPhone(effectivePhone) &&
      !profile?.phoneVerified
    ) {
      return {
        ok: false,
        message: "Please verify your phone number to continue.",
      };
    }
    // Empty India-intent: OTP required and still unverified.
    if (!effectivePhone && !profile?.phoneVerified) {
      return {
        ok: false,
        message: "Please verify your phone number to continue.",
      };
    }
  }

  try {
    await saveBasicInfo(session.user.id, {
      fullName: value.fullName,
      phone,
      headline: value.headline,
      summary: value.summary,
      locationCity: value.locationCity,
      locationRegion: value.locationRegion,
      countryCode: value.countryCode,
      gender: value.gender,
      primaryPersona: value.primaryPersona,
    });
  } catch (error) {
    logger.error("[profile] basic-info save failed", {
      userId: session.user.id,
      error: String(error),
    });
    return { ok: false, message: "Could not save. Please try again." };
  }

  const { scheduleGamificationEvent } = await import(
    "@/features/gamification/record-event"
  );
  scheduleGamificationEvent({
    type: "profile.section_completed",
    userId: session.user.id,
    sourceType: "CandidateProfile",
    sourceId: `${session.user.id}:basic`,
    scopeKey: `${session.user.id}:basic`,
    occurredAt: new Date(),
    payload: { sectionKey: "basic" },
  });

  revalidatePath("/profile");
  return { ok: true };
}

export async function saveExperienceAction(
  raw: unknown,
): Promise<ActionResult> {
  return runSection(experienceSectionSchema, raw, "experience", (userId, value) =>
    saveExperience(userId, value.rows, value.hasNoWorkExperience),
  );
}

export async function saveEducationAction(raw: unknown): Promise<ActionResult> {
  return runSection(educationSectionSchema, raw, "education", (userId, value) =>
    saveEducation(userId, value.rows),
  );
}

export async function saveProjectsAction(raw: unknown): Promise<ActionResult> {
  return runSection(projectSectionSchema, raw, "projects", (userId, value) =>
    saveProjects(userId, value.rows),
  );
}

export async function saveSkillsAction(raw: unknown): Promise<ActionResult> {
  return runSection(skillSectionSchema, raw, "skills", (userId, value) =>
    saveSkillClaims(userId, value.claims),
  );
}

export type ResolveSkillResult =
  | { ok: true; data: SkillOption }
  | { ok: false; message: string };

export async function resolveSkillAction(
  raw: unknown,
): Promise<ResolveSkillResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = resolveSkillSchema.safeParse(raw);
  if (!parsed.success) {
    // Not a form field — this is one typed skill name, so the message is all
    // there is to say and the combobox shows it inline itself.
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    const skill = await resolveOrCreateSkill(parsed.data.name);
    if (!skill) {
      return { ok: false, message: "Please enter a skill name." };
    }
    return { ok: true, data: skill };
  } catch (error) {
    logger.error("[profile] resolve skill failed", {
      userId: session.user.id,
      error: String(error),
    });
    return { ok: false, message: "Could not add that skill. Please try again." };
  }
}

/**
 * Accomplishments: the external certification list and the awards prose, saved
 * together because the section is one form.
 *
 * Verified Accomplishments are derived from platform records and deliberately
 * have no write path — nothing in this payload can add, edit or remove one.
 */
export async function saveAccomplishmentsAction(
  raw: unknown,
): Promise<ActionResult> {
  return runSection(
    accomplishmentsSchema,
    raw,
    "accomplishments",
    (userId, value) =>
      saveAccomplishments(userId, { rows: value.rows, awards: value.awards }),
  );
}

export async function saveLinksAction(raw: unknown): Promise<ActionResult> {
  return runSection(linksSectionSchema, raw, "links", (userId, value) =>
    saveLinks(userId, {
      linkedinUrl: value.linkedinUrl,
      githubUsername: value.githubUsername,
      portfolioUrl: value.portfolioUrl,
      resumeUrl: value.resumeUrl,
      extra: mergeCodingProfileLinks(value),
    }),
  );
}

export async function savePreferencesAction(
  raw: unknown,
): Promise<ActionResult> {
  return runSection(preferencesSchema, raw, "preferences", (userId, value) =>
    savePreferences(userId, value),
  );
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sniffImageType(
  bytes: Uint8Array,
): { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" } | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export async function uploadAvatarAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }
  const userId = session.user.id;

  if (!isAvatarStorageConfigured()) {
    logger.warn("[avatar] upload attempted while storage is unconfigured");
    return { ok: false, message: "Photo upload is not available right now." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a photo to upload." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      message: "That file is too large. Please choose a photo under 2 MB.",
    };
  }
  if (file.type === "image/svg+xml" || !AVATAR_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Please choose a JPEG, PNG, or WebP photo.",
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    logger.error("[avatar] failed to read upload", {
      userId,
      error: String(error),
    });
    return { ok: false, message: "Could not read that file. Please try again." };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed.mime !== file.type) {
    return {
      ok: false,
      message: "Please choose a JPEG, PNG, or WebP photo.",
    };
  }

  const contentHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    const url = await storeAvatarFile({
      userId,
      contentHash,
      ext: sniffed.ext,
      bytes,
      mimeType: sniffed.mime,
    });
    if (!url) {
      return { ok: false, message: "Photo upload is not available right now." };
    }

    if (existing?.image && isOurAvatarUrl(existing.image) && existing.image !== url) {
      await deleteAvatarBlob(existing.image);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { image: url },
      select: { id: true },
    });
  } catch (error) {
    logger.error("[avatar] upload failed", {
      userId,
      error: String(error),
    });
    return { ok: false, message: "Could not save. Please try again." };
  }

  revalidatePath("/profile");
  return { ok: true };
}
