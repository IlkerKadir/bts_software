import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string; compareId: string }>;
}

interface QuoteItemForCompare {
  id: string;
  productId: string | null;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: number;
  unit: string;
  katsayi: number;
  unitPrice: number;
  totalPrice: number;
  itemType: string;
  sortOrder: number;
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
 * Compares two quote versions and returns the differences.
 * Matches items by productId first, then by code, then by description.
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
            where: { parentItemId: null },
            orderBy: { sortOrder: 'asc' },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      db.quote.findUnique({
        where: { id: compareId },
        include: {
          items: {
            where: { parentItemId: null },
            orderBy: { sortOrder: 'asc' },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    if (!quote1 || !quote2) {
      return NextResponse.json(
        { error: 'Karsilastirilacak tekliflerden biri bulunamadi' },
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
      { key: 'exchangeRate', label: 'Doviz Kuru' },
      { key: 'protectionPct', label: 'Kur Koruma %' },
      { key: 'discountPct', label: 'Iskonto %' },
      { key: 'validityDays', label: 'Gecerlilik Suresi' },
      { key: 'subtotal', label: 'Ara Toplam' },
      { key: 'discountTotal', label: 'Iskonto Toplam' },
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

    // Only compare PRODUCT, CUSTOM, and SET items (skip HEADER, NOTE, SUBTOTAL)
    const comparableTypes = ['PRODUCT', 'CUSTOM', 'SET'];
    const oldItems = oldQuote.items.filter(i => comparableTypes.includes(i.itemType));
    const newItems = newQuote.items.filter(i => comparableTypes.includes(i.itemType));

    // Build match keys: prefer productId, then code, then description
    function matchKey(item: { productId: string | null; code: string | null; description: string }): string {
      if (item.productId) return `pid:${item.productId}`;
      if (item.code) return `code:${item.code}`;
      return `desc:${item.description}`;
    }

    const oldItemsByKey = new Map<string, typeof oldItems[number]>();
    for (const item of oldItems) {
      oldItemsByKey.set(matchKey(item), item);
    }

    const newItemsByKey = new Map<string, typeof newItems[number]>();
    for (const item of newItems) {
      newItemsByKey.set(matchKey(item), item);
    }

    const itemDiffs: ItemDiff[] = [];
    const matchedNewKeys = new Set<string>();

    // Check for modified and removed items
    for (const [key, oldItem] of oldItemsByKey) {
      const newItem = newItemsByKey.get(key);

      if (!newItem) {
        // Item was removed
        itemDiffs.push({
          type: 'removed',
          oldItem: formatItem(oldItem),
        });
      } else {
        matchedNewKeys.add(key);
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
    for (const [key, newItem] of newItemsByKey) {
      if (!matchedNewKeys.has(key)) {
        itemDiffs.push({
          type: 'added',
          newItem: formatItem(newItem),
        });
      }
    }

    // Sort diffs: modified first, then added, then removed, then unchanged
    const sortOrder = { modified: 0, added: 1, removed: 2, unchanged: 3 };
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
      { error: 'Teklifler karsilastirilirken bir hata olustu' },
      { status: 500 }
    );
  }
}

function formatItem(item: {
  id: string;
  productId: string | null;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: unknown;
  unit: string;
  katsayi: unknown;
  unitPrice: unknown;
  totalPrice: unknown;
  itemType: string;
  sortOrder: number;
}): QuoteItemForCompare {
  return {
    id: item.id,
    productId: item.productId,
    code: item.code,
    brand: item.brand,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    katsayi: Number(item.katsayi),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    itemType: item.itemType,
    sortOrder: item.sortOrder,
  };
}

function compareItems(
  oldItem: { description: string; quantity: unknown; unit: string; katsayi: unknown; unitPrice: unknown; totalPrice: unknown },
  newItem: { description: string; quantity: unknown; unit: string; katsayi: unknown; unitPrice: unknown; totalPrice: unknown }
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

  // Check description change
  if (oldItem.description !== newItem.description) {
    changes.push({
      field: 'Aciklama',
      oldValue: oldItem.description,
      newValue: newItem.description,
    });
  }

  const numericFields = [
    { key: 'quantity', label: 'Miktar' },
    { key: 'katsayi', label: 'Katsayi' },
    { key: 'unitPrice', label: 'Birim Fiyat' },
    { key: 'totalPrice', label: 'Toplam Fiyat' },
  ];

  for (const field of numericFields) {
    const oldValue = (oldItem as Record<string, unknown>)[field.key];
    const newValue = (newItem as Record<string, unknown>)[field.key];

    const oldNum = typeof oldValue === 'object' && oldValue !== null ? Number(oldValue) : Number(oldValue);
    const newNum = typeof newValue === 'object' && newValue !== null ? Number(newValue) : Number(newValue);

    if (oldNum !== newNum) {
      changes.push({
        field: field.label,
        oldValue: oldNum,
        newValue: newNum,
      });
    }
  }

  // Check unit change
  if (oldItem.unit !== newItem.unit) {
    changes.push({
      field: 'Birim',
      oldValue: oldItem.unit,
      newValue: newItem.unit,
    });
  }

  return changes;
}
