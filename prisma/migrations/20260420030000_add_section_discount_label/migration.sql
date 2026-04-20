-- Add optional per-section discount label column. Null → renderers
-- default to "İskonto". User can customize per SUBTOTAL row.
ALTER TABLE "QuoteItem" ADD COLUMN "sectionDiscountLabel" TEXT;
