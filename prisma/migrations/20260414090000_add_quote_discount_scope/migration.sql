-- Scoped discount: add a nullable pointer to a SUBTOTAL QuoteItem.
--
-- Null means "apply discount to the whole quote" (legacy behavior and
-- the default for every existing row). When set, the persistence layer
-- only subtracts the discount from the sum of priced items in that
-- SUBTOTAL's section. The reference is kept as a plain String (cuid)
-- rather than a foreign key so deleting a SUBTOTAL item doesn't cascade
-- into the quote; the recalc path auto-heals the stale pointer to null
-- on the next save.

ALTER TABLE "Quote" ADD COLUMN "discountScopeSubtotalId" TEXT;
