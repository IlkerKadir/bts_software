-- Teklif Takip (quote tracking) — all additive, no existing data touched.

-- CreateEnum
CREATE TYPE "QuotePriority" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('BUTCE_YETERSIZ', 'RAKIPTEN_PAHALI', 'RAKIP_MARKA_TERCIHI', 'TEKNIK_YETERSIZLIK', 'PROJE_IPTALI', 'ODEME_KOSULLARI');

-- CreateEnum
CREATE TYPE "QuoteInteractionType" AS ENUM ('TELEFON', 'EMAIL', 'YUZ_YUZE', 'ONLINE_TOPLANTI', 'FUAR');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "priority" "QuotePriority";
ALTER TABLE "Quote" ADD COLUMN "successPct" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "expectedOrderDate" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "lostReason" "LostReason";
ALTER TABLE "Quote" ADD COLUMN "lostCompetitor" TEXT;

-- CreateTable
CREATE TABLE "QuoteInteraction" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "QuoteInteractionType" NOT NULL,
    "note" TEXT NOT NULL,
    "reminderDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteInteraction_quoteId_idx" ON "QuoteInteraction"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteInteraction" ADD CONSTRAINT "QuoteInteraction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteInteraction" ADD CONSTRAINT "QuoteInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
