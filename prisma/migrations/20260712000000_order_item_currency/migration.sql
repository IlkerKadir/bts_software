-- Mixed-currency SET support on STFs (client 12.07): a TRY-priced SET in a
-- EUR quote printed as "9.000,00 €" and its raw TRY amount was summed into
-- EUR section totals. Purely additive: NULL = row is in the STF's currency
-- (all existing rows), current behavior unchanged.
ALTER TABLE "OrderItem" ADD COLUMN "currency" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "totalPriceInOrderCurrency" DECIMAL(12,2);
