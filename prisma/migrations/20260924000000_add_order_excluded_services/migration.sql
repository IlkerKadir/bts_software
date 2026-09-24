-- STF — additive, nullable. "Dahil Olmayan Hizmetler" block: seeded from the
-- quote's DAHIL_OLMAYAN commercial terms at STF creation, editable in the STF
-- editor, printed above NOTLAR on the STF PDF/Excel (client 02.09).
ALTER TABLE "OrderConfirmation" ADD COLUMN "excludedServices" TEXT;
