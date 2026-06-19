-- STF — additive. TESLİMAT footer block (delivery timing text) on the STF.
-- Nullable, no default; snapshotted from the quote's `teslimat` commercial term.
ALTER TABLE "OrderConfirmation" ADD COLUMN "deliveryTime" TEXT;
