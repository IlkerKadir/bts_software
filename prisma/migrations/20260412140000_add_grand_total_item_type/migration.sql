-- Add the GRAND_TOTAL value to the QuoteItemType enum. Additive only,
-- no data mutation needed.
ALTER TYPE "QuoteItemType" ADD VALUE 'GRAND_TOTAL';
