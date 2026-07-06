-- Role-based project visibility (client 30.06):
-- new ROLE mode = everyone holding the selected role (+ managers) sees the project.
-- Purely additive: existing rows keep their visibility; default stays EVERYONE.
-- NOTE: the new enum value is never USED inside this migration (same-transaction
-- restriction on fresh enum values does not apply to ALTER TABLE below).
ALTER TYPE "ProjectVisibility" ADD VALUE IF NOT EXISTS 'ROLE';

ALTER TABLE "Project" ADD COLUMN "visibleToRoleId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_visibleToRoleId_fkey"
  FOREIGN KEY ("visibleToRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_visibleToRoleId_idx" ON "Project"("visibleToRoleId");
