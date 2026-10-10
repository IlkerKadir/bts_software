-- Multi-role project visibility (client 10.2026). Additive: two new tables,
-- no column dropped. Project.visibleToRoleId stays as the primary role.

CREATE TABLE "ProjectVisibleRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectVisibleRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectVisibleRole_projectId_roleId_key" ON "ProjectVisibleRole"("projectId", "roleId");
CREATE INDEX "ProjectVisibleRole_roleId_idx" ON "ProjectVisibleRole"("roleId");
ALTER TABLE "ProjectVisibleRole" ADD CONSTRAINT "ProjectVisibleRole_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVisibleRole" ADD CONSTRAINT "ProjectVisibleRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RoleProjectLink" (
    "id" TEXT NOT NULL,
    "sourceRoleId" TEXT NOT NULL,
    "targetRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleProjectLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleProjectLink_sourceRoleId_targetRoleId_key" ON "RoleProjectLink"("sourceRoleId", "targetRoleId");
CREATE INDEX "RoleProjectLink_targetRoleId_idx" ON "RoleProjectLink"("targetRoleId");
ALTER TABLE "RoleProjectLink" ADD CONSTRAINT "RoleProjectLink_sourceRoleId_fkey"
    FOREIGN KEY ("sourceRoleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleProjectLink" ADD CONSTRAINT "RoleProjectLink_targetRoleId_fkey"
    FOREIGN KEY ("targetRoleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lossless backfill: every ROLE project keeps exactly the role it has today.
INSERT INTO "ProjectVisibleRole" ("id", "projectId", "roleId", "createdAt")
SELECT gen_random_uuid()::text, "id", "visibleToRoleId", NOW()
FROM "Project"
WHERE "visibility" = 'ROLE' AND "visibleToRoleId" IS NOT NULL;
