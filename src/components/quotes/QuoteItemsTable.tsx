'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, Type, StickyNote } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import {
  QuoteItemRow,
  formatPrice,
  type QuoteItemData,
} from './QuoteItemRow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuoteItemsTableProps {
  items: QuoteItemData[];
  currency: string;
  discountPct: number;
  canViewCosts: boolean;
  onItemUpdate: (itemId: string, updates: Partial<QuoteItemData>) => void;
  onItemDelete: (itemId: string) => void;
  onItemDuplicate: (itemId: string) => void;
  onReorder: (items: QuoteItemData[]) => void;
  onDiscountPctChange: (value: number) => void;
  onAddProduct: () => void;
  onAddHeader: () => void;
  onAddNote: () => void;
  onShowPriceHistory?: (productId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ---------------------------------------------------------------------------
// QuoteItemsTable
// ---------------------------------------------------------------------------

export function QuoteItemsTable({
  items,
  currency,
  discountPct,
  canViewCosts,
  onItemUpdate,
  onItemDelete,
  onItemDuplicate,
  onReorder,
  onDiscountPctChange,
  onAddProduct,
  onAddHeader,
  onAddNote,
  onShowPriceHistory,
}: QuoteItemsTableProps) {
  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Build POZ NO mapping: sequential numbering only for PRODUCT / CUSTOM / SERVICE
  const pozMap = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 1;
    for (const item of items) {
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SERVICE') {
        map.set(item.id, counter);
        counter++;
      }
    }
    return map;
  }, [items]);

  // Summary calculations
  const summary = useMemo(() => {
    let araTotal = 0;
    let totalCost = 0;
    let totalVat = 0;

    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE') continue;
      araTotal += item.totalPrice;
      if (item.costPrice != null) {
        totalCost += item.costPrice * item.quantity;
      }
    }

    const discountAmount = araTotal * (discountPct / 100);
    const afterDiscount = araTotal - discountAmount;

    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE') continue;
      const itemAfterDiscount = item.totalPrice * (1 - discountPct / 100);
      totalVat += itemAfterDiscount * (item.vatRate / 100);
    }

    const grandTotal = afterDiscount + totalVat;
    const totalProfit = afterDiscount - totalCost;
    const profitMargin = afterDiscount > 0 ? (totalProfit / afterDiscount) * 100 : 0;

    return {
      araTotal,
      discountAmount,
      afterDiscount,
      totalVat,
      grandTotal,
      totalCost,
      totalProfit,
      profitMargin,
    };
  }, [items, discountPct]);

  // Drag handlers
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (_index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [],
  );

  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceIndex = dragIndex;
      setDragIndex(null);
      if (sourceIndex === null || sourceIndex === targetIndex) return;

      const updated = [...items];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      // Reassign sortOrder
      const reordered = updated.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      onReorder(reordered);
    },
    [dragIndex, items, onReorder],
  );

  // Column count for full-width summary rows
  // Columns: drag(1) + POZ(1) + ACIKLAMA(1) + MIKTAR(1) + [KATSAYI+LISTE+MALIYET+KAR+KAR%=5] + BIRIM_FIYAT(1) + TOPLAM_FIYAT(1) + delete(1)
  const baseColCount = 7; // drag + poz + aciklama + miktar + birimfiyat + toplamfiyat + delete
  const costExtraCols = 5; // katsayi + listefiyati + maliyet + kar + kar%
  const totalColCount = canViewCosts ? baseColCount + costExtraCols : baseColCount;

  // Label column span for summary (everything before TOPLAM FIYAT + delete)
  const labelSpan = totalColCount - 2; // all except last two cols (toplamfiyat + delete)

  return (
    <div className="space-y-3">
      {/* ---- Action buttons ---- */}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onAddProduct}>
          <Plus className="h-4 w-4" />
          Ürün Ekle
        </Button>
        <Button variant="secondary" size="sm" onClick={onAddHeader}>
          <Type className="h-4 w-4" />
          Başlık Ekle
        </Button>
        <Button variant="secondary" size="sm" onClick={onAddNote}>
          <StickyNote className="h-4 w-4" />
          Not Ekle
        </Button>
      </div>

      {/* ---- Table ---- */}
      <div className="overflow-x-auto rounded-lg border border-accent-200 bg-white">
        <table className="w-full text-sm border-collapse">
          {/* ---- Sticky header ---- */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-accent-800 text-white text-xs uppercase tracking-wider">
              {/* Drag handle col */}
              <th className="w-8 px-1 py-2" />
              <th className="px-2 py-2 text-center whitespace-nowrap">Poz No</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Açıklama</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Miktar</th>

              {canViewCosts && (
                <>
                  <th className="px-2 py-2 text-right whitespace-nowrap">Katsayı</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">Liste Fiyatı</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">Maliyet</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">Kar</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">Kar %</th>
                </>
              )}

              <th className="px-2 py-2 text-right whitespace-nowrap">Birim Fiyat</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Toplam Fiyat</th>
              {/* Delete col */}
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={totalColCount}
                  className="px-4 py-8 text-center text-accent-500"
                >
                  Henüz kalem eklenmedi. Yukarıdaki butonlarla kalem ekleyebilirsiniz.
                </td>
              </tr>
            )}

            {items.map((item, index) => (
              <QuoteItemRow
                key={item.id}
                item={item}
                pozNo={pozMap.get(item.id) ?? null}
                currency={currency}
                canViewCosts={canViewCosts}
                isDragging={dragIndex === index}
                onUpdate={(updates) => onItemUpdate(item.id, updates)}
                onDelete={() => onItemDelete(item.id)}
                onDuplicate={() => onItemDuplicate(item.id)}
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                onShowPriceHistory={
                  item.productId && onShowPriceHistory
                    ? () => onShowPriceHistory(item.productId!)
                    : undefined
                }
                onInsertHeaderAbove={onAddHeader}
              />
            ))}
          </tbody>

          {/* ---- Summary footer ---- */}
          <tfoot className="bg-accent-50 text-sm">
            {/* Ara Toplam */}
            <tr className="border-t-2 border-accent-300">
              <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-700">
                Ara Toplam
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-accent-900 whitespace-nowrap">
                {formatPrice(summary.araTotal, currency)}
              </td>
              <td />
            </tr>

            {/* Iskonto */}
            <tr>
              <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-700">
                <span className="inline-flex items-center gap-2">
                  İskonto %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountPct}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onDiscountPctChange(val);
                    }}
                    className="w-16 rounded border border-accent-300 px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  />
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">
                {summary.discountAmount > 0 ? `- ${formatPrice(summary.discountAmount, currency)}` : '-'}
              </td>
              <td />
            </tr>

            {/* KDV Toplam */}
            <tr>
              <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-700">
                KDV Toplam
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-accent-800 whitespace-nowrap">
                {formatPrice(summary.totalVat, currency)}
              </td>
              <td />
            </tr>

            {/* GENEL TOPLAM */}
            <tr className="border-t-2 border-accent-400">
              <td colSpan={labelSpan} className="px-3 py-2.5 text-right text-base font-bold text-accent-900">
                GENEL TOPLAM
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-base font-bold text-accent-900 whitespace-nowrap">
                {formatPrice(summary.grandTotal, currency)}
              </td>
              <td />
            </tr>

            {/* Cost summary – only for canViewCosts */}
            {canViewCosts && (
              <>
                <tr className="border-t-2 border-accent-300">
                  <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-600">
                    Toplam Maliyet
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-accent-700 whitespace-nowrap">
                    {formatPrice(summary.totalCost, currency)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-600">
                    Toplam Kar
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right tabular-nums whitespace-nowrap font-medium',
                      summary.totalProfit < 0
                        ? 'text-red-600'
                        : 'text-green-700',
                    )}
                  >
                    {formatPrice(summary.totalProfit, currency)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-600">
                    Kar Marjı %
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right tabular-nums whitespace-nowrap font-medium',
                      summary.profitMargin < 15
                        ? 'text-red-600'
                        : 'text-green-700',
                    )}
                  >
                    %{formatNumber(summary.profitMargin, 1)}
                  </td>
                  <td />
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
