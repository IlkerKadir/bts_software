// ── Shared quote types ──────────────────────────────────────────────────────
// These types are used across QuoteEditor, QuoteItemRow, QuoteItemsTable,
// and other quote-related components.

/**
 * Possible quote item types matching the Prisma enum / QuoteItemData union.
 */
export type QuoteItemType = 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL';

/**
 * Shape of a raw quote item as returned by the API (before local mapping).
 * Fields may be strings/Decimals from Prisma; mapApiItemToLocal converts
 * them to numbers.
 */
export interface ApiQuoteItem {
  id: string;
  productId?: string | null;
  parentItemId?: string | null;
  itemType: QuoteItemType;
  sortOrder: number | string;
  code?: string | null;
  brand?: string | null;
  model?: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  listPrice: number | string;
  katsayi: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  vatRate: number | string;
  totalPrice: number | string;
  notes?: string | null;
  isManualPrice?: boolean;
  costPrice?: number | string | null;
  serviceMeta?: unknown;
  subRows?: ApiQuoteItem[];
  product?: { model?: string | null; currency?: string | null; listPrice?: number | string | null; costPrice?: number | string | null; minKatsayi?: number | string | null; maxKatsayi?: number | string | null; [key: string]: unknown };
}

/**
 * Shape of a commercial term row stored on a quote.
 */
export interface CommercialTerm {
  id: string;
  category: string;
  value: string;
  sortOrder: number | string;
  highlight?: boolean;
}

/**
 * Payload for creating a new quote item via POST /api/quotes/:id/items.
 */
export interface CreateItemPayload {
  itemType: string;
  productId?: string;
  parentItemId?: string;
  code?: string;
  brand?: string;
  model?: string;
  description: string;
  quantity: number;
  unit: string;
  listPrice: number;
  katsayi: number;
  discountPct: number;
  vatRate: number;
  notes?: string;
  sortOrder: number;
  isManualPrice?: boolean;
  unitPrice?: number;
  totalPrice?: number;
  costPrice?: number | null;
}
