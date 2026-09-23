/**
 * A candidate's résumé file, for Platform Admin.
 *
 * The admin candidate record could name the stored file — "File: resume.pdf" —
 * and offer no way to open it. `CandidateResume.blobPathname` is private Vercel
 * Blob, and its only reader was `/api/profile/resume/file`, which resolves the
 * path from the session and therefore only ever serves the caller their own
 * document. That route's comment says admins reach résumés through the admin
 * surfaces; this is that surface.
 *
 * A Route Handler rather than a Server Action because the response is a binary
 * stream, which a Server Action cannot return.
 *
 * Three things hold this endpoint safe, and none of them are optional:
 *
 * 1. `getAdminContext` rather than `requireAdmin`. The latter redirects, which
 *    on a binary endpoint answers a denied request with an HTML login page at
 *    200. A non-admin gets a JSON 403 and a stranger gets a 401.
 * 2. The blob pathname is never in the URL. The parameter is the candidate's
 *    user id and the path is resolved server-side, so a caller cannot ask for
 *    an arbitrary object in the store.
 * 3. Every served file writes an `AdminAction` row first. Reading a private
 *    document about a person is an act worth a record, and an admin surface
 *    that reads without a trace is the thing the audit log exists to prevent.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin-auth";
import { writeAudit } from "@/features/admin/audit";
import { prisma } from "@/lib/db";
import { getResumeFilePathForAdmin } from "@/features/resume/service";
import { readResumeFile } from "@/features/resume/storage";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json(
      { ok: false as const, message: "Not authorised" },
      { status: 401 },
    );
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false as const, message: "Invalid candidate id" },
      { status: 400 },
    );
  }
  const candidateUserId = parsed.data.id;

  const stored = await getResumeFilePathForAdmin(candidateUserId);
  if (!stored) {
    return NextResponse.json(
      { ok: false as const, message: "No résumé file stored" },
      { status: 404 },
    );
  }

  const file = await readResumeFile(stored.pathname);
  if (!file) {
    return NextResponse.json(
      { ok: false as const, message: "No résumé file stored" },
      { status: 404 },
    );
  }

  // Before the bytes, not after: a stream that dies half-way through still
  // means an admin was handed this candidate's document.
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      targetUserId: candidateUserId,
      entityType: "CandidateResume",
      entityId: candidateUserId,
      actionType: "RESUME_FILE_VIEWED",
      reason: "Platform Admin opened the candidate's résumé file.",
      metadata: { fileName: stored.fileName },
    });
  });

  // Quoting and stripping keeps a filename with a comma or a quote in it from
  // splitting the header. The name is already restricted upstream.
  const safeName = stored.fileName.replace(/["\\\r\n]/g, "");

  return new NextResponse(file.stream, {
    headers: {
      "content-type": file.contentType || "application/pdf",
      "content-length": String(file.size),
      "content-disposition": `inline; filename="${safeName}"`,
      // Private to one admin session; never a shared cache, never a CDN copy.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
