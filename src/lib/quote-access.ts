/**
 * Quote visibility rule, shared by the quote detail route and the Teklif Takip
 * (tracking / interactions) routes so they all enforce the same boundary.
 *
 * Managers (canApprove || canManageUsers) see everything. Otherwise a user may
 * access a quote they created, or one whose project is visible to them.
 */
export interface QuoteAccessShape {
  createdById: string;
  project?: {
    visibility: string;
    visibleTo?: { userId: string }[];
  } | null;
}

export function canUserAccessQuote(
  userId: string,
  isManager: boolean,
  quote: QuoteAccessShape
): boolean {
  if (isManager) return true;
  if (quote.createdById === userId) return true;
  if (quote.project) {
    if (quote.project.visibility === 'EVERYONE') return true;
    if (
      quote.project.visibility === 'SPECIFIC_USERS' &&
      quote.project.visibleTo?.some((v) => v.userId === userId)
    ) {
      return true;
    }
  }
  return false;
}
