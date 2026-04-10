-- Add ek maliyet delta column to QuoteItem
-- Non-destructive: column is nullable, no existing data is modified
ALTER TABLE "QuoteItem" ADD COLUMN "ekMaliyetDelta" DECIMAL(12,2);
