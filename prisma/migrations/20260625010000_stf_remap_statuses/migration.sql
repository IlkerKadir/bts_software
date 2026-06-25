-- STF: remap legacy statuses to the simplified set, and default new rows to TASLAK.
UPDATE "OrderConfirmation" SET status = 'TASLAK'     WHERE status = 'HAZIRLANIYOR';
UPDATE "OrderConfirmation" SET status = 'TAMAMLANDI' WHERE status IN ('ONAYLANDI', 'GONDERILDI');
ALTER TABLE "OrderConfirmation" ALTER COLUMN status SET DEFAULT 'TASLAK';
