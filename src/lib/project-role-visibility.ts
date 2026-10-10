import type { Prisma } from '@prisma/client';

/**
 * Multi-role project visibility (client 10.2026). A ROLE-visibility
 * project is visible to its primary role (`visibleToRoleId`, kept for
 * rollback safety) and to every role in `visibleRoles`. All access checks
 * — quote, order, project — go through these two helpers so the in-memory
 * rule and the Prisma `where` rule can't drift apart.
 */
export interface RoleVisibleProject {
  visibility: string;
  visibleToRoleId?: string | null;
  /** Required on purpose: a load site that forgets to include it fails
   *  to compile instead of silently denying linked roles. */
  visibleRoles: { roleId: string }[];
}

export function projectRoleMatches(project: RoleVisibleProject, userRoleId?: string | null): boolean {
  if (project.visibility !== 'ROLE' || !userRoleId) return false;
  return (
    project.visibleToRoleId === userRoleId ||
    project.visibleRoles.some((r) => r.roleId === userRoleId)
  );
}

/** Prisma mirror of projectRoleMatches. Never call with an empty roleId
 *  (`{ some: { roleId: undefined } }` would match every project). */
export function projectRoleWhere(userRoleId: string): Prisma.ProjectWhereInput {
  return {
    visibility: 'ROLE',
    OR: [{ visibleToRoleId: userRoleId }, { visibleRoles: { some: { roleId: userRoleId } } }],
  };
}

/** Select fragment loading everything an access check needs from a project. */
export const projectAccessSelect = {
  visibility: true,
  visibleToRoleId: true,
  visibleTo: { select: { userId: true } },
  visibleRoles: { select: { roleId: true } },
} as const;

/**
 * Roles a NEW project should be visible to: the creator's role plus every
 * role linked to it in role settings ("Bu rolün projelerini şu roller de
 * görsün"). Primary (creator's) role first.
 */
export async function defaultVisibleRoleIds(
  db: { roleProjectLink: { findMany: (args: { where: { sourceRoleId: string }; select: { targetRoleId: true } }) => Promise<{ targetRoleId: string }[]> } },
  creatorRoleId: string,
): Promise<string[]> {
  const links = await db.roleProjectLink.findMany({
    where: { sourceRoleId: creatorRoleId },
    select: { targetRoleId: true },
  });
  return Array.from(new Set([creatorRoleId, ...links.map((l) => l.targetRoleId)]));
}
