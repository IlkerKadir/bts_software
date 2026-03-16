-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('HAZIRLANIYOR', 'ONAYLANDI', 'GONDERILDI', 'TAMAMLANDI', 'IPTAL');

-- AlterEnum
ALTER TYPE "QuoteItemType" ADD VALUE 'SUBTOTAL';

-- AlterTable: Quote - add refNo and protectionMap
ALTER TABLE "Quote" ADD COLUMN "protectionMap" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Quote" ADD COLUMN "refNo" TEXT;

-- AlterTable: QuoteItem - add model and parentItemId (self-relation for sub-rows)
ALTER TABLE "QuoteItem" ADD COLUMN "model" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "parentItemId" TEXT;

-- AlterTable: PriceHistory - make quoteId optional
ALTER TABLE "PriceHistory" ALTER COLUMN "quoteId" DROP NOT NULL;

-- CreateTable: ServiceSetPrice
CREATE TABLE "ServiceSetPrice" (
    "id" TEXT NOT NULL,
    "personCount" INTEGER NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSetPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrderConfirmation
CREATE TABLE "OrderConfirmation" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'HAZIRLANIYOR',
    "notes" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSetPrice_personCount_distanceKm_days_key" ON "ServiceSetPrice"("personCount", "distanceKm", "days");
CREATE INDEX "ServiceSetPrice_personCount_distanceKm_idx" ON "ServiceSetPrice"("personCount", "distanceKm");

CREATE UNIQUE INDEX "OrderConfirmation_orderNumber_key" ON "OrderConfirmation"("orderNumber");
CREATE INDEX "OrderConfirmation_quoteId_idx" ON "OrderConfirmation"("quoteId");
CREATE INDEX "OrderConfirmation_companyId_idx" ON "OrderConfirmation"("companyId");

-- AddForeignKey: QuoteItem.parentItemId -> QuoteItem.id (cascade delete)
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PriceHistory.quoteId -> Quote.id (set null on delete)
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: OrderConfirmation
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
