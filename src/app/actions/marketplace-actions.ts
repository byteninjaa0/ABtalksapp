"use server";

import { auth } from "@/auth";
import { redeemItemSchema } from "@/lib/validations/marketplace";
import { redeemItem } from "@/features/marketplace/redeem-item";

export async function redeemItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, reason: "auth", message: "Sign in required" };
  }
  const parsed = redeemItemSchema.safeParse({
    itemId: formData.get("itemId"),
    recipientName: formData.get("recipientName"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") ?? undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    country: formData.get("country"),
    recipientPhone: formData.get("recipientPhone"),
    selectedSize: formData.get("selectedSize") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      reason: "validation" as const,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  return redeemItem({ userId: session.user.id, ...parsed.data });
}
