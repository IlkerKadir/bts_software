-- Add optional priceLabel column to QuoteItem. When set, the UI / PDF /
-- Excel exports render this literal text in place of the unit price and
-- total price columns, and calculation code treats the item as 0 price.
ALTER TABLE "QuoteItem" ADD COLUMN "priceLabel" TEXT;
