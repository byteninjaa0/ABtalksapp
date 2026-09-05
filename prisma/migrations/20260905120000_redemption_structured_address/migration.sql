-- Structured shipping address on marketplace redemptions.
--
-- Additive only. Every column is nullable with no DEFAULT, so existing rows are
-- untouched (a DEFAULT here would backfill a country onto legacy rows we never
-- actually collected one for). "shippingAddress" stays NOT NULL and remains the
-- field admin reads — new redemptions compose it from these parts.

ALTER TABLE "Redemption" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "city" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "state" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "pincode" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "country" TEXT;
