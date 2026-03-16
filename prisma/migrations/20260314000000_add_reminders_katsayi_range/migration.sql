-- AlterEnum: QuoteItemType - add SET, remove SERVICE
-- NOTE: This requires replacing the enum. PostgreSQL ALTER TYPE ADD VALUE is safe.
-- The SERVICE variant removal is handled by first adding SET, then SERVICE stays unused.
ALTER TYPE "QuoteItemType" ADD VALUE IF NOT EXISTS 'SET';
ALTER TYPE "QuoteItemType" ADD VALUE IF NOT EXISTS 'SUBTOTAL';

-- DropTable: Remove obsolete service-related tables
DROP TABLE IF EXISTS "ServiceSetPrice" CASCADE;
DROP TABLE IF EXISTS "ServiceCostConfig" CASCADE;
DROP TABLE IF EXISTS "LiftingEquipmentRate" CASCADE;

-- AlterTable: Product - add katsayi range fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minKatsayi" DECIMAL(5,3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "maxKatsayi" DECIMAL(5,3);

-- AlterTable: Quote - add description field
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- AlterTable: CommercialTermTemplate - add highlight field
ALTER TABLE "CommercialTermTemplate" ADD COLUMN IF NOT EXISTS "highlight" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: QuoteCommercialTerm - add highlight field
ALTER TABLE "QuoteCommercialTerm" ADD COLUMN IF NOT EXISTS "highlight" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: QuoteEkMaliyet
CREATE TABLE IF NOT EXISTS "QuoteEkMaliyet" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteEkMaliyet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuoteEkMaliyet_quoteId_idx" ON "QuoteEkMaliyet"("quoteId");
ALTER TABLE "QuoteEkMaliyet" DROP CONSTRAINT IF EXISTS "QuoteEkMaliyet_quoteId_fkey";
ALTER TABLE "QuoteEkMaliyet" ADD CONSTRAINT "QuoteEkMaliyet_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Reminder
CREATE TABLE IF NOT EXISTS "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "quoteId" TEXT,
    "projectId" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Reminder_userId_isCompleted_dueDate_idx" ON "Reminder"("userId", "isCompleted", "dueDate");
CREATE INDEX IF NOT EXISTS "Reminder_dueDate_isCompleted_idx" ON "Reminder"("dueDate", "isCompleted");
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_userId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_quoteId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_projectId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
