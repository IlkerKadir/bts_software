import type { QuoteItemData } from './QuoteItemRow';

/** A quote row as the quote detail page holds it (GET /api/quotes/[id]);
 *  decimals may still arrive as strings. */
export interface BrandSummarySourceItem {
  id: string;
  parentItemId?: string | null;
  itemType: QuoteItemData['itemType'];
  sortOrder: number;
  priceLabel?: string | null;
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  listPrice: number | string;
  katsayi: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  sectionDiscountPct?: number | string | null;
  vatRate: number | string;
  totalPrice: number | string;
  notes?: string | null;
  isManualPrice?: boolean;
  costPrice?: number | string | null;
  ekMaliyetDelta?: number | string | null;
  currency?: string | null;
}

/**
 * Detail-page rows → the rows BrandProfitSummary aggregates. Every field the
 * summary reads must be carried over here: the editor hands the summary its
 * full rows, so a field dropped on this side makes the two screens disagree.
 */
export function toBrandSummaryItems(items: readonly BrandSummarySourceItem[]): QuoteItemData[] {
  return items.map((item) => ({
    id: item.id,
    parentItemId: item.parentItemId ?? null,
    itemType: item.itemType,
    sortOrder: item.sortOrder,
    code: item.code,
    brand: item.brand,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    listPrice: Number(item.listPrice),
    katsayi: Number(item.katsayi),
    unitPrice: Number(item.unitPrice),
    discountPct: Number(item.discountPct),
    // Section discount lives on SUBTOTAL rows; the summary reads
    // it to compute net (discounted) revenue per brand.
    sectionDiscountPct:
      item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
    vatRate: Number(item.vatRate),
    totalPrice: Number(item.totalPrice),
    notes: item.notes,
    // "Dahildir" / "Tarafınızca Sağlanacaktır" rows are not part of the quote
    // total; without the label the summary counted them as priced rows and
    // showed a bigger total than the quote itself (client 18.11).
    priceLabel: item.priceLabel ?? null,
    isManualPrice: item.isManualPrice,
    costPrice: item.costPrice != null ? Number(item.costPrice) : null,
    ekMaliyetDelta: item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : null,
    currency: item.currency ?? null,
  }));
}
