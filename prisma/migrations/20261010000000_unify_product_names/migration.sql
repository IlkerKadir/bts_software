-- Products — one-time data normalization (client 10.2026): Ürün Adı (name)
-- and Türkçe Adı (nameTr) become a single value, sourced from Türkçe Adı.
-- Quote rows are snapshots (QuoteItem.description) and are NOT touched.
-- No schema change; no unique constraint on name, so no conflicts.
-- "Blank" = NULL or only whitespace (incl. tab, NBSP, BOM — an explicit
-- class, since `\S` on postgres:16-alpine treats NBSP as non-space).

-- 0) Preserve English text: where Ürün Adı really differs (not just by
--    case/whitespace) from Türkçe Adı and the EN field is blank, the old
--    Ürün Adı (typically English) moves to EN first — EN quotes seed from
--    `nameEn || name`, so they keep today's text.
UPDATE "Product"
SET "nameEn" = "name"
WHERE "nameTr" ~ '[^[:space:]\u00a0\ufeff]'
  AND lower(btrim("name")) <> lower(btrim("nameTr"))
  AND ("nameEn" IS NULL OR "nameEn" !~ '[^[:space:]\u00a0\ufeff]');

-- 1) Where a Turkish name exists and differs, Ürün Adı takes it (fixes
--    products whose name was overwritten with English text by the import).
UPDATE "Product"
SET "name" = "nameTr", "updatedAt" = NOW()
WHERE "nameTr" ~ '[^[:space:]\u00a0\ufeff]' AND "name" <> "nameTr";

-- 2) Where Türkçe Adı is blank, it takes Ürün Adı (quote seeding already
--    fell back to name here, so behaviour is unchanged).
UPDATE "Product"
SET "nameTr" = "name", "updatedAt" = NOW()
WHERE "nameTr" IS NULL OR "nameTr" !~ '[^[:space:]\u00a0\ufeff]';
