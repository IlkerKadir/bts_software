import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string; compareId: string }>;
}

interface QuoteItemForCompare {
  id: string;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  itemType: string;
  sortOrder: number;
}

interface QuoteForCompare {
  id: string;
  quoteNumber: string;
  version: number;
  status: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  discountPct: number;
  vatTotal: number;
  grandTotal: number;
  protectionPct: number;
  exchangeRate: number;
  validityDays: number;
  notes: string | null;
  createdAt: Date;
  items: QuoteItemForCompare[];
}

interface ItemDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldItem?: QuoteItemForCompare;
  newItem?: QuoteItemForCompare;
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}

/**
 * GET /api/quotes/[id]/compare/[compareId]
 * Compares two quote versions and returns the differences
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, compareId } = await params;

    // Fetch both quotes with their items
    const [quote1, quote2] = await Promise.all([
      db.quote.findUnique({
        where: { id: quoteId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      db.quote.findUnique({
        where: { id: compareId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    if (!quote1 || !quote2) {
      return NextResponse.json(
        { error: 'Karşılaştırılacak tekliflerden biri bulunamadı' },
        { status: 404 }
      );
    }

    // Determine which is the newer version
    const [oldQuote, newQuote] = quote1.version < quote2.version
      ? [quote1, quote2]
      : [quote2, quote1];

    // Compare header fields
    const headerChanges: { field: string; oldValue: unknown; newValue: unknown }[] = [];

    const fieldsToCompare = [
      { key: 'currency', label: 'Para Birimi' },
      { key: 'exchangeRate', label: 'Döviz Kuru' },
      { key: 'protectionPct', label: 'Kur Koruma %' },
      { key: 'discountPct', label: 'İskonto %' },
      { key: 'validityDays', label: 'Geçerlilik Süresi' },
      { key: 'notes', label: 'Notlar' },
      { key: 'subtotal', label: 'Ara Toplam' },
      { key: 'discountTotal', label: 'İskonto Toplam' },
      { key: 'vatTotal', label: 'KDV Toplam' },
      { key: 'grandTotal', label: 'Genel Toplam' },
    ];

    for (const field of fieldsToCompare) {
      const oldValue = (oldQuote as Record<string, unknown>)[field.key];
      const newValue = (newQuote as Record<string, unknown>)[field.key];

      // Convert Decimal to number for comparison
      const oldNum = typeof oldValue === 'object' && oldValue !== null ? Number(oldValue) : oldValue;
      const newNum = typeof newValue === 'object' && newValue !== null ? Number(newValue) : newValue;

      if (oldNum !== newNum) {
        headerChanges.push({
          field: field.label,
          oldValue: oldNum,
          newValue: newNum,
        });
      }
    }

    // Compare items
    const oldItemsMap = new Map(
      oldQuote.items.map((item) => [item.code || item.description, item])
    );
    const newItemsMap = new Map(
      newQuote.items.map((item) => [item.code || item.description, item])
    );

    const itemDiffs: ItemDiff[] = [];

    // Check for modified and removed items
    for (const [key, oldItem] of oldItemsMap) {
      const newItem = newItemsMap.get(key);

      if (!newItem) {
        // Item was removed
        itemDiffs.push({
          type: 'removed',
          oldItem: formatItem(oldItem),
        });
      } else {
        // Compare items
        const changes = compareItems(oldItem, newItem);
        if (changes.length > 0) {
          itemDiffs.push({
            type: 'modified',
            oldItem: formatItem(oldItem),
            newItem: formatItem(newItem),
            changes,
          });
        } else {
          itemDiffs.push({
            type: 'unchanged',
            oldItem: formatItem(oldItem),
            newItem: formatItem(newItem),
          });
        }
      }
    }

    // Check for added items
    for (const [key, newItem] of newItemsMap) {
      if (!oldItemsMap.has(key)) {
        itemDiffs.push({
          type: 'added',
          newItem: formatItem(newItem),
        });
      }
    }

    // Sort diffs: added first, then modified, then unchanged, then removed
    const sortOrder = { added: 0, modified: 1, unchanged: 2, removed: 3 };
    itemDiffs.sort((a, b) => sortOrder[a.type] - sortOrder[b.type]);

    return NextResponse.json({
      oldQuote: {
        id: oldQuote.id,
        quoteNumber: oldQuote.quoteNumber,
        version: oldQuote.version,
        status: oldQuote.status,
        createdAt: oldQuote.createdAt,
        createdBy: oldQuote.createdBy,
        grandTotal: Number(oldQuote.grandTotal),
        currency: oldQuote.currency,
      },
      newQuote: {
        id: newQuote.id,
        quoteNumber: newQuote.quoteNumber,
        version: newQuote.version,
        status: newQuote.status,
        createdAt: newQuote.createdAt,
        createdBy: newQuote.createdBy,
        grandTotal: Number(newQuote.grandTotal),
        currency: newQuote.currency,
      },
      headerChanges,
      itemDiffs,
      summary: {
        addedItems: itemDiffs.filter((d) => d.type === 'added').length,
        removedItems: itemDiffs.filter((d) => d.type === 'removed').length,
        modifiedItems: itemDiffs.filter((d) => d.type === 'modified').length,
        unchangedItems: itemDiffs.filter((d) => d.type === 'unchanged').length,
        totalChanges: headerChanges.length + itemDiffs.filter((d) => d.type !== 'unchanged').length,
      },
    });
  } catch (error) {
    console.error('Compare quotes error:', error);
    return NextResponse.json(
      { error: 'Teklifler karşılaştırılırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

function formatItem(item: {
  id: string;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: unknown;
  unit: string;
  unitPrice: unknown;
  totalPrice: unknown;
  itemType: string;
  sortOrder: number;
}): QuoteItemForCompare {
  return {
    id: item.id,
    code: item.code,
    brand: item.brand,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    itemType: item.itemType,
    sortOrder: item.sortOrder,
  };
}

function compareItems(
  oldItem: { quantity: unknown; unitPrice: unknown; totalPrice: unknown; unit: string },
  newItem: { quantity: unknown; unitPrice: unknown; totalPrice: unknown; unit: string }
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

  const fields = [
    { key: 'quantity', label: 'Miktar' },
    { key: 'unit', label: 'Birim' },
    { key: 'unitPrice', label: 'Birim Fiyat' },
    { key: 'totalPrice', label: 'Toplam Fiyat' },
  ];

  for (const field of fields) {
    const oldValue = (oldItem as Record<string, unknown>)[field.key];
    const newValue = (newItem as Record<string, unknown>)[field.key];

    const oldNum = typeof oldValue === 'object' && oldValue !== null ? Number(oldValue) : oldValue;
    const newNum = typeof newValue === 'object' && newValue !== null ? Number(newValue) : newValue;

    if (oldNum !== newNum) {
      changes.push({
        field: field.label,
        oldValue: oldNum,
        newValue: newNum,
      });
    }
  }

  return changes;
}
