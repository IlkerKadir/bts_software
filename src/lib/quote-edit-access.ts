import { canUserAccessQuote, type QuoteAccessShape } from '@/lib/quote-access';

/**
 * Single "can this user EDIT this quote" rule — header fields, items and
 * commercial terms all go through here (client 02.09: two Satış users on
 * the same project could edit each other's items but not the terms or
 * the header, because three different ad-hoc rules had grown).
 *
 * Rule: whoever can SEE the quote (creator, project visibility, managers)
 * may edit all of it. Status layers on top: ONAY_BEKLIYOR is approver-only.
 */
export interface QuoteEditUser {
  id: string;
  roleId?: string | null;
  role: { canApprove: boolean; canManageUsers: boolean };
}

export interface QuoteEditShape extends QuoteAccessShape {
  status: string;
}

/** Prisma `include` that loads exactly what the rule needs. */
export const quoteEditAccessInclude = {
  project: { include: { visibleTo: { select: { userId: true } } } },
} as const;

export interface QuoteEditDenial {
  status: 403;
  error: string;
}

export const QUOTE_EDIT_FORBIDDEN = 'Bu teklifi düzenleme yetkiniz bulunmamaktadır';
export const QUOTE_EDIT_PENDING_APPROVAL =
  'Onay bekleyen teklifler sadece onay yetkisi olan kullanıcılar tarafından düzenlenebilir';

/** Returns null when editing is allowed, otherwise the 403 payload to send. */
export function getQuoteEditDenial(user: QuoteEditUser, quote: QuoteEditShape): QuoteEditDenial | null {
  const isManager = user.role.canApprove || user.role.canManageUsers;
  if (!canUserAccessQuote(user.id, isManager, quote, user.roleId ?? undefined)) {
    return { status: 403, error: QUOTE_EDIT_FORBIDDEN };
  }
  if (quote.status === 'ONAY_BEKLIYOR' && !user.role.canApprove) {
    return { status: 403, error: QUOTE_EDIT_PENDING_APPROVAL };
  }
  return null;
}
