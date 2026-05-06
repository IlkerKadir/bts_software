'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  GripVertical,
  Trash2,
  Clock,
  Copy,
  Package,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { getEffectiveCostPrice } from '@/lib/ek-maliyet';
import { roundUnitPrice, computeRowTotal } from '@/lib/quote-rounding';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteItemData {
  id: string;
  productId?: string | null;
  parentItemId?: string | null;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  sortOrder: number;
  code?: string | null;
  brand?: string | null;
  model?: string | null;
  description: string;
  quantity: number;
  unit: string;
  listPrice: number;
  katsayi: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  totalPrice: number;
  notes?: string | null;
  priceLabel?: string | null;
  isManualPrice?: boolean;
  costPrice?: number | null;
  productCurrency?: string | null;
  productListPrice?: number | null;
  productCostPrice?: number | null;
  minKatsayi?: number | null;
  maxKatsayi?: number | null;
  subRows?: QuoteItemData[];
  customPozNo?: string | null;
  /** When true, the row is rendered with a yellow background in the editor
   *  and on customer-facing PDF / Excel exports. Toggled per-row via the
   *  right-click context menu. */
  highlight?: boolean | null;
  /** Per-unit ek maliyet distributed amount. Adds to listPrice and costPrice
   *  for display/calculation, but the underlying fields remain untouched. */
  ekMaliyetDelta?: number | null;
  /** Optional per-SET currency override. Only meaningful on top-level
   *  SET rows. null = use quote currency (legacy behavior). */
  currency?: string | null;
  /** Per-section discount percentage. Only meaningful on SUBTOTAL rows. */
  sectionDiscountPct?: number | null;
  /** Optional custom label for the section's İskonto line. */
  sectionDiscountLabel?: string | null;
}

export interface PriceHistoryStats {
  lastQuoted: { unitPrice: number; date: string } | null;
  lastOrdered: { unitPrice: number; date: string } | null;
  highest: { unitPrice: number; date: string } | null;
  lowest: { unitPrice: number; date: string } | null;
}

export interface ColumnVisibility {
  urun: boolean;
  fiyat: boolean;
  maliyet: boolean;
  gecmis: boolean;
}

