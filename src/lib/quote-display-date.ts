/**
 * Resolves the date that customer-facing exports (PDF, Excel) should
 * show as the quote's "Tarih". Once a quote has been approved at any
 * point, the displayed date follows the (latest) approval timestamp —
 * not the original draft creation date. While the quote is still in a
 * pre-approval state (TASLAK, ONAY_BEKLIYOR), `createdAt` is shown.
 *
 * The state machine allows ONAYLANDI → TASLAK (Onayı Geri Çek) without
 * clearing `approvedAt`, so a TASLAK row may still carry a stale
 * approval timestamp from a previous lifecycle. Treat those as
 * pre-approval and fall back to `createdAt`.
 */
const PRE_APPROVAL_STATUSES = new Set(['TASLAK', 'ONAY_BEKLIYOR']);

export function getQuoteDisplayDate<T extends Date | string>(quote: {
  createdAt: T;
  approvedAt: T | null | undefined;
  status: string;
}): T {
  if (quote.approvedAt && !PRE_APPROVAL_STATUSES.has(quote.status)) {
    return quote.approvedAt;
  }
  return quote.createdAt;
}
