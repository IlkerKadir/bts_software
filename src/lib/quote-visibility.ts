/**
 * Quote visibility helpers.
 *
 * Regular users see a quote only if they created it, or if the
 * quote's project has `EVERYONE` visibility, or if the user has
 * been explicitly granted access through `ProjectUserAccess`.
 *
 * Managers (`canApprove` or `canManageUsers`) bypass the filter
 * entirely — they see every quote in the system.
 *
 * The same logic lives in the quotes GET route; this module exists
 * so dashboard cards, profit summaries, and other aggregations can
 * apply the same scope without duplicating the conditions.
 */

import { Prisma } from '@prisma/client';

interface UserLike {
  id: string;
  /** The user's role id — drives the ROLE visibility mode. Optional so
   *  pre-existing callers that only carry the permission flags keep working
   *  (they simply never match ROLE-visible projects). */
  roleId?: string;
  role: {
    canApprove: boolean;
    canManageUsers: boolean;
  };
}

export function isQuoteVisibilityManager(user: UserLike): boolean {
  return user.role.canApprove || user.role.canManageUsers;
}

/**
 * Return a `Prisma.QuoteWhereInput` that restricts results to
 * quotes the given user is allowed to see. Returns an empty object
 * for managers, meaning "no restriction".
 */
export function quoteVisibilityWhere(user: UserLike): Prisma.QuoteWhereInput {
  if (isQuoteVisibilityManager(user)) {
    return {};
  }

  return {
    OR: [
      { createdById: user.id },
      { project: { visibility: 'EVERYONE' } },
      {
        project: {
          visibility: 'SPECIFIC_USERS',
          visibleTo: { some: { userId: user.id } },
        },
      },
      // ROLE mode (client 30.06): everyone holding the project's
      // visibleToRole (+ managers, handled above) sees it.
      ...(user.roleId
        ? [{ project: { visibility: 'ROLE' as const, visibleToRoleId: user.roleId } }]
        : []),
    ],
  };
}
