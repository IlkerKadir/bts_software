'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  GripVertical,
  Trash2,
  Clock,
  Copy,
  Wrench,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteItemData {
  id: string;
  productId?: string | null;
  parentItemId?: string | null;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE' | 'SUBTOTAL';
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
  isManualPrice?: boolean;
  costPrice?: number | null;
  serviceMeta?: any;
  subRows?: QuoteItemData[];
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
  pozNo: number | null;
  currency: string;
  canViewCosts: boolean;
  canOverrideKatsayi?: boolean;
  isDragging?: boolean;
  isSubRow?: boolean;
  columnVisibility: ColumnVisibility;
  priceHistory?: PriceHistoryStats;
  totalColCount: number;
  subtotalValue?: number;
  onUpdate: (updates: Partial<QuoteItemData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onShowPriceHistory?: () => void;
  onInsertHeaderAbove?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price) + ' ' + currency;
}

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

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
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (type === 'number') {
      const parsed = parseFloat(draft.replace(',', '.'));
      if (!isNaN(parsed) && parsed !== value) {
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
  canViewCosts,
  canOverrideKatsayi,
  isDragging = false,
  isSubRow = false,
  columnVisibility,
  priceHistory,
  totalColCount,
  subtotalValue,
  onUpdate,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop,
  onShowPriceHistory,
  onInsertHeaderAbove,
}: QuoteItemRowProps) {
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

  // Margin helpers
  const unitPriceNum = Number(item.unitPrice) || 0;
  const discPct = Number(item.discountPct) || 0;
  const effectiveUnitPrice = unitPriceNum * (1 - discPct / 100);
  const costPriceNum = item.costPrice != null ? Number(item.costPrice) : null;
  const margin =
    costPriceNum != null && costPriceNum > 0 && effectiveUnitPrice > 0
      ? ((effectiveUnitPrice - costPriceNum) / effectiveUnitPrice) * 100
      : null;
  const isLowMargin = margin !== null && margin < 15;
  const stickyBg = isLowMargin && canViewCosts ? 'bg-red-50' : 'bg-white';

  // ColSpan for HEADER/NOTE rows (all columns except drag + delete)
  const spanColCount = totalColCount - 2;

  // ---- HEADER row ----
  if (item.itemType === 'HEADER') {
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-40')}
        >
          <td className="w-8 border border-accent-200 bg-[#F3F4F6] px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={spanColCount}
            className="border border-accent-200 bg-[#F3F4F6] px-3 py-2 font-bold text-accent-800 text-sm"
          >
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="font-bold"
            />
          </td>
          <td className="w-10 border border-accent-200 bg-[#F3F4F6] px-1 py-1.5 text-center">
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
          />
        )}
      </>
    );
  }

  // ---- NOTE row ----
  if (item.itemType === 'NOTE') {
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-40')}
        >
          <td className="w-8 border border-accent-200 bg-white px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={spanColCount}
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
          />
        )}
      </>
    );
  }

  // ---- SUBTOTAL row ----
  if (item.itemType === 'SUBTOTAL') {
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn('group', isDragging && 'opacity-40')}
        >
          <td className="w-8 border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={columnVisibility.fiyat ? totalColCount - 3 : totalColCount - 2}
            className="border border-accent-200 bg-accent-100 px-3 py-2 text-right font-bold text-accent-800 text-sm"
          >
            Ara Toplam
          </td>
          {columnVisibility.fiyat && (
            <td className="border border-accent-200 bg-accent-100 px-2 py-2 text-right tabular-nums font-bold text-accent-900 whitespace-nowrap">
              {formatPrice(subtotalValue ?? 0, currency)}
            </td>
          )}
          <td className="w-10 border border-accent-200 bg-accent-100 px-1 py-1.5 text-center">
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
          />
        )}
      </>
    );
  }

  // ---- PRODUCT / CUSTOM / SERVICE rows ----
  const isService = item.itemType === 'SERVICE';

  return (
    <>
      <tr
        draggable={!isSubRow}
        onDragStart={isSubRow ? undefined : onDragStart}
        onDragOver={isSubRow ? undefined : onDragOver}
        onDrop={isSubRow ? undefined : onDrop}
        onContextMenu={handleContextMenu}
        className={cn(
          'group text-sm hover:bg-accent-50 transition-colors',
          isDragging && 'opacity-40',
          isLowMargin && canViewCosts && 'bg-red-50',
          isSubRow && 'bg-blue-50/30 text-accent-500',
        )}
      >
        {/* Drag handle - sticky */}
        <td className={cn('w-8 border border-accent-200 px-1 py-1.5 text-center sticky left-0 z-10', isSubRow ? 'bg-blue-50/30' : stickyBg)}>
          {!isSubRow && (
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </td>

        {/* POZ NO - sticky */}
        <td className={cn('border border-accent-200 px-2 py-1.5 text-center tabular-nums text-accent-700 whitespace-nowrap sticky left-[33px] z-10', stickyBg)}>
          <span className="flex items-center justify-center gap-1">
            {isService && <Wrench className="h-3 w-3 text-accent-500" />}
            {pozNo ?? '-'}
          </span>
        </td>

        {/* MARKA / MODEL / KOD */}
        {columnVisibility.urun && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap text-xs text-accent-700 max-w-[100px] truncate" title={item.brand || undefined}>
              {item.brand || '-'}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap text-xs text-accent-500 max-w-[100px] truncate" title={item.model || undefined}>
              {item.model || '-'}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 whitespace-nowrap max-w-[80px] truncate">
              {item.code ? (
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
        <td className="border border-accent-200 px-2 py-1.5 max-w-[300px]">
          <div className="flex items-center gap-1">
            {isSubRow && <span className="text-accent-400 mr-1">↳</span>}
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className={cn('text-sm truncate', isSubRow ? 'text-accent-500' : 'text-accent-900')}
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

        {/* MIKTAR */}
        <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
          <EditableCell
            value={Number(item.quantity)}
            type="number"
            onChange={(v) => {
              const qty = Number(v);
              const total = qty * Number(item.unitPrice) * (1 - Number(item.discountPct) / 100);
              onUpdate({ quantity: qty, totalPrice: total });
            }}
            displayValue={formatNumber(Number(item.quantity), 2)}
            className="text-right"
          />
          <select
            value={item.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className="text-xs text-accent-600 bg-transparent border-none p-0 pr-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 rounded appearance-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 8 8\'%3E%3Cpath d=\'M0 2l4 4 4-4z\' fill=\'%23666\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center' }}
          >
            <option value="Adet">Ad.</option>
            <option value="Metre">m.</option>
            <option value="Set">Set</option>
            <option value="Kişi/Gün">Kişi/Gün</option>
          </select>
        </td>

        {/* KATSAYI + LISTE FIYATI (canViewCosts + fiyat group) */}
        {canViewCosts && columnVisibility.fiyat && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
              <EditableCell
                value={Number(item.katsayi)}
                type="number"
                readOnly={!canOverrideKatsayi}
                onChange={(v) => {
                  const k = Number(v);
                  const newUnitPrice = item.isManualPrice ? Number(item.unitPrice) : Number(item.listPrice) * k;
                  const total = Number(item.quantity) * newUnitPrice * (1 - Number(item.discountPct) / 100);
                  onUpdate({ katsayi: k, unitPrice: newUnitPrice, totalPrice: total });
                }}
                displayValue={formatNumber(Number(item.katsayi), 4)}
                className="text-right"
              />
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {formatPrice(Number(item.listPrice), currency)}
            </td>
          </>
        )}

        {/* BIRIM FIYAT */}
        {columnVisibility.fiyat && (
          <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
            <EditableCell
              value={Number(item.unitPrice)}
              type="number"
              readOnly={!item.isManualPrice}
              onChange={(v) => {
                const up = Number(v);
                const total = Number(item.quantity) * up * (1 - Number(item.discountPct) / 100);
                onUpdate({ unitPrice: up, totalPrice: total });
              }}
              displayValue={formatPrice(Number(item.unitPrice), currency)}
              className="text-right"
            />
          </td>
        )}

        {/* TOPLAM FIYAT */}
        {columnVisibility.fiyat && (
          <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-medium text-accent-900">
            {discPct > 0 ? (
              <div className="flex flex-col items-end">
                <span className="text-xs text-accent-400 line-through">
                  {formatPrice(Number(item.quantity) * unitPriceNum, currency)}
                </span>
                <span className="text-green-700">
                  {formatPrice(Number(item.totalPrice), currency)}
                </span>
              </div>
            ) : (
              formatPrice(Number(item.totalPrice), currency)
            )}
          </td>
        )}

        {/* MALIYET / KAR / KAR % */}
        {canViewCosts && columnVisibility.maliyet && (
          <>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {item.costPrice != null ? formatPrice(Number(item.costPrice), currency) : '-'}
            </td>
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
              <span className={cn(isLowMargin && 'text-red-600 font-medium')}>
                {item.costPrice != null
                  ? formatPrice(effectiveUnitPrice - Number(item.costPrice), currency)
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
        {canViewCosts && columnVisibility.gecmis && (
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
}

function ContextMenuOverlay({
  x,
  y,
  menuRef,
  onDuplicate,
  onDelete,
  onInsertHeaderAbove,
}: ContextMenuOverlayProps) {
  return (
    <tr className="contents">
      <td>
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-accent-200 bg-white py-1 shadow-lg"
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
          <div className="my-1 border-t border-accent-200" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Sil
          </button>
        </div>
      </td>
    </tr>
  );
}
