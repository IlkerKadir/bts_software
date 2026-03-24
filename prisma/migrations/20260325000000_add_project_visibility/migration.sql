-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('CREATOR_ONLY', 'SPECIFIC_USERS', 'EVERYONE');

-- AlterTable: Add visibility column with safe default
ALTER TABLE "Project" ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'CREATOR_ONLY';

-- CreateTable
CREATE TABLE "ProjectUserAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUserAccess_projectId_userId_key" ON "ProjectUserAccess"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectUserAccess" ADD CONSTRAINT "ProjectUserAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUserAccess" ADD CONSTRAINT "ProjectUserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
