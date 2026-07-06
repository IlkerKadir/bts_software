import { footerDefaultsFromTerms, type TermLike } from './stf-footer-defaults';

export interface QuoteItemForSnapshot {
  /** Quote item id — used to seat SET children right behind their parent. */
  id: string;
  itemType: string;
  sortOrder: number;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
}

export interface QuoteForSnapshot {
  quoteNumber: string;
  refNo: string | null;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  company: { name: string; address: string | null; phone: string | null; taxNumber: string | null };
  project: { name: string } | null;
  items: QuoteItemForSnapshot[];
  commercialTerms: TermLike[];
}

const POZ_TYPES = new Set(['PRODUCT', 'SET', 'CUSTOM']);

export interface StfHeader {
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxInfo: string | null;
  projectName: string | null;
  quoteNo: string;
  refNo: string | null;
  formDate: Date;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  manufacturers: string | null;
  paymentTerms: string | null;
  deliveryPlace: string | null;
  deliveryTime: string | null;
  warranty: string | null;
  vatNote: string | null;
  notes: string | null;
}

export interface StfItem {
  sortOrder: number;
  itemType: string;
  pozNo: string | null;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
}

export function buildStfSnapshot(
  quote: QuoteForSnapshot,
  formDate: Date
): { header: StfHeader; items: StfItem[] } {
  const footer = footerDefaultsFromTerms(quote.commercialTerms);

  const header: StfHeader = {
    customerName: quote.company.name,
    customerAddress: quote.company.address,
    customerPhone: quote.company.phone,
    customerTaxInfo: quote.company.taxNumber,
    projectName: quote.project?.name ?? null,
    quoteNo: quote.quoteNumber,
    refNo: quote.refNo,
    formDate,
    currency: quote.currency,
    discountTotal: quote.discountTotal,
    grandTotal: quote.grandTotal,
    ...footer,
  };

  // Seat SET children directly behind their parent. Quote sortOrder does NOT
  // guarantee adjacency (the quote editor nests children via parentItemId and
  // ignores their global sortOrder — live data has ties/gaps), so a flat
  // sortOrder render scattered "*" rows far from their SET (client: STF 6003,
  // poz-39 set's breakdown printed under poz 26). Children whose parent isn't
  // in the list keep their flat position.
  const sorted = quote.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const knownIds = new Set(sorted.map((it) => it.id));
  const childrenByParent = new Map<string, QuoteItemForSnapshot[]>();
  const flow: QuoteItemForSnapshot[] = [];
  for (const it of sorted) {
    if (it.parentItemId && knownIds.has(it.parentItemId)) {
      const list = childrenByParent.get(it.parentItemId) ?? [];
      list.push(it);
      childrenByParent.set(it.parentItemId, list);
    } else {
      flow.push(it);
    }
  }
  const ordered: QuoteItemForSnapshot[] = [];
  for (const it of flow) {
    ordered.push(it);
    const kids = childrenByParent.get(it.id);
    if (kids) ordered.push(...kids);
  }

  let poz = 0;
  const items: StfItem[] = ordered
    .map((it, index) => {
      const getsPoz = POZ_TYPES.has(it.itemType) && !it.parentItemId;
      if (getsPoz) poz += 1;
      return {
        // Canonical order: renumber sequentially so the editor and both
        // exports (all sortOrder-driven) render parent + children together.
        sortOrder: index + 1,
        itemType: it.itemType,
        pozNo: getsPoz ? String(poz) : null,
        code: it.code,
        brand: it.brand,
        model: it.model,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        discountPct: it.discountPct,
        sectionDiscountPct: it.sectionDiscountPct,
        sectionDiscountLabel: it.sectionDiscountLabel,
      };
    });

  return { header, items };
}
