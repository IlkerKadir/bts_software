/**
 * Access control for STFs (OrderConfirmation). Mirrors the quote visibility
 * rule (`canUserAccessQuote` in quotes/[id]/route.ts) since an STF derives its
 * visibility from the quote it was created from (spec §10.3): managers see
 * everything; the STF's own creator has access; otherwise access follows the
 * source quote's creator / project visibility.
 */
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
 * STF statuses in which the full PUT edit (item replace + header/footer) is
 * permitted. Once an STF is sent to the customer (GONDERILDI) or terminal
 * (TAMAMLANDI/IPTAL) it is frozen — status changes still go through PATCH.
 */
export const STF_EDITABLE_STATUSES: readonly string[] = ['HAZIRLANIYOR', 'ONAYLANDI'];

export function isStfEditable(status: string): boolean {
  return STF_EDITABLE_STATUSES.includes(status);
}
