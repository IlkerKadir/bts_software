-- Add optional per-SET currency. NULL = inherit the parent quote's
-- currency (existing behavior, no data backfill needed). Only SET rows
-- are expected to carry a non-null value; enforcement lives in the API
-- validation layer, not in a DB constraint, so we can loosen it later
-- without a migration.
ALTER TABLE "QuoteItem" ADD COLUMN "currency" TEXT;
