import { NextResponse } from "next/server";
import { runSkillEvidenceSweep } from "@/features/skill/evidence-sweep";
import { logger } from "@/lib/logger";

/**
 * Plan 151 §20 — evidence is a domain fact, so this runs on its own schedule
 * and behind no ENABLE_GAMIFICATION_* flag. Public route: bearer-authed by
 * CRON_SECRET like the other crons, never `requireAdmin`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runSkillEvidenceSweep();
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    logger.error("[cron/skill-evidence] failed", { error: String(e) });
    return NextResponse.json(
      { ok: false, message: "Cron job failed." },
      { status: 500 },
    );
  }
}
