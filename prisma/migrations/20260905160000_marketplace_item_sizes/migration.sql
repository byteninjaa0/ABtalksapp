-- Per-item size options on the catalog, and the size chosen on a redemption.
--
-- Additive only.
--
-- "sizeOptions" is NOT NULL DEFAULT '{}' because an empty array is the honest
-- value for every existing item: none of them offered a size, and the redeem
-- dialog reads an empty list as "this item has no size". Contrast
-- "selectedSize", which is nullable — there NULL means "no size was recorded",
-- which is exactly the truth for redemptions placed before this shipped.
--
-- The Classic Tee's actual sizes arrive through the seed, not here, so the
-- catalog stays editable from prisma/content/marketplace.json:
--   npm run db:seed:marketplace

ALTER TABLE "MarketplaceItem" ADD COLUMN "sizeOptions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Redemption" ADD COLUMN "selectedSize" TEXT;
