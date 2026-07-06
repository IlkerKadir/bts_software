/**
 * Access control for STFs (OrderConfirmation). Mirrors the quote visibility
 * rule (`canUserAccessQuote` in quotes/[id]/route.ts) since an STF derives its
 * visibility from the quote it was created from (spec §10.3): managers see
 * everything; the STF's own creator has access; otherwise access follows the
 * source quote's creator / project visibility.
 */
import type { Prisma } from '@prisma/client';

export interface OrderForAccess {
  createdById: string;
  quote?: {
    createdById: string;
    project?: { visibility: string; visibleTo?: { userId: string }[] } | null;
  } | null;
}

export function canAccessOrder(
  order: OrderForAccess,
  userId: string,
  isManager: boolean
): boolean {
  // Managers (canApprove || canManageUsers) see everything.
  if (isManager) return true;
  // The STF's own creator always has access.
  if (order.createdById === userId) return true;
  // Otherwise fall back to the source quote's visibility.
  const quote = order.quote;
  if (quote) {
    if (quote.createdById === userId) return true;
    if (quote.project) {
      if (quote.project.visibility === 'EVERYONE') return true;
      if (quote.project.visibility === 'SPECIFIC_USERS') {
        if (quote.project.visibleTo?.some((a) => a.userId === userId)) return true;
      }
    }
  }
  return false;
}

/**
 * Prisma `where` mirror of `canAccessOrder` for the STF LIST query — the
 * exact counterpart of `quoteVisibilityWhere` (client 30.06: "Siparişlerde de
 * görünürlük olsun"). Managers get `{}` — no restriction.
 */
export function orderVisibilityWhere(user: {
  id: string;
  role: { canApprove: boolean; canManageUsers: boolean };
}): Prisma.OrderConfirmationWhereInput {
  if (user.role.canApprove || user.role.canManageUsers) {
    return {};
  }
  return {
    OR: [
      { createdById: user.id },
      { quote: { createdById: user.id } },
      { quote: { project: { visibility: 'EVERYONE' } } },
      {
        quote: {
          project: {
            visibility: 'SPECIFIC_USERS',
            visibleTo: { some: { userId: user.id } },
          },
        },
      },
    ],
  };
}

/**
 * STF statuses in which the full PUT edit (item replace + header/footer) is
 * permitted. An STF is editable only while it is a draft (TASLAK); once it is
 * completed (TAMAMLANDI) or cancelled (IPTAL) it is frozen — status changes
 * still go through PATCH (incl. "Taslağa geri çek" to reopen for editing).
 */
export const STF_EDITABLE_STATUSES: readonly string[] = ['TASLAK'];

export function isStfEditable(status: string): boolean {
  return STF_EDITABLE_STATUSES.includes(status);
}
