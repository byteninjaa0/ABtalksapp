import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getRecruiterProfileByToken } from "@/features/recruiter/get-recruiter-profile";
import { RecruiterPdf } from "@/features/recruiter/recruiter-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePdfFilename(fullName: string): string {
  const base =
    fullName
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "candidate";
  return `${base}-klymb.pdf`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const profile = await getRecruiterProfileByToken(token);
  if (!profile) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    createElement(RecruiterPdf, { profile }) as ReactElement<DocumentProps>,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safePdfFilename(profile.fullName)}"`,
    },
  });
}
