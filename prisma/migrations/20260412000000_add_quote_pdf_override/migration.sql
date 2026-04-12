-- Add pdfOverrideHtml and pdfOverrideAt columns to Quote
-- Non-destructive: both columns are nullable, no existing data is modified
ALTER TABLE "Quote" ADD COLUMN "pdfOverrideHtml" TEXT;
ALTER TABLE "Quote" ADD COLUMN "pdfOverrideAt" TIMESTAMP(3);
