-- READ-ONLY preview (client 10.2026, multi-role project visibility).
-- Run AFTER deploy AND after the role link (e.g. Satış → Satış Direktörü)
-- is saved in Ayarlar > Roller. Lists ROLE projects created on/after
-- 2026-10-06 00:00 Istanbul (= 2026-10-05 21:00 UTC) and the linked role
-- each would gain. `already_present = true` rows will be skipped.
SELECT p.name AS project,
       (p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') AS created_istanbul,
       u."fullName" AS creator, src.name AS primary_role, tgt.name AS linked_role,
       EXISTS (SELECT 1 FROM "ProjectVisibleRole" v
               WHERE v."projectId" = p.id AND v."roleId" = l."targetRoleId") AS already_present
FROM "Project" p
JOIN "RoleProjectLink" l ON l."sourceRoleId" = p."visibleToRoleId"
JOIN "Role" src ON src.id = p."visibleToRoleId"
JOIN "Role" tgt ON tgt.id = l."targetRoleId"
LEFT JOIN "User" u ON u.id = p."createdById"
WHERE p.visibility = 'ROLE'
  AND p."visibleToRoleId" IS NOT NULL
  AND p."createdAt" >= TIMESTAMP '2026-10-05 21:00:00'
  AND EXISTS (SELECT 1 FROM "User" cu WHERE cu.id = p."createdById" AND cu."roleId" = p."visibleToRoleId")
ORDER BY p."createdAt", tgt.name;
