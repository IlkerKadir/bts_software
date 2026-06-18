-- STF (Sipariş Teyit Formu) — additive. No existing column changes type/nullability.

-- OrderConfirmation: revision chain
ALTER TABLE "OrderConfirmation" ADD COLUMN "parentOrderId" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "revisionNo" INTEGER NOT NULL DEFAULT 0;

-- OrderConfirmation: snapshot header
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerAddress" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerTaxInfo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "projectName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "quoteNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "refNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "formDate" TIMESTAMP(3);
ALTER TABLE "OrderConfirmation" ADD COLUMN "siparisNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "OrderConfirmation" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderConfirmation" ADD COLUMN "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- OrderConfirmation: footer blocks
ALTER TABLE "OrderConfirmation" ADD COLUMN "manufacturers" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "warranty" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "deliveryPlace" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "vatNote" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerApprovalName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "btsResponsibleName" TEXT;

-- OrderItem
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemType" "QuoteItemType" NOT NULL DEFAULT 'PRODUCT',
    "pozNo" TEXT,
    "code" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceLabel" TEXT,
    "parentItemId" TEXT,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderConfirmation_parentOrderId_idx" ON "OrderConfirmation"("parentOrderId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "OrderConfirmation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
