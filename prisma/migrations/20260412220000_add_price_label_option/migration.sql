-- Create the PriceLabelOption catalog table. QuoteItem.priceLabel
-- remains a free-form string (no FK), so deleting a row here does not
-- affect quotes that already stored the literal text.
CREATE TABLE "PriceLabelOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceLabelOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceLabelOption_label_key" ON "PriceLabelOption"("label");

-- Seed the two options that were previously hardcoded in QuoteItemRow.tsx
-- so existing quote editors keep showing them.
INSERT INTO "PriceLabelOption" ("id", "label", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('seed_tarafinizca', 'TARAFINIZCA SAĞLANACAKTIR', 0, true, NOW(), NOW()),
    ('seed_dahildir',    'FİYATA DAHİLDİR',            1, true, NOW(), NOW())
ON CONFLICT ("label") DO NOTHING;
