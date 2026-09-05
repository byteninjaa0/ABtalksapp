import { z } from "zod";
import { isKnownIndianState } from "@/data/india-locations";

/**
 * The only country we ship to. Anything else is routed to SUPPORT_EMAIL by the
 * dialog copy rather than becoming an order we cannot fulfil.
 */
export const SHIPPING_COUNTRY = "India";
export const SHIPPING_SUPPORT_EMAIL = "team@abtalks.in";

/**
 * A Redemption's primary key, which is NOT one shape.
 *
 * The schema declares `id String @id @default(cuid())`, but `redeemItem` has
 * supplied its own id since the Points write-authority invert (ffce6235):
 *
 *   const redemptionId = randomUUID();
 *   await tx.redemption.create({ data: { id: redemptionId, ... } })
 *
 * An explicit id means the column default never runs, so every redemption made
 * from that commit onward is a UUID and every one before it is a cuid. Both are
 * live in production.
 *
 * `z.string().cuid()` alone was rejecting the UUIDs, and it is the FIRST thing
 * `updateRedemptionStatusAction` does — so Mark Shipped, Mark Fulfilled and
 * Cancel all failed on any recent order with Zod's own default message,
 * "Invalid cuid". Cancel failing also meant the SP refund never ran, since that
 * lives past this gate.
 *
 * Accepting both is the honest fix. Regenerating the ids is not an option: they
 * are already written into PointsLedger as `sourceId` and into its idempotency
 * keys (`redeem:<id>`, `redeem-refund:<id>`), so changing one would be a data
 * migration across the ledger, to correct nothing that is actually wrong.
 */
const redemptionId = z.union([z.string().uuid(), z.string().cuid()], {
  message: "Invalid redemption",
});

export const redeemItemSchema = z.object({
  // Unlike Redemption above, MarketplaceItem ids are left to the column
  // default, so they really are cuids.
  itemId: z.string().cuid("Invalid item"),
  recipientName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name")
    .max(120, "Name is too long"),
  addressLine1: z
    .string()
    .trim()
    .min(5, "Address line 1 looks too short")
    .max(200, "Address line 1 is too long"),
  addressLine2: z
    .string()
    .trim()
    .max(200, "Address line 2 is too long")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  city: z
    .string()
    .trim()
    .min(2, "Enter a city")
    .max(100, "City name is too long"),
  // Checked against the known list because it comes from a dropdown, unlike
  // `city`, which stays free text — no city list is complete and a student in
  // an unlisted town still has to be able to redeem.
  state: z
    .string()
    .trim()
    .min(1, "Select a state")
    .refine(isKnownIndianState, "Select a state from the list"),
  // Indian PIN codes are exactly six digits and never start with 0.
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  country: z
    .string()
    .trim()
    .refine(
      (value) => value === SHIPPING_COUNTRY,
      `We currently deliver only within India. For anywhere else, email ${SHIPPING_SUPPORT_EMAIL}.`,
    ),
  recipientPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone")
    .max(20, "Enter a valid phone"),
});

export type RedeemItemInput = z.infer<typeof redeemItemSchema>;

/**
 * The one printable address block written to `Redemption.shippingAddress`.
 *
 * Composed on the server from the validated parts rather than accepted from the
 * client, so the block admin ships against can never disagree with the columns
 * it was supposedly built from.
 */
export function composeShippingAddress(input: {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}): string {
  return [
    input.recipientName,
    input.addressLine1,
    input.addressLine2,
    `${input.city}, ${input.state} ${input.pincode}`,
    input.country,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");
}

export const updateRedemptionStatusSchema = z.object({
  redemptionId,
  nextStatus: z.enum(["SHIPPED", "FULFILLED", "CANCELLED"]),
  trackingNote: z.string().max(500).optional(),
});
