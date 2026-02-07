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
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE';
  sortOrder: number;
  code?: string | null;
  brand?: string | null;
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
}

export interface QuoteItemRowProps {
  item: QuoteItemData;
  pozNo: number | null;
  currency: string;
  canViewCosts: boolean;
  isDragging?: boolean;
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
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(String(value));
          setEditing(false);
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
  isDragging = false,
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
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Margin helpers - convert Prisma Decimal values (strings) to numbers
  const unitPriceNum = Number(item.unitPrice) || 0;
  const costPriceNum = item.costPrice != null ? Number(item.costPrice) : null;
  const margin =
    costPriceNum != null && costPriceNum > 0 && unitPriceNum > 0
      ? ((unitPriceNum - costPriceNum) / unitPriceNum) * 100
      : null;
  const isLowMargin = margin !== null && margin < 15;

  // ---- HEADER row ----
  if (item.itemType === 'HEADER') {
    const colSpan = canViewCosts ? 10 : 5;
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn(
            'group',
            isDragging && 'opacity-40',
          )}
        >
          {/* drag handle */}
          <td className="w-8 border border-accent-200 bg-[#F3F4F6] px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={colSpan}
            className="border border-accent-200 bg-[#F3F4F6] px-3 py-2 font-bold text-accent-800 text-sm"
          >
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="font-bold"
            />
          </td>
          {/* delete */}
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
    const colSpan = canViewCosts ? 10 : 5;
    return (
      <>
        <tr
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          className={cn(
            'group',
            isDragging && 'opacity-40',
          )}
        >
          <td className="w-8 border border-accent-200 bg-white px-1 py-1.5 text-center">
            <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </td>
          <td
            colSpan={colSpan}
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

  // ---- PRODUCT / CUSTOM / SERVICE rows ----
  const isService = item.itemType === 'SERVICE';

  return (
    <>
      <tr
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={handleContextMenu}
        className={cn(
          'group text-sm hover:bg-accent-50 transition-colors',
          isDragging && 'opacity-40',
          isLowMargin && canViewCosts && 'bg-red-50',
        )}
      >
        {/* Drag handle */}
        <td className="w-8 border border-accent-200 px-1 py-1.5 text-center">
          <GripVertical className="mx-auto h-4 w-4 cursor-grab text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </td>

        {/* POZ NO */}
        <td className="border border-accent-200 px-2 py-1.5 text-center tabular-nums text-accent-700 whitespace-nowrap">
          <span className="flex items-center justify-center gap-1">
            {isService && <Wrench className="h-3 w-3 text-accent-500" />}
            {pozNo ?? '-'}
          </span>
        </td>

        {/* ACIKLAMA */}
        <td className="border border-accent-200 px-2 py-1.5 max-w-[300px]">
          <div className="flex items-center gap-1">
            <EditableCell
              value={item.description}
              onChange={(v) => onUpdate({ description: String(v) })}
              className="text-sm text-accent-900 truncate"
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
          {item.code && (
            <span className="text-xs text-accent-500">{item.code}</span>
          )}
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
          <span className="ml-1 text-xs text-accent-500">{item.unit}</span>
        </td>

        {/* Cost columns – only for canViewCosts */}
        {canViewCosts && (
          <>
            {/* KATSAYI */}
            <td className="border border-accent-200 px-2 py-1.5 text-right whitespace-nowrap">
              <EditableCell
                value={Number(item.katsayi)}
                type="number"
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

            {/* LISTE FIYATI */}
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {formatPrice(Number(item.listPrice), currency)}
            </td>

            {/* MALIYET */}
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-accent-700">
              {item.costPrice != null ? formatPrice(Number(item.costPrice), currency) : '-'}
            </td>

            {/* KAR */}
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
              <span className={cn(isLowMargin && 'text-red-600 font-medium')}>
                {item.costPrice != null
                  ? formatPrice(Number(item.unitPrice) - Number(item.costPrice), currency)
                  : '-'}
              </span>
            </td>

            {/* KAR % */}
            <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
              <span className={cn(isLowMargin && 'text-red-600 font-medium')}>
                {margin !== null ? `%${formatNumber(margin, 1)}` : '-'}
              </span>
            </td>
          </>
        )}

        {/* BIRIM FIYAT */}
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

        {/* TOPLAM FIYAT */}
        <td className="border border-accent-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-medium text-accent-900">
          {formatPrice(Number(item.totalPrice), currency)}
        </td>

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
// Context menu portal-like overlay (rendered via React portal-style fixed div)
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
