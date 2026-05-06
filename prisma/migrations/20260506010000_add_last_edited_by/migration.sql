-- Quote.lastEditedById tracks who pulled an ONAYLANDI quote back to
-- TASLAK via the status dropdown. Display layer ("Hazırlayan" field
-- on view page) prefers this over `createdById` when set, so the
-- original creator's data is never overwritten.

ALTER TABLE "Quote" ADD COLUMN "lastEditedById" TEXT;
ALTER TABLE "Quote" ADD COLUMN "lastEditedAt" TIMESTAMP(3);

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_lastEditedById_fkey"
  FOREIGN KEY ("lastEditedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
