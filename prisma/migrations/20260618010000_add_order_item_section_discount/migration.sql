-- STF Phase 2 — additive. Per-section discount snapshot on OrderItem.
-- Only meaningful on SUBTOTAL rows; nullable, no default needed.
ALTER TABLE "OrderItem" ADD COLUMN "sectionDiscountPct" DECIMAL(5,2);
ALTER TABLE "OrderItem" ADD COLUMN "sectionDiscountLabel" TEXT;
