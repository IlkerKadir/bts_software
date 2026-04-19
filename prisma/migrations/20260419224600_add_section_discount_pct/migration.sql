-- Add per-section discount column to QuoteItem. Nullable; only meaningful
-- on SUBTOTAL rows. Existing quotes continue to use Quote.discountPct +
-- Quote.discountScopeSubtotalId until scripts/migrate-per-subtotal-discount.ts
-- backfills this column, after which the new calculation engine takes over.
ALTER TABLE "QuoteItem" ADD COLUMN "sectionDiscountPct" DECIMAL(5,2);
