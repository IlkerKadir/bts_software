-- Products — one-time data normalization (client 10.2026): Ürün Adı (name)
-- and Türkçe Adı (nameTr) become a single value, sourced from Türkçe Adı.
-- Quote rows are snapshots (QuoteItem.description) and are NOT touched.
-- No schema change; no unique constraint on name, so no conflicts.

-- 0) Preserve English text: where Ürün Adı is about to be replaced and the
--    EN field is empty, the old Ürün Adı (typically English) moves to EN
--    first — EN quotes seed from `nameEn || name`, so they keep today's text
--    and nothing is lost.
UPDATE "Product"
SET "nameEn" = "name"
WHERE "nameTr" IS NOT NULL AND btrim("nameTr") <> '' AND "name" <> "nameTr"
  AND ("nameEn" IS NULL OR btrim("nameEn") = '');

-- 1) Where a Turkish name exists and differs, Ürün Adı takes it (fixes
--    products whose name was overwritten with English text by the import).
UPDATE "Product"
SET "name" = "nameTr", "updatedAt" = NOW()
WHERE "nameTr" IS NOT NULL AND btrim("nameTr") <> '' AND "name" <> "nameTr";

-- 2) Where Türkçe Adı is empty, it takes Ürün Adı (quote seeding already
--    fell back to name here, so behaviour is unchanged).
UPDATE "Product"
SET "nameTr" = "name", "updatedAt" = NOW()
WHERE "nameTr" IS NULL OR btrim("nameTr") = '';