export interface QuoteItemRowProps {
  item: QuoteItemData;
  pozNo: string | null;
  currency: string;
  overallDiscountPct?: number;
  canViewCosts: boolean;
  canOverrideKatsayi?: boolean;
  isDragging?: boolean;
  isSubRow?: boolean;
  columnVisibility: ColumnVisibility;
  priceHistory?: PriceHistoryStats;
  totalColCount: number;
  subtotalValue?: number;
  grandTotalValue?: number;
  onUpdate: (updates: Partial<QuoteItemData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onShowPriceHistory?: () => void;
  onInsertHeaderAbove?: () => void;
  /** Right-click "Ürün Değiştir" — swaps the underlying product on this
   *  row, keeping quantity/katsayı/etc. Only meaningful for PRODUCT and
   *  SET rows; the parent decides when to wire it. */
  onSwapProduct?: () => void;
  /** Multi-row selection (#5). When provided, a checkbox is rendered
   *  in the drag column. Only top-level rows opt in — sub-items of
   *  SETs are not selectable on their own. */
  isSelected?: boolean;
  onToggleSelected?: () => void;
  /** Admin-managed catalog of price label options (fetched once at the
   *  table level and passed down). */
  priceLabelOptions?: ReadonlyArray<{ id: string; label: string }>;
  /** Admin-managed list of unit options. Falls back to the legacy four
   *  (Adet / Metre / Set / Kişi/Gün) when omitted. */
  unitOptions?: ReadonlyArray<string>;
  /** Called when the user clicks "+ İskonto" on a zero-discount SUBTOTAL row.
   *  The parent seeds the new discount at 5% by default. */
  onAddSectionDiscount?: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Re-export formatPrice and formatNumber from shared utilities for backward compatibility
export { formatPrice, formatNumber };

// ---------------------------------------------------------------------------
// DeltaCell - shows % deviation with color coding
// ---------------------------------------------------------------------------

function DeltaCell({
  currentPrice,
  historicalPrice,
}: {
  currentPrice: number;
  historicalPrice?: number;
}) {
  if (!historicalPrice || historicalPrice === 0) return <span className="text-accent-400">-</span>;
  const delta = ((currentPrice - historicalPrice) / historicalPrice) * 100;
  const color =
    delta > 5 ? 'text-red-600' : delta < -5 ? 'text-green-600' : 'text-accent-500';
  const sign = delta > 0 ? '+' : '';
  return (
    <span className={cn('font-medium', color)}>
      {sign}{delta.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

interface EditableCellProps {
  value: string | number;
  type?: 'text' | 'number';
  className?: string;
  onChange: (value: string | number) => void;
  displayValue?: string;
  readOnly?: boolean;
}

function PozNoInput({ value, onCommit, fallback }: { value: string; onCommit: (val: string) => void; fallback: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          onCommit(trimmed);
          if (!trimmed) setDraft(fallback);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full max-w-[3rem] text-center text-sm bg-transparent border-0 border-b border-blue-400 focus:outline-none px-0 py-0"
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className="cursor-text w-full max-w-[3rem] inline-block text-center text-sm hover:bg-accent-100 rounded px-0.5"
    >
      {value || fallback}
    </span>
  );
}

function EditableCell({
  value,
  type = 'text',
  className,
  onChange,
  displayValue,
  readOnly = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Number cells get the spreadsheet behavior: open → all selected →
      // typing replaces. Text cells (descriptions, codes, etc.) leave the
      // text alone so the user can position the cursor and partial-select
      // to copy or rewrite a portion.
      if (type === 'number') {
        inputRef.current.select();
      }
    }
  }, [editing, type]);

  const commit = useCallback(() => {
    setEditing(false);
    if (type === 'number') {
      const parsed = parseFloat(draft.replace(',', '.'));
      if (!isNaN(parsed) && Math.abs(parsed - (typeof value === 'number' ? value : 0)) > 0.0001) {
        onChange(parsed);
      }
    } else if (draft !== value) {
      onChange(draft);
    }
  }, [draft, onChange, type, value]);

  if (readOnly) {
    return (
      <span className={cn('tabular-nums', className)}>
        {displayValue ?? String(value)}
      </span>
    );
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        data-editable="true"
        className={cn(
          'tabular-nums cursor-pointer rounded px-1 -mx-1 hover:bg-blue-50 transition-colors',
          className,
        )}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setEditing(true);
        }}
      >
        {displayValue ?? String(value)}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type === 'number' ? 'text' : 'text'}
      inputMode={type === 'number' ? 'decimal' : 'text'}
      data-editable="true"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(String(value));
          setEditing(false);
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          commit();
          const currentElement = e.target as HTMLElement;
          const allEditables = Array.from(
            document.querySelectorAll('[data-editable="true"]')
          ) as HTMLElement[];
          const currentIndex = allEditables.indexOf(currentElement);
          const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
          if (nextIndex >= 0 && nextIndex < allEditables.length) {
            allEditables[nextIndex]?.focus();
            allEditables[nextIndex]?.click();
          }
        }
      }}
      className={cn(
        'w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-sm outline-none ring-2 ring-blue-200 tabular-nums',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

interface ContextMenuState {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// QuoteItemRow
// ---------------------------------------------------------------------------

export function QuoteItemRow({
  item,
  pozNo,
  currency,
  overallDiscountPct = 0,
  canViewCosts,
  canOverrideKatsayi,
  isDragging = false,
  isSubRow = false,
  columnVisibility,
  priceHistory,
  totalColCount,
  subtotalValue,
  grandTotalValue,
  onUpdate,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop,
  onShowPriceHistory,
  onInsertHeaderAbove,
  onSwapProduct,
  isSelected,
  onToggleSelected,
  priceLabelOptions,
  unitOptions,
  onAddSectionDiscount,
}: QuoteItemRowProps) {
  // Fallback list if the admin catalog hasn't loaded yet.
  const DEFAULT_UNITS = ['Adet', 'Metre', 'Set', 'Kişi/Gün'] as const;
  const effectiveUnits = unitOptions && unitOptions.length > 0 ? unitOptions : DEFAULT_UNITS;
  // If the item was saved with a unit that's no longer in the catalog
  // (admin removed it), keep it visible in the dropdown so old quotes
  // don't lose their stored value when edited.
  const unitList = effectiveUnits.includes(item.unit)
    ? effectiveUnits
    : [item.unit, ...effectiveUnits];
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const menuWidth = 200;
    const menuHeight = 200;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight);
    setContextMenu({ x, y });
  };

  // Wrap the row's drag start so click+drag inside an input (e.g.
  // selecting part of the description for copy/delete) doesn't get
  // hijacked into a row reorder. The browser fires `dragstart` on the
  // <tr draggable> with `event.target` set to the actual mousedown
  // target — if that's an editable input/textarea, abort the drag.
  const guardedDragStart = useCallback(
    (e: React.DragEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      // Direct target check — when user click+drags inside an input,
      // the dragstart's event.target is usually the input itself.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        e.preventDefault();
        return;
      }
      // Backup: some browsers fire dragstart with event.target set to a
      // wrapping <td>/<span> instead of the input that's actually
      // focused. Catch that case via document.activeElement so partial
      // text selection stays reliable.
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        const rowEl = e.currentTarget as HTMLElement;
        if (rowEl.contains(active)) {
          e.preventDefault();
          return;
        }
      }
      onDragStart(e);
    },
    [onDragStart],
  );

  // Ek maliyet delta — adds to listPrice and costPrice for display only.
  // Underlying DB fields are never mutated.
  const ekDelta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;

  // Effective (displayed) prices include the ek maliyet delta
  const effectiveListPriceNum = Number(item.listPrice) + ekDelta;
  const effectiveCostPriceNum = getEffectiveCostPrice(item);

  // Margin helpers
  const unitPriceNum = Number(item.unitPrice) || 0;
  const discPct = Number(item.discountPct) || 0;
  const effectiveUnitPrice = unitPriceNum * (1 - discPct / 100);
  const margin =
    effectiveCostPriceNum != null && effectiveCostPriceNum > 0 && effectiveUnitPrice > 0
      ? ((effectiveUnitPrice - effectiveCostPriceNum) / effectiveUnitPrice) * 100
      : null;
  const isLowMargin = margin !== null && margin < 15;

  // Katsayi range check
  const katsayiNum = Number(item.katsayi);
  const hasMinKatsayi = item.minKatsayi != null;
  const hasMaxKatsayi = item.maxKatsayi != null;
  const isBelowMin = hasMinKatsayi && katsayiNum < Number(item.minKatsayi);
  const isAboveMax = hasMaxKatsayi && katsayiNum > Number(item.maxKatsayi);
  const isKatsayiOutOfRange = isBelowMin || isAboveMax;
  const katsayiRangeLabel =
    hasMinKatsayi || hasMaxKatsayi
      ? `Aralik: ${hasMinKatsayi ? Number(item.minKatsayi).toFixed(3) : '-'} - ${hasMaxKatsayi ? Number(item.maxKatsayi).toFixed(3) : '-'}`
      : null;

  // ColSpan for HEADER/NOTE rows (all columns except drag + delete)
  const spanColCount = totalColCount - 2;

  // ---- HEADER row ----
  if (item.itemType === 'HEADER') {
    return (
      <>
        <tr
          draggable
          onDragStart={guardedDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-70 bg-accent-50', item.highlight && 'bg-yellow-100')}
        >
          <td className={cn('w-8 border border-accent-200 px-1 py-1.5 text-center', item.highlight ? 'bg-yellow-100' : 'bg-[#F3F4F6]')}>
            <span className="flex items-center justify-center gap-1">
              {onToggleSelected && (
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={onToggleSelected}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('h-3 w-3 cursor-pointer', !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity')}
                  aria-label="Seçim"
                />
              )}
              <GripVertical className="h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </td>
          <td
            colSpan={spanColCount}
            className={cn('border border-accent-200 px-3 py-2 font-bold text-accent-800 text-sm', item.highlight ? 'bg-yellow-100' : 'bg-[#F3F4F6]')}
          >
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="font-bold"
            />
          </td>
          <td className={cn('w-10 border border-accent-200 px-1 py-1.5 text-center', item.highlight ? 'bg-yellow-100' : 'bg-[#F3F4F6]')}>
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
              title="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        </tr>
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            menuRef={menuRef}
            onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
            onDelete={() => { onDelete(); setContextMenu(null); }}
            onInsertHeaderAbove={onInsertHeaderAbove ? () => { onInsertHeaderAbove(); setContextMenu(null); } : undefined}
            onToggleHighlight={() => { onUpdate({ highlight: !item.highlight }); setContextMenu(null); }}
            isHighlighted={!!item.highlight}
          />
        )}
      </>
    );
  }

  // ---- NOTE row ----
  if (item.itemType === 'NOTE') {
    // Inner-cell count (excludes drag + delete columns). The dedicated
    // poz-label cell consumes one column from this total at render time.
    const noteSpanColCount = (() => {
      let count = 2; // Poz No + Aciklama (always visible)
      count += 1; // Miktar
      count += 1; // Para Birimi
      if (columnVisibility.urun) count += 3; // Marka, Model, Kod
      if (columnVisibility.fiyat) count += 4; // Katsayi, Liste Fiyati, Birim Fiyat, Toplam Fiyat
      if (canViewCosts && columnVisibility.maliyet) count += 3; // Maliyet, Kar, Kar%
      if (columnVisibility.gecmis) count += 8; // 4 prices + 4 deltas
      return count;
    })();

    return (
      <>
        <tr
          draggable
          onDragStart={guardedDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-70 bg-accent-50', item.highlight && 'bg-yellow-100')}
        >
          <td className="w-8 border border-accent-200 bg-white px-1 py-1.5 text-center">
            <span className="flex items-center justify-center gap-1">
              {onToggleSelected && (
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={onToggleSelected}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('h-3 w-3 cursor-pointer', !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity')}
                  aria-label="Seçim"
                />
              )}
              <GripVertical className="h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </td>
          <td className="border border-accent-200 bg-white px-1 py-1.5 text-center tabular-nums text-accent-700 whitespace-nowrap">
            <PozNoInput
              value={item.customPozNo ?? ''}
              onCommit={(val) => onUpdate({ customPozNo: val || null })}
              fallback="NOT:"
            />
          </td>
          <td
            colSpan={noteSpanColCount - 1}
            className="border border-accent-200 bg-white px-3 py-2 text-sm italic text-accent-600"
          >
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="italic"
            />
          </td>
          <td className="w-10 border border-accent-200 bg-white px-1 py-1.5 text-center">
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
              title="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        </tr>
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            menuRef={menuRef}
            onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
            onDelete={() => { onDelete(); setContextMenu(null); }}
            onInsertHeaderAbove={onInsertHeaderAbove ? () => { onInsertHeaderAbove(); setContextMenu(null); } : undefined}
            onToggleHighlight={() => { onUpdate({ highlight: !item.highlight }); setContextMenu(null); }}
            isHighlighted={!!item.highlight}
          />
        )}
      </>
    );
  }

  // ---- SUBTOTAL row ----
  if (item.itemType === 'SUBTOTAL') {
    // Compute label span: everything from Poz to Birim Fiyat (before Toplam Fiyat)
    // Drag(1) + Poz(1) + [Urun x3] + Aciklama(1) + Miktar(1) + [BirimFiyat(1)]
    const subtotalLabelSpan = (() => {
      let count = 1; // Poz No
      if (columnVisibility.urun) count += 3;
      count += 1; // Aciklama
      count += 1; // Miktar
      if (columnVisibility.fiyat) count += 1; // Birim Fiyat
      return count;
    })();
    // Trailing: Katsayi + Liste Fiyati + [Maliyet x3] + PB + [Gecmis x8] + Delete
    const subtotalTrailingSpan = (() => {
      let count = 0;
      if (columnVisibility.fiyat) count += 2; // Katsayi + Liste Fiyati
      if (canViewCosts && columnVisibility.maliyet) count += 3;
      count += 1; // PB
      if (columnVisibility.gecmis) count += 8;
      count += 1; // Delete
      return count;
    })();

    return (
      <>
        <tr
          draggable
          onDragStart={guardedDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-70 bg-accent-50', item.highlight && 'bg-yellow-100')}
        >
          <td className="w-8 border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
            <span className="flex items-center justify-center gap-1">
              {onToggleSelected && (
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={onToggleSelected}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('h-3 w-3 cursor-pointer', !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity')}
                  aria-label="Seçim"
                />
              )}
              <GripVertical className="h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </td>
          <td
            colSpan={subtotalLabelSpan}
            className="border border-accent-200 bg-accent-100 px-3 py-2 text-right font-bold text-accent-800 text-sm"
          >
            <span className="inline-flex items-center justify-end gap-2 w-full">
              {item.itemType === 'SUBTOTAL' && (Number(item.sectionDiscountPct) || 0) === 0 && onAddSectionDiscount && item.id && (
                <button
                  type="button"
                  onClick={() => onAddSectionDiscount(item.id!)}
                  className="ml-2 inline-flex items-center gap-1 rounded border border-dashed border-accent-300 px-2 py-0.5 text-xs text-accent-600 hover:border-primary-400 hover:text-primary-600"
                  title="Bu bölüme iskonto ekle"
                >
                  + İskonto
                </button>
              )}
              <EditableCell
                value={item.description || 'Ara Toplam'}
                onChange={(v) => onUpdate({ description: String(v) })}
                className="font-bold text-right"
              />
            </span>
          </td>
          {columnVisibility.fiyat && (() => {
            const sv = subtotalValue ?? 0;
            const afterDisc = overallDiscountPct > 0 ? sv * (1 - overallDiscountPct / 100) : sv;
            return (
              <td className="border border-accent-200 bg-accent-100 px-2 py-2 text-right tabular-nums font-bold text-accent-900 whitespace-nowrap">
                {overallDiscountPct > 0 ? (
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-accent-400 line-through font-normal">
                      {formatPrice(sv, currency)}
                    </span>
                    <span className="text-green-700">
                      {formatPrice(afterDisc, currency)}
                    </span>
                  </div>
                ) : (
                  formatPrice(sv, currency)
                )}
              </td>
            );
          })()}
          {subtotalTrailingSpan > 0 && (
            <td colSpan={subtotalTrailingSpan} className="border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
              <button
                type="button"
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 float-right"
                title="Sil"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </td>
          )}
        </tr>
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            menuRef={menuRef}
            onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
            onDelete={() => { onDelete(); setContextMenu(null); }}
            onInsertHeaderAbove={onInsertHeaderAbove ? () => { onInsertHeaderAbove(); setContextMenu(null); } : undefined}
            onToggleHighlight={() => { onUpdate({ highlight: !item.highlight }); setContextMenu(null); }}
            isHighlighted={!!item.highlight}
          />
        )}
      </>
    );
  }

  // ---- GRAND_TOTAL row ----
  if (item.itemType === 'GRAND_TOTAL') {
    // Reuse the SUBTOTAL column-span math since the table layout is the same.
    const labelSpan = (() => {
      let count = 1; // Poz No
      if (columnVisibility.urun) count += 3;
      count += 1; // Aciklama
      count += 1; // Miktar
      if (columnVisibility.fiyat) count += 1; // Birim Fiyat
      return count;
    })();
    const trailingSpan = (() => {
      let count = 0;
      if (columnVisibility.fiyat) count += 2; // Katsayi + Liste Fiyati
      if (canViewCosts && columnVisibility.maliyet) count += 3;
      count += 1; // PB
      if (columnVisibility.gecmis) count += 8;
      count += 1; // Delete
      return count;
    })();
    return (
      <>
        <tr
          draggable
          onDragStart={guardedDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-70 bg-primary-50', item.highlight && 'bg-yellow-100')}
        >
          <td className="w-8 border border-primary-300 bg-primary-100 px-1 py-1.5 text-center">
            <span className="flex items-center justify-center gap-1">
              {onToggleSelected && (
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={onToggleSelected}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('h-3 w-3 cursor-pointer', !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity')}
                  aria-label="Seçim"
                />
              )}
              <GripVertical className="h-4 w-4 cursor-grab text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </td>
          <td
            colSpan={labelSpan}
            className="border border-primary-300 bg-primary-100 px-3 py-2 text-right font-bold text-primary-900 text-sm uppercase"
          >
            <EditableCell
              value={item.description || 'GENEL TOPLAM'}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="font-bold text-right"
            />
          </td>
          {columnVisibility.fiyat && (
            <td className="border border-primary-300 bg-primary-100 px-2 py-2 text-right tabular-nums font-bold text-primary-900 whitespace-nowrap">
              {formatPrice(grandTotalValue ?? 0, currency)}
            </td>
          )}
          {trailingSpan > 0 && (
            <td colSpan={trailingSpan} className="border border-primary-300 bg-primary-100 px-1 py-1.5 text-center">
              <button
                type="button"
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 float-right"
                title="Sil"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </td>
          )}
        </tr>
        {contextMenu && (
          <ContextMenuOverlay
            x={contextMenu.x}
            y={contextMenu.y}
            menuRef={menuRef}
            onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
            onDelete={() => { onDelete(); setContextMenu(null); }}
            onInsertHeaderAbove={onInsertHeaderAbove ? () => { onInsertHeaderAbove(); setContextMenu(null); } : undefined}
            onToggleHighlight={() => { onUpdate({ highlight: !item.highlight }); setContextMenu(null); }}
            isHighlighted={!!item.highlight}
          />
        )}
      </>
    );
  }

  // ---- PRODUCT / CUSTOM / SET rows ----
  const isCustom = item.itemType === 'CUSTOM';
  const isSet = item.itemType === 'SET';
  const isSetParent = isSet && !item.parentItemId;

  return (
    <>
      <tr
        draggable={!isSubRow}
        onDragStart={isSubRow ? undefined : guardedDragStart}
        onDragOver={isSubRow ? undefined : onDragOver}
        onDrop={isSubRow ? undefined : onDrop}
        onContextMenu={handleContextMenu}
        className={cn(
          'group text-sm hover:bg-accent-50 transition-colors',
          isDragging && 'opacity-70 bg-accent-50',
          isLowMargin && canViewCosts && 'bg-red-50',
          isSubRow && 'bg-blue-50/30 text-accent-500',
          isSetParent && 'bg-indigo-50/60',
          item.highlight && 'bg-yellow-100',
        )}
      >
        {/* Drag handle */}
        <td className="w-8 border border-accent-200 px-1 py-1.5 text-center">
          {!isSubRow && (
            <span className="flex items-center justify-center gap-1">
              {onToggleSelected && (
                <input
                  type="checkbox"
                  checked={!!isSelected}
                  onChange={onToggleSelected}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('h-3 w-3 cursor-pointer', !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity')}
                  aria-label="Seçim"
                />
              )}
              <GripVertical className="h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          )}
        </td>

        {/* POZ NO - editable */}
        <td className="border border-accent-200 px-1 py-1.5 text-center tabular-nums text-accent-700 whitespace-nowrap">
          <span className="flex items-center justify-center gap-0.5">
            {isSet && <Package className="h-3 w-3 text-accent-500 shrink-0" />}
            <PozNoInput
              value={item.customPozNo ?? pozNo ?? ''}
              onCommit={(val) => onUpdate({ customPozNo: val || null })}
              fallback={pozNo ?? ''}
            />
          </span>
        </td>

        {/* MARKA / MODEL / KOD */}
        {columnVisibility.urun && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap text-xs text-accent-700 max-w-[100px] truncate" title={item.brand || undefined}>
              {isCustom ? (
                <EditableCell
                  value={item.brand || ''}
                  displayValue={item.brand || '-'}
                  onChange={(v) => onUpdate({ brand: String(v) || null })}
                  className="text-xs"
                />
              ) : (
                item.brand || '-'
              )}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap text-xs text-accent-500 max-w-[100px] truncate" title={item.model || undefined}>
              {isCustom ? (
                <EditableCell
                  value={item.model || ''}
                  displayValue={item.model || '-'}
                  onChange={(v) => onUpdate({ model: String(v) || null })}
                  className="text-xs"
                />
              ) : (
                item.model || '-'
              )}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap max-w-[80px] truncate">
              {isCustom ? (
                <EditableCell
                  value={item.code || ''}
                  displayValue={item.code || '-'}
                  onChange={(v) => onUpdate({ code: String(v) || null })}
                  className="text-xs font-mono"
                />
              ) : item.code ? (
                <code className="text-xs font-mono text-accent-600 bg-accent-50 px-1 rounded">
                  {item.code}
                </code>
              ) : (
                <span className="text-accent-400">-</span>
              )}
            </td>
          </>
        )}

        {/* ACIKLAMA */}
        <td className="border border-accent-200 px-2 py-1.5 align-top">
          <div className="flex items-start gap-1">
            {isSubRow && <span className="text-accent-400 mr-1">↳</span>}
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className={cn(
                'text-sm whitespace-normal break-words block',
                isSubRow ? 'text-accent-500' : 'text-accent-900',
              )}
            />
            {item.productId && onShowPriceHistory && (
              <button
                type="button"
                onClick={onShowPriceHistory}
                className="shrink-0 text-accent-400 hover:text-blue-600 transition-colors"
                title="Fiyat Geçmişi"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>

        {/* MIKTAR — always editable, even when a price label is set.
            The client may ship 10 adet "FİYATA DAHİLDİR" items and they
            still need to see the quantity. */}
        <td className="border border-accent-200 px-0 py-0 text-right whitespace-nowrap cursor-pointer">
          <div className="flex flex-col items-end px-2 py-1.5 w-full h-full">
            <div className="w-full text-right">
              <EditableCell
                value={Number(item.quantity)}
                type="number"
                onChange={(v) => {
                  const qty = Number(v);
                  const total = qty * Number(item.unitPrice) * (1 - Number(item.discountPct) / 100);
                  onUpdate({ quantity: qty, totalPrice: total });
                }}
                displayValue={formatNumber(Number(item.quantity), 2)}
                className="text-right w-full inline-block"
              />
            </div>
            <select
              value={item.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              className="text-xs text-accent-600 bg-transparent border-none p-0 pr-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 rounded appearance-none w-full"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 8 8\'%3E%3Cpath d=\'M0 2l4 4 4-4z\' fill=\'%23666\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center' }}
            >
              {unitList.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </td>

        {/* BIRIM FIYAT + TOPLAM FIYAT. When priceLabel is set these two
            columns collapse into a merged cell showing the label text;
            MIKTAR stays editable above. Changing / clearing the label
            is done via the right-click context menu, not an inline
            control — inline selects auto-size to the longest option
            and overlap other cells. */}
        {item.priceLabel ? (
          columnVisibility.fiyat ? (
            <td
              colSpan={2}
              className="border border-accent-200 bg-accent-50 px-2 py-1.5 text-center whitespace-nowrap"
            >
              <span className="text-xs font-semibold text-accent-800">
                {item.priceLabel}
              </span>
            </td>
          ) : null
        ) : (
          <>
            {/* BIRIM FIYAT (Teklif Satış Fiyatları group) */}
            {columnVisibility.fiyat && (
              <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
                <EditableCell
                  value={Number(item.unitPrice)}
                  type="number"
                  readOnly={isSetParent || !item.isManualPrice}
                  onChange={(v) => {
                    const up = roundUnitPrice(Number(v));
                    const total = computeRowTotal({
                      quantity: Number(item.quantity),
                      unitPrice: up,
                      discountPct: Number(item.discountPct),
                    });
                    onUpdate({ unitPrice: up, totalPrice: total });
                  }}
                  displayValue={formatPrice(Number(item.unitPrice), currency)}
                  className="text-right"
                />
              </td>
            )}

            {/* TOPLAM FIYAT (Teklif Satış Fiyatları group) */}
            {columnVisibility.fiyat && (() => {
              const itemTotal = Number(item.totalPrice);
              const afterOverall = overallDiscountPct > 0 ? itemTotal * (1 - overallDiscountPct / 100) : itemTotal;
              const showItemDisc = discPct > 0;
              const showOverallDisc = overallDiscountPct > 0;
              return (
                <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-medium text-accent-900">
                  {(showItemDisc || showOverallDisc) ? (
                    <div className="flex flex-col items-end">
                      {showItemDisc && (
                        <span className="text-xs text-accent-400 line-through">
                          {formatPrice(Number(item.quantity) * unitPriceNum, currency)}
                        </span>
                      )}
                      {showOverallDisc ? (
                        <>
                          <span className={showItemDisc ? 'text-xs text-accent-400 line-through' : 'text-xs text-accent-400 line-through'}>
                            {formatPrice(itemTotal, currency)}
                          </span>
                          <span className="text-green-700">
                            {formatPrice(afterOverall, currency)}
                          </span>
                        </>
                      ) : (
                        <span className="text-green-700">
                          {formatPrice(itemTotal, currency)}
                        </span>
                      )}
                    </div>
                  ) : (
                    formatPrice(itemTotal, currency)
                  )}
                </td>
              );
            })()}
          </>
        )}

        {/* KATSAYI + LISTE FIYATI (Teklif Hazırlama group) */}
        {columnVisibility.fiyat && (
          <>
            <td
              data-field="katsayi"
              data-sort-order={item.sortOrder}
              className={cn(
                'border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap',
                isKatsayiOutOfRange && !isSetParent && 'bg-amber-50 border-amber-300',
              )}
              title={isKatsayiOutOfRange && !isSetParent && katsayiRangeLabel ? `Belirlenen aralik disinda! ${katsayiRangeLabel}` : undefined}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                const currentOrder = item.sortOrder;
                // Find all katsayi cells in the table
                const allKatsayiCells = Array.from(
                  document.querySelectorAll<HTMLElement>('td[data-field="katsayi"]')
                );
                // Sort by sort order
                allKatsayiCells.sort(
                  (a, b) => Number(a.dataset.sortOrder) - Number(b.dataset.sortOrder)
                );
                const currentIdx = allKatsayiCells.findIndex(
                  (cell) => Number(cell.dataset.sortOrder) === currentOrder
                );
                const targetIdx = e.key === 'ArrowDown' ? currentIdx + 1 : currentIdx - 1;
                if (targetIdx >= 0 && targetIdx < allKatsayiCells.length) {
                  e.preventDefault();
                  const targetCell = allKatsayiCells[targetIdx];
                  // Click the editable span to activate editing, or focus the input if already editing
                  const editableSpan = targetCell.querySelector<HTMLElement>('[data-editable="true"]');
                  if (editableSpan) {
                    editableSpan.click();
                    // After click triggers editing, focus the new input on next tick
                    requestAnimationFrame(() => {
                      const input = targetCell.querySelector<HTMLInputElement>('input');
                      if (input) {
                        input.focus();
                        input.select();
                      }
                    });
                  }
                }
              }}
            >
              {isSetParent ? (
                <span className="text-accent-400 tabular-nums">-</span>
              ) : (
                <>
                  <div className="flex items-center justify-end gap-1">
                    {isKatsayiOutOfRange && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <EditableCell
                      value={Number(item.katsayi)}
                      type="number"
                      onChange={(v) => {
                        const k = Number(v);
                        const shouldCalc = isCustom || !item.isManualPrice;
                        // Include ek maliyet delta in effective list price,
                        // then tier-round the resulting unit price.
                        const newUnitPrice = shouldCalc
                          ? roundUnitPrice(effectiveListPriceNum * k)
                          : Number(item.unitPrice);
                        const total = computeRowTotal({
                          quantity: Number(item.quantity),
                          unitPrice: newUnitPrice,
                          discountPct: Number(item.discountPct),
                        });
                        onUpdate({ katsayi: k, unitPrice: newUnitPrice, totalPrice: total });
                      }}
                      displayValue={formatNumber(Number(item.katsayi), 4)}
                      className={cn('text-right', isKatsayiOutOfRange && 'text-amber-700 font-medium')}
                    />
                  </div>
                  {isKatsayiOutOfRange && katsayiRangeLabel && (
                    <div className="text-[10px] text-amber-600 mt-0.5 text-right">{katsayiRangeLabel}</div>
                  )}
                </>
              )}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {isSetParent ? (
                <span className="text-accent-400 tabular-nums">-</span>
              ) : (
                <EditableCell
                  value={Number(item.listPrice)}
                  type="number"
                  onChange={(v) => {
                    const lp = Number(v);
                    const shouldCalc = isCustom || !item.isManualPrice;
                    // unitPrice calculation uses the effective list price
                    // (base + ek maliyet delta), tier-rounded so display
                    // and math stay consistent.
                    const effectiveLp = lp + ekDelta;
                    const newUnitPrice = shouldCalc
                      ? roundUnitPrice(effectiveLp * Number(item.katsayi))
                      : Number(item.unitPrice);
                    const total = computeRowTotal({
                      quantity: Number(item.quantity),
                      unitPrice: newUnitPrice,
                      discountPct: Number(item.discountPct),
                    });
                    onUpdate({ listPrice: lp, unitPrice: newUnitPrice, totalPrice: total });
                  }}
                  displayValue={formatPrice(effectiveListPriceNum, currency)}
                  className="text-right"
                />
              )}
            </td>
          </>
        )}

        {/* MALIYET / KAR / KAR % */}
        {canViewCosts && columnVisibility.maliyet && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {effectiveCostPriceNum != null ? formatPrice(effectiveCostPriceNum, currency) : '-'}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
              <span className={cn(isLowMargin && 'text-red-600 font-medium')}>
                {effectiveCostPriceNum != null
                  ? formatPrice(effectiveUnitPrice - effectiveCostPriceNum, currency)
                  : '-'}
              </span>
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
              <span className={cn(isLowMargin && 'text-red-600 font-medium')}>
                {margin !== null ? `%${formatNumber(margin, 1)}` : '-'}
              </span>
            </td>
          </>
        )}

        {/* PARA BIRIMI */}
        <td className="border border-accent-200 px-1 py-1.5 text-center text-xs text-accent-500 whitespace-nowrap">
          {currency}
        </td>

        {/* PRICE HISTORY: Son Teklif + Δ% | Sipariş + Δ% | En Yüksek + Δ% | En Düşük + Δ% */}
        {columnVisibility.gecmis && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-xs text-accent-700">
              {priceHistory?.lastQuoted
                ? formatPrice(priceHistory.lastQuoted.unitPrice, currency)
                : '-'}
            </td>
            <td className="border border-accent-200 px-1 py-1.5 text-right tabular-nums whitespace-nowrap text-xs">
              <DeltaCell
                currentPrice={unitPriceNum}
                historicalPrice={priceHistory?.lastQuoted?.unitPrice}
              />
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-xs text-accent-700">
              {priceHistory?.lastOrdered
                ? formatPrice(priceHistory.lastOrdered.unitPrice, currency)
                : '-'}
            </td>
            <td className="border border-accent-200 px-1 py-1.5 text-right tabular-nums whitespace-nowrap text-xs">
              <DeltaCell
                currentPrice={unitPriceNum}
                historicalPrice={priceHistory?.lastOrdered?.unitPrice}
              />
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-xs text-accent-700">
              {priceHistory?.highest
                ? formatPrice(priceHistory.highest.unitPrice, currency)
                : '-'}
            </td>
            <td className="border border-accent-200 px-1 py-1.5 text-right tabular-nums whitespace-nowrap text-xs">
              <DeltaCell
                currentPrice={unitPriceNum}
                historicalPrice={priceHistory?.highest?.unitPrice}
              />
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-xs text-accent-700">
              {priceHistory?.lowest
                ? formatPrice(priceHistory.lowest.unitPrice, currency)
                : '-'}
            </td>
            <td className="border border-accent-200 px-1 py-1.5 text-right tabular-nums whitespace-nowrap text-xs">
              <DeltaCell
                currentPrice={unitPriceNum}
                historicalPrice={priceHistory?.lowest?.unitPrice}
              />
            </td>
          </>
        )}

        {/* Delete */}
        <td className="w-10 border border-accent-200 px-1 py-1.5 text-center">
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
            title="Sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {contextMenu && (
        <ContextMenuOverlay
          x={contextMenu.x}
          y={contextMenu.y}
          menuRef={menuRef}
          onDuplicate={() => { onDuplicate(); setContextMenu(null); }}
          onDelete={() => { onDelete(); setContextMenu(null); }}
          onInsertHeaderAbove={onInsertHeaderAbove ? () => { onInsertHeaderAbove(); setContextMenu(null); } : undefined}
          onSwapProduct={onSwapProduct ? () => { onSwapProduct(); setContextMenu(null); } : undefined}
          onToggleHighlight={() => { onUpdate({ highlight: !item.highlight }); setContextMenu(null); }}
          isHighlighted={!!item.highlight}
          onSetPriceLabel={(label) => { onUpdate({ priceLabel: label }); setContextMenu(null); }}
          currentPriceLabel={item.priceLabel ?? null}
          priceLabelOptions={priceLabelOptions}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Context menu portal-like overlay
// ---------------------------------------------------------------------------

interface ContextMenuOverlayProps {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertHeaderAbove?: () => void;
  /** Right-click → "Ürün Değiştir". When omitted, the menu item is hidden. */
  onSwapProduct?: () => void;
  onToggleHighlight?: () => void;
  isHighlighted?: boolean;
  onSetPriceLabel?: (label: string | null) => void;
  currentPriceLabel?: string | null;
  /** Admin-managed catalog of price label options. When omitted the
   *  "Fiyat yerine" section of the menu is hidden. */
  priceLabelOptions?: ReadonlyArray<{ id: string; label: string }>;
}

function ContextMenuOverlay({
  x,
  y,
  menuRef,
  onDuplicate,
  onDelete,
  onInsertHeaderAbove,
  onSwapProduct,
  onToggleHighlight,
  isHighlighted,
  onSetPriceLabel,
  currentPriceLabel,
  priceLabelOptions,
}: ContextMenuOverlayProps) {
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] rounded-lg border border-accent-200 bg-white py-1 shadow-lg"
      style={{ top: y, left: x }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-accent-700 hover:bg-accent-100 transition-colors"
        onClick={onDuplicate}
      >
        <Copy className="h-3.5 w-3.5" /> Kopyala
      </button>
      {onInsertHeaderAbove && (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-accent-700 hover:bg-accent-100 transition-colors"
          onClick={onInsertHeaderAbove}
        >
          <Plus className="h-3.5 w-3.5" /> Üstüne Başlık Ekle
        </button>
      )}
      {onSwapProduct && (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-accent-700 hover:bg-accent-100 transition-colors"
          onClick={onSwapProduct}
        >
          <Package className="h-3.5 w-3.5" /> Ürün Değiştir
        </button>
      )}
      {onToggleHighlight && (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-accent-700 hover:bg-accent-100 transition-colors"
          onClick={onToggleHighlight}
        >
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-yellow-400 bg-yellow-200" />
          {isHighlighted ? 'Vurguyu Kaldır' : 'Vurgula'}
        </button>
      )}
      {onSetPriceLabel && (currentPriceLabel || (priceLabelOptions && priceLabelOptions.length > 0)) && (
        <>
          <div className="my-1 border-t border-accent-200" />
          <div className="px-3 py-0.5 text-[10px] uppercase tracking-wide text-accent-400">
            Fiyat yerine
          </div>
          {/* If the item already has a label that's no longer in the
              catalog (admin deleted/deactivated it), still show it as a
              disabled "current" row so the user knows what's set. */}
          {currentPriceLabel && !priceLabelOptions?.some(o => o.label === currentPriceLabel) && (
            <div className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-accent-500 bg-accent-50 font-semibold">
              {currentPriceLabel}
            </div>
          )}
          {priceLabelOptions?.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-accent-700 hover:bg-accent-100 transition-colors',
                currentPriceLabel === opt.label && 'bg-accent-50 font-semibold',
              )}
              onClick={() => onSetPriceLabel(opt.label)}
            >
              {opt.label}
            </button>
          ))}
          {/* Always render the "clear" button when a label is set, even
              if the catalog is empty — otherwise the user has no way to
              revert to numeric pricing. */}
          {currentPriceLabel && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-accent-500 hover:bg-accent-100 transition-colors"
              onClick={() => onSetPriceLabel(null)}
            >
              ← Fiyat girişine dön
            </button>
          )}
        </>
      )}
      <div className="my-1 border-t border-accent-200" />
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" /> Sil
      </button>
    </div>,
    document.body,
  );
}
