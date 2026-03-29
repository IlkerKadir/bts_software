-- AlterTable: Make clientId optional on Project
ALTER TABLE "Project" ALTER COLUMN "clientId" DROP NOT NULL;

-- Change FK to SET NULL on delete
ALTER TABLE "Project" DROP CONSTRAINT "Project_clientId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
