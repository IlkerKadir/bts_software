-- Rate-drift handling: lock a quote's rate matrix at explicit-rating
-- time and let ek maliyet lines carry their entry-time source currency
-- so the "Kurları Güncelle" flow can reconvert them consistently.
--
-- All three columns are nullable and additive. Existing rows get NULL
-- and fall through the legacy code paths (fresh TCMB on reopen, no
-- redistribution). No data rewrite required.

ALTER TABLE "Quote"          ADD COLUMN "rateSnapshot"  JSONB;
ALTER TABLE "QuoteEkMaliyet" ADD COLUMN "sourceCurrency" TEXT;
ALTER TABLE "QuoteEkMaliyet" ADD COLUMN "sourceAmount"  DECIMAL(12, 2);
