import { NextResponse } from "next/server";
import { isGamificationEventsEnabled } from "@/lib/feature-flags";
import { runGamificationSweep } from "@/features/gamification/sweep/run";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  if (!isGamificationEventsEnabled()) {
    return NextResponse.json({ ok: true, data: { skipped: true } });
  }

  try {
    const result = await runGamificationSweep();
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    logger.error("[cron/gamification-sweep] failed", { error: String(e) });
    return NextResponse.json(
      { ok: false, message: "Cron job failed." },
      { status: 500 },
    );
  }
}
