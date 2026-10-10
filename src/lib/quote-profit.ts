import { calculateQuoteProfitSummary, type QuoteProfitSummary } from '@/lib/quote-calculations';

type Num = number | string | { toString(): string } | null | undefined;

/** Minimal quote shape (Prisma row) needed to compute its profit. Items
 *  must be in sortOrder — the section-discount walker is positional. */
export interface ProfitQuoteInput {
  currency: string;
  exchangeRate: Num;
  protectionPct: Num;
  items: Array<{
    id: string;
    totalPrice: Num;
    costPrice: Num;
    ekMaliyetDelta: Num;
    listPrice: Num;
    quantity: Num;
    itemType: string;
    parentItemId: string | null;
    priceLabel: string | null;
    currency: string | null;
    sectionDiscountPct: Num;
  }>;
}

const n = (v: Num): number => (v == null ? 0 : Number(v));

/**
 * Profit summary of one quote in its own currency — THE single mapping
 * from DB rows to calculateQuoteProfitSummary. Shared by the quote detail
 * API and the dashboard so the two can't drift again (the dashboard had a
 * stale copy that ignored ek maliyet, CUSTOM costs and SET quantities).
 */
export function computeQuoteProfit(quote: ProfitQuoteInput): QuoteProfitSummary {
  const mapped = quote.items.map((item) => {
    // Include ek maliyet delta in the effective cost price
    const baseCost = item.costPrice != null ? n(item.costPrice) : null;
    const delta = item.ekMaliyetDelta != null ? n(item.ekMaliyetDelta) : 0;
    const effectiveCost = delta > 0 ? (baseCost ?? 0) + delta : baseCost;
    return {
      id: item.id,
      totalPrice: n(item.totalPrice),
      costPrice: effectiveCost,
      listPrice: item.listPrice != null ? n(item.listPrice) : null,
      quantity: n(item.quantity),
      itemType: item.itemType,
      parentItemId: item.parentItemId,
      priceLabel: item.priceLabel,
      currency: item.currency ?? null,
      // SUBTOTAL rows carry the section discount
      sectionDiscountPct: item.sectionDiscountPct != null ? n(item.sectionDiscountPct) : null,
    };
  });
  // Currency ctx only when a SET has its own currency (mixed quote).
  const hasMixedCurrency = mapped.some((i) => i.currency && i.currency !== quote.currency);
  const protectionPct = n(quote.protectionPct);
  const protectedRate = n(quote.exchangeRate) || 1;
  const baseForeignRate = protectionPct > 0 ? protectedRate / (1 + protectionPct / 100) : protectedRate;
  const ctx = hasMixedCurrency ? { quoteCurrency: quote.currency, baseForeignRate } : undefined;
  return calculateQuoteProfitSummary(mapped, 0, ctx);
}
