import "server-only";
import { put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Workshop poster storage on Vercel Blob.
 *
 * **STATUS: NOT VERIFIED. `put()` has never executed.** No Blob credentials
 * exist in the platform environment, so every upload currently returns the
 * "not configured" message below rather than storing anything. Before treating
 * upload as working, `avatar_READ_WRITE_TOKEN` must be present AND scoped to a
 * PUBLIC store in the deployed environment, and a real upload exercised.
 *
 * Setting a poster by PATH is a separate, working capability and does not
 * depend on any of this — see "Uploading is optional" below. Posters ship as
 * repo files under `public/workshop/posters/` today.
 *
 * **Reuses the avatar store deliberately.** Posters are public marketing
 * images — the hero renders `<img src>` directly for signed-out traffic —
 * which is the same access class the avatar store is already provisioned for.
 * The résumé store is the wrong home (it is private-only by design), and a
 * third store would be new infrastructure for no gain. Only the pathname
 * prefix separates them; splitting later means changing TOKEN_ENV here and
 * nothing else.
 *
 * **Project-specific env names**, same reason as the other two stores: the
 * names are mixed-case and the token is passed EXPLICITLY on every call, or
 * the SDK falls back to `BLOB_READ_WRITE_TOKEN` and fails with "No blob
 * credentials found".
 *
 * **Uploading is optional.** `posterSrc` also accepts a plain public path —
 * every seeded workshop still carries `/workshop/posters/*.jpg` — so an
 * environment with no blob credentials can still set a poster. That is not a
 * fallback bolted on: it is how the existing posters work today, and dropping
 * it would break them.
 *
 * Pathname is `workshop/posters/<sha256>.<ext>` — content-addressed, so
 * re-uploading the same file overwrites in place rather than accumulating
 * copies, and built only from server-side values.
 */

/** Provisioned by the team under this exact name. Do not rename. */
const TOKEN_ENV = "avatar_READ_WRITE_TOKEN";

const MAX_BYTES = 4 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function blobToken(): string | undefined {
  const value = process.env[TOKEN_ENV];
  return value && value.length > 0 ? value : undefined;
}

export function isPosterStorageConfigured(): boolean {
  return Boolean(blobToken());
}

export type PosterUploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function uploadPoster(file: File): Promise<PosterUploadResult> {
  const token = blobToken();
  if (!token) {
    return {
      ok: false,
      message:
        "Image uploads are not configured in this environment. Paste a poster URL or path instead.",
    };
  }

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return { ok: false, message: "Poster must be a JPG, PNG or WebP image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Poster must be 4 MB or smaller." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");
    const { url } = await put(`workshop/posters/${hash}.${ext}`, bytes, {
      access: "public",
      token,
      contentType: file.type,
      // Content-addressed: the same bytes always land on the same pathname, so
      // re-uploading should replace rather than get a random suffix.
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { ok: true, url };
  } catch (error) {
    logger.error("Workshop poster upload failed", { error: String(error) });
    return { ok: false, message: "Upload failed. Try again." };
  }
}
