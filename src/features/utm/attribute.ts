import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseCookie, toColumns, UTM_COOKIE, type UtmColumns } from "@/lib/utm";

/**
 * T-254 first-touch attribution write. Reads the klymb_utm cookie set by
 * `UtmCapture` on the landing page and writes the five UTM columns onto the
 * user row — but ONLY if the row currently has no UTM values. This is what
 * makes it first-touch: the second, third, nth signup path attempt does not
 * overwrite the columns.
 *
 * The cookie is deliberately NOT deleted after — a user who signs up but
 * doesn't finish onboarding may return, and the cookie still carries the
 * original campaign.
 *
 * All failures are swallowed and logged — attribution is best-effort and
 * must never fail signup.
 */
export async function attributeUtmToUser(userId: string): Promise<{
  written: boolean;
  columns: UtmColumns | null;
}> {
  try {
    const store = await cookies();
    const raw = store.get(UTM_COOKIE)?.value;
    if (!raw) return { written: false, columns: null };

    const parsed = parseCookie(decodeURIComponent(raw));
    if (!parsed) return { written: false, columns: null };

    const columns = toColumns(parsed.v);
    if (
      columns.utmSource === null &&
      columns.utmMedium === null &&
      columns.utmCampaign === null &&
      columns.utmTerm === null &&
      columns.utmContent === null
    ) {
      return { written: false, columns };
    }

    // First-touch guard: only write when every column is currently null.
    // updateMany + WHERE clause makes this a single atomic write.
    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmTerm: null,
        utmContent: null,
      },
      data: {
        ...columns,
        utmCapturedAt: new Date(parsed.at),
      },
    });

    return { written: result.count > 0, columns };
  } catch (error) {
    logger.error("[utm] attribute failed", {
      userId,
      error: String(error),
    });
    return { written: false, columns: null };
  }
}
