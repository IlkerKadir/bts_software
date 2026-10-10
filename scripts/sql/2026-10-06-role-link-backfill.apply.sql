-- One-off (client 10.2026): give ROLE projects created on/after
-- 2026-10-06 00:00 Istanbul the roles linked to their creator's role.
-- Idempotent (ON CONFLICT DO NOTHING) — safe to re-run. Projects created
-- before the date are NOT touched (client requirement). Skips projects a
-- manager re-pointed to another role. Run the .preview.sql first; the
-- INSERT count should equal its rows with already_present = false.
BEGIN;
INSERT INTO "ProjectVisibleRole" ("id", "projectId", "roleId", "createdAt")
SELECT gen_random_uuid()::text, p.id, l."targetRoleId", CURRENT_TIMESTAMP
FROM "Project" p
JOIN "RoleProjectLink" l ON l."sourceRoleId" = p."visibleToRoleId"
WHERE p.visibility = 'ROLE'
  AND p."visibleToRoleId" IS NOT NULL
  AND p."createdAt" >= TIMESTAMP '2026-10-05 21:00:00'
  AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."createdById" AND u."roleId" = p."visibleToRoleId")
ON CONFLICT ("projectId", "roleId") DO NOTHING;
COMMIT;
