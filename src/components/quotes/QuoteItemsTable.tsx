'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Plus, Type, StickyNote, Wrench, AlertTriangle,
  Package, DollarSign, Calculator, Clock, Layers,
  Filter, X, Search, ChevronDown, Sigma,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import {
  QuoteItemRow,
  formatPrice,
  formatNumber,
  type QuoteItemData,
  type PriceHistoryStats,
  type ColumnVisibility,
} from './QuoteItemRow';
import { BrandProfitSummary } from './BrandProfitSummary';
import { getEffectiveCostPrice } from '@/lib/ek-maliyet';
import { useSettings } from '@/components/settings/SettingsProvider';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuoteItemsTableProps {
  items: QuoteItemData[];
  currency: string;
  discountPct: number;
  discountLabel?: string;
  onDiscountLabelChange?: (value: string) => void;
  /** cuid of the SUBTOTAL row the discount should apply to, or null
   *  for "apply to the whole quote". Controls both the summary math
   *  at the bottom of the table and which section the discount line
   *  shows under. */
  discountScopeSubtotalId?: string | null;
  onDiscountScopeChange?: (subtotalId: string | null) => void;
  canViewCosts: boolean;
  onItemUpdate: (itemId: string, updates: Partial<QuoteItemData>) => void;
  onItemDelete: (itemId: string) => void;
  onItemDuplicate: (itemId: string) => void;
  onReorder: (items: QuoteItemData[]) => void;
  onDiscountPctChange: (value: number) => void;
  onAddProduct: () => void;
  onAddHeader: () => void;
  onAddNote: () => void;
  onAddCustomItem?: () => void;
  onAddSubtotal?: () => void;
  onAddGrandTotal?: () => void;
  onAddSubItem?: (parentId: string) => void;
  onAddCustomSubItem?: (parentId: string) => void;
  onCreateSet?: () => void;
  onOpenEkMaliyet?: () => void;
  onShowPriceHistory?: (productId: string) => void;
  canOverrideKatsayi?: boolean;
  priceHistoryBatch?: Record<string, PriceHistoryStats>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bts-quote-column-visibility';
const COLUMN_WIDTHS_STORAGE_KEY = 'bts-quote-column-widths';

const defaultVisibility: ColumnVisibility = {
  urun: true,
  fiyat: true,
  maliyet: true,
  gecmis: true,
};

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  drag: 32,
  pozNo: 50,
  marka: 90,
  model: 90,
  kod: 80,
  aciklama: 250,
  miktar: 70,
  birimFiyat: 110,
  toplamFiyat: 110,
  katsayi: 80,
  listeFiyati: 110,
  maliyet: 90,
  kar: 70,
  karPct: 55,
  pb: 40,
  sonTeklif: 90,
  delta1: 45,
  siparis: 90,
  delta2: 45,
  enYuksek: 90,
  delta3: 45,
  enDusuk: 90,
  delta4: 45,
  delete: 40,
};

const COLUMN_GROUPS = [
  { key: 'urun' as const, label: 'Ürün', Icon: Package, requiresCosts: false },
  { key: 'fiyat' as const, label: 'Fiyat', Icon: DollarSign, requiresCosts: false },
  { key: 'maliyet' as const, label: 'Maliyet', Icon: Calculator, requiresCosts: true },
  { key: 'gecmis' as const, label: 'Geçmiş', Icon: Clock, requiresCosts: false },
];

// ---------------------------------------------------------------------------
// QuoteItemsTable
// ---------------------------------------------------------------------------

export function QuoteItemsTable({
  items,
  currency,
  discountPct,
  discountLabel: discountLabelProp = 'İskonto',
  onDiscountLabelChange,
  discountScopeSubtotalId = null,
  onDiscountScopeChange,
  canViewCosts,
  onItemUpdate,
  onItemDelete,
  onItemDuplicate,
  onReorder,
  onDiscountPctChange,
  onAddProduct,
  onAddHeader,
  onAddNote,
  onAddCustomItem,
  onAddSubtotal,
  onAddGrandTotal,
  onAddSubItem,
  onAddCustomSubItem,
  onCreateSet,
  onOpenEkMaliyet,
  onShowPriceHistory,
  canOverrideKatsayi,
  priceHistoryBatch,
}: QuoteItemsTableProps) {
  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Collapsed parent state for sub-row toggle
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMN_WIDTHS;
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      return saved ? { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) } : DEFAULT_COLUMN_WIDTHS;
    } catch {
      return DEFAULT_COLUMN_WIDTHS;
    }
  });
  const isResizingRef = useRef(false);
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;
  const tableRef = useRef<HTMLTableElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const stickyHeaderInnerRef = useRef<HTMLDivElement>(null);

  // Sync sticky header horizontal scroll with main table via direct DOM manipulation
  // (avoids React re-render on every scroll pixel for performance on large quotes)
  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }, []);

  // Re-sync sticky header after column visibility or table width changes
  // (browser may auto-clamp scrollLeft when table gets narrower)
  const syncScrollLeft = useCallback(() => {
    if (mainScrollRef.current && stickyHeaderInnerRef.current) {
      const sl = mainScrollRef.current.scrollLeft;
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }, []);

  const handleThMouseDown = useCallback((e: React.MouseEvent<HTMLTableCellElement>, colKey: string) => {
    // Check if near right edge directly (don't rely on cursor style)
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.right - 8) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = columnWidthsRef.current[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 80;
    isResizingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX;
      const newWidth = Math.max(40, startWidth + diff);
      setColumnWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        try { localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    };

    const onUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleThMouseMove = useCallback((e: React.MouseEvent<HTMLTableCellElement>) => {
    if (isResizingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isNearRightEdge = e.clientX >= rect.right - 8;
    e.currentTarget.style.cursor = isNearRightEdge ? 'col-resize' : '';
  }, []);

  const discountLabel = discountLabelProp;

  // Column visibility with localStorage persistence
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    if (typeof window === 'undefined') return defaultVisibility;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaultVisibility, ...JSON.parse(stored) } : defaultVisibility;
    } catch {
      return defaultVisibility;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const toggleGroup = useCallback((key: keyof ColumnVisibility) => {
    setColumnVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Compute total table width from visible columns so table-layout: fixed respects exact widths
  const tableWidth = useMemo(() => {
    let w = columnWidths.drag + columnWidths.pozNo + columnWidths.aciklama + columnWidths.miktar + columnWidths.pb + columnWidths.delete;
    if (columnVisibility.urun) w += columnWidths.marka + columnWidths.model + columnWidths.kod;
    if (columnVisibility.fiyat) w += columnWidths.birimFiyat + columnWidths.toplamFiyat + columnWidths.katsayi + columnWidths.listeFiyati;
    if (canViewCosts && columnVisibility.maliyet) w += columnWidths.maliyet + columnWidths.kar + columnWidths.karPct;
    if (columnVisibility.gecmis) w += columnWidths.sonTeklif + columnWidths.delta1 + columnWidths.siparis + columnWidths.delta2 + columnWidths.enYuksek + columnWidths.delta3 + columnWidths.enDusuk + columnWidths.delta4;
    return w;
  }, [columnWidths, columnVisibility, canViewCosts]);

  // Re-sync sticky header when table width or visibility changes
  useEffect(() => {
    syncScrollLeft();
  }, [tableWidth, columnVisibility, canViewCosts, syncScrollLeft]);

  // Sync on window resize
  useEffect(() => {
    window.addEventListener('resize', syncScrollLeft);
    return () => window.removeEventListener('resize', syncScrollLeft);
  }, [syncScrollLeft]);

  // ── Filter state ──────────────────────────────────────────────────────────

  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [textFilter, setTextFilter] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  // Admin-managed catalogs come from the dashboard-boundary SettingsProvider,
  // preloaded on the server so every QuoteItemRow reads synchronously with
  // no loading flash and no duplicate fetches across 50+ rows.
  const settings = useSettings();
  const priceLabelCatalog = settings.priceLabels;
  const unitCatalog = settings.quoteDefaults.units;

  // Close brand dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setShowBrandDropdown(false);
      }
    }
    if (showBrandDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBrandDropdown]);

  // Unique brands from all items
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const item of items) {
      if (item.brand) brands.add(item.brand);
    }
    return Array.from(brands).sort();
  }, [items]);

  const hasActiveFilter = brandFilter.size > 0 || textFilter.length > 0;

  // Filtered items: product items that match + headers that have matching items below
  // Build sub-rows lookup: parentId → child items (from nested subRows on each item)
  // Note: items prop comes from topLevelItems which nests children in subRows,
  // so we read item.subRows rather than looking for item.parentItemId in the flat list.
  const subRowsByParent = useMemo(() => {
    const map = new Map<string, QuoteItemData[]>();
    for (const item of items) {
      if (item.subRows && item.subRows.length > 0) {
        map.set(item.id, item.subRows);
      }
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    // Always exclude child items from main list (they render as sub-rows)
    const topLevel = items.filter(i => !i.parentItemId);
    if (!hasActiveFilter) return topLevel;

    // Determine which product items pass the filter
    const passingIds = new Set<string>();
    for (const item of topLevel) {
      // Always include non-filterable row types
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
      if (item.priceLabel) continue;

      let passes = true;
      // SET items without brand should pass brand filter (they are set lines, not branded products)
      if (brandFilter.size > 0 && item.itemType !== 'SET' && (!item.brand || !brandFilter.has(item.brand))) {
        passes = false;
      }
      if (passes && textFilter) {
        const search = textFilter.toLowerCase();
        passes = !!(
          item.code?.toLowerCase().includes(search) ||
          item.model?.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.brand?.toLowerCase().includes(search)
        );
      }
      if (passes) passingIds.add(item.id);
    }

    // Include headers that have at least one passing item after them (before next header)
    // Always include SUBTOTAL rows to maintain section boundaries
    const result: QuoteItemData[] = [];
    let pendingHeader: QuoteItemData | null = null;
    let pendingNotes: QuoteItemData[] = [];

    for (const item of topLevel) {
      if (item.itemType === 'HEADER') {
        pendingHeader = item;
        pendingNotes = [];
        continue;
      }
      if (item.itemType === 'NOTE') {
        pendingNotes.push(item);
        continue;
      }
      if (item.itemType === 'SUBTOTAL') {
        // Always include subtotals when there are passing items before them
        if (result.length > 0) {
          result.push(...pendingNotes);
          result.push(item);
        }
        pendingNotes = [];
        continue;
      }

      if (passingIds.has(item.id)) {
        if (pendingHeader) {
          result.push(pendingHeader);
          pendingHeader = null;
        }
        result.push(...pendingNotes);
        pendingNotes = [];
        result.push(item);
      }
    }

    return result;
  }, [items, brandFilter, textFilter, hasActiveFilter]);

  // Map item id → original index in the full items array (for drag/drop)
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [items]);

  const toggleBrandFilter = useCallback((brand: string) => {
    setBrandFilter((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setBrandFilter(new Set());
    setTextFilter('');
  }, []);

  // No-op drag handler for when filters are active
  const noopDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Build POZ NO mapping: sequential numbering only for PRODUCT / CUSTOM / SET
  // Excludes SUBTOTAL items and child items (parentItemId)
  // Always uses full items array for consistent numbering
  const pozMap = useMemo(() => {
    const map = new Map<string, string>();
    let counter = 1;
    for (const item of items) {
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
        if (!item.parentItemId) {
          if (item.customPozNo) {
            map.set(item.id, item.customPozNo);
            // Only advance counter if the custom value is numeric
            const num = parseInt(item.customPozNo, 10);
            if (!isNaN(num) && String(num) === item.customPozNo) {
              counter = num + 1;
            }
          } else {
            map.set(item.id, String(counter));
            counter++;
          }
        }
      }
    }
    return map;
  }, [items]);

  // Dynamic column count
  const totalColCount = useMemo(() => {
    let count = 2; // drag handle + delete
    count += 1; // Poz No
    count += 1; // Aciklama
    count += 1; // Miktar
    count += 1; // Para Birimi

    if (columnVisibility.urun) count += 3; // Marka, Model, Kod
    if (columnVisibility.fiyat) {
      count += 2; // Birim Fiyat, Toplam Fiyat
      count += 2; // Katsayi, Liste Fiyati (visible to all users)
    }
    if (canViewCosts && columnVisibility.maliyet) count += 3; // Maliyet, Kar, Kar%
    if (columnVisibility.gecmis) count += 8; // 4 prices + 4 deltas

    return count;
  }, [columnVisibility, canViewCosts]);

  // Flat list of SUBTOTAL rows in document order. Used to populate
  // the discount-scope selector and to auto-heal a stale scope id.
  const subtotalRows = useMemo(
    () =>
      items
        .filter((item) => item.itemType === 'SUBTOTAL')
        .map((item, idx) => ({
          id: item.id,
          label: item.description?.trim() || `Ara Toplam ${idx + 1}`,
        })),
    [items]
  );

  // Auto-heal: if the saved scope points at a SUBTOTAL that no longer
  // exists (deleted, converted, etc.), clear it client-side so the
  // dropdown doesn't render a ghost option and the summary math falls
  // back to "whole quote". The server also auto-heals on save.
  useEffect(() => {
    if (!discountScopeSubtotalId) return;
    const stillExists = subtotalRows.some((r) => r.id === discountScopeSubtotalId);
    if (!stillExists) {
      onDiscountScopeChange?.(null);
    }
  }, [discountScopeSubtotalId, subtotalRows, onDiscountScopeChange]);

  // Set of item ids that live inside the scoped SUBTOTAL's section
  // (including the SUBTOTAL row itself). Used to gate the visual
  // "crossed-out raw + green after-discount" rendering on each row so
  // that items outside the scoped section show their raw prices — the
  // actual discount is already reflected in the bottom-of-table
  // summary. Returns `null` when no scope is active; callers then fall
  // back to the legacy "apply visually to everyone" behavior.
  const scopedItemIds = useMemo<Set<string> | null>(() => {
    if (!discountScopeSubtotalId) return null;
    const set = new Set<string>();
    const targetIdx = items.findIndex(
      (i) => i.id === discountScopeSubtotalId && i.itemType === 'SUBTOTAL'
    );
    if (targetIdx === -1) return set; // scope target missing — nobody gets the visual
    // Section starts just after the previous SUBTOTAL (or at index 0).
    let startIdx = 0;
    for (let j = targetIdx - 1; j >= 0; j--) {
      if (items[j].itemType === 'SUBTOTAL') {
        startIdx = j + 1;
        break;
      }
    }
    for (let j = startIdx; j <= targetIdx; j++) {
      set.add(items[j].id);
    }
    return set;
  }, [items, discountScopeSubtotalId]);

  // Compute section subtotal values for each SUBTOTAL row
  const subtotalMap = useMemo(() => {
    const map = new Map<string, number>();
    let sectionSum = 0;

    for (const item of items) {
      if (item.itemType === 'SUBTOTAL') {
        map.set(item.id, sectionSum);
        sectionSum = 0; // reset for next section
      } else if (
        (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') &&
        !item.parentItemId &&
        !item.priceLabel
      ) {
        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        sectionSum += qty * up * (1 - disc / 100);
      }
    }
    return map;
  }, [items]);

  // Label span for summary rows: spans from first col up to (but not including) Toplam Fiyat
  // New column order: Drag | Poz | [Marka,Model,Kod] | Aciklama | Miktar | [BirimFiyat, ToplamFiyat, Katsayi, ListeFiyati] | [Maliyet,Kar,Kar%] | PB | [Gecmis x8] | Delete
  // When fiyat visible: Label = everything before Toplam Fiyat, value = Toplam Fiyat col, trailing = rest
  // When fiyat hidden: fallback to old layout (label = totalColCount - 2, value col, delete col)
  const labelSpan = useMemo(() => {
    if (!columnVisibility.fiyat) {
      // Fallback: all columns except value + delete
      return totalColCount - 2;
    }
    let count = 2; // drag handle + Poz No
    if (columnVisibility.urun) count += 3;
    count += 1; // Aciklama
    count += 1; // Miktar
    count += 1; // Birim Fiyat (before Toplam Fiyat)
    return count;
  }, [columnVisibility, totalColCount]);

  // Trailing columns after Toplam Fiyat value cell
  const trailingSpan = useMemo(() => {
    if (!columnVisibility.fiyat) {
      return 1; // just Delete
    }
    let count = 0;
    count += 2; // Katsayi + Liste Fiyati
    if (canViewCosts && columnVisibility.maliyet) count += 3;
    count += 1; // PB
    if (columnVisibility.gecmis) count += 8;
    count += 1; // Delete
    return count;
  }, [columnVisibility, canViewCosts]);

  // Summary calculations – always uses full items array
  const summary = useMemo(() => {
    let araTotal = 0;
    let totalCost = 0;

    const hasSubtotals = items.some((item) => item.itemType === 'SUBTOTAL');

    if (hasSubtotals) {
      // Sum all section subtotals
      for (const [, value] of subtotalMap) {
        araTotal += value;
      }
      // Add any trailing items after the last SUBTOTAL
      let lastSubtotalIdx = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].itemType === 'SUBTOTAL') { lastSubtotalIdx = i; break; }
      }
      if (lastSubtotalIdx < items.length - 1) {
        for (let i = lastSubtotalIdx + 1; i < items.length; i++) {
          const item = items[i];
          if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
      if (item.priceLabel) continue;
          if (item.parentItemId) continue;
          araTotal += Number(item.quantity) * Number(item.unitPrice) * (1 - Number(item.discountPct) / 100);
        }
      }
    } else {
      // Original logic: sum all priced items
      for (const item of items) {
        if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
      if (item.priceLabel) continue;
        if (item.parentItemId) continue;
        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        araTotal += qty * up * (1 - disc / 100);
      }
    }

    // Cost calculation – exclude SUBTOTAL and parentItemId items
    // Use effective cost (base + ek maliyet delta) so totals reflect distributed costs
    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
      if (item.priceLabel) continue;
      if (item.parentItemId) continue;
      const qty = Number(item.quantity) || 0;
      const effectiveCost = getEffectiveCostPrice(item);
      if (effectiveCost != null) {
        totalCost += effectiveCost * qty;
      }
    }

    // Resolve the base the discount percent multiplies:
    // - null scope  → full araTotal (legacy whole-quote behavior)
    // - scoped      → the section sum for that SUBTOTAL
    // - stale scope → fall back to araTotal (matches server auto-heal)
    let discountBase = araTotal;
    if (discountScopeSubtotalId) {
      const sectionSum = subtotalMap.get(discountScopeSubtotalId);
      if (typeof sectionSum === 'number') {
        discountBase = sectionSum;
      }
    }

    const discountAmount = discountBase * (discountPct / 100);
    const afterDiscount = araTotal - discountAmount;

    // VAT is intentionally not computed — quotes are VAT-exclusive.
    const grandTotal = afterDiscount;
    const totalProfit = afterDiscount - totalCost;
    const profitMargin = afterDiscount > 0 ? (totalProfit / afterDiscount) * 100 : 0;

    return {
      araTotal,
      discountAmount,
      afterDiscount,
      grandTotal,
      totalCost,
      totalProfit,
      profitMargin,
    };
  }, [items, discountPct, subtotalMap, discountScopeSubtotalId]);

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
      const reordered = updated.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      onReorder(reordered);
    },
    [dragIndex, items, onReorder],
  );

  // Count of filtered product items vs total
  const productItemCount = items.filter(
    (i) => i.itemType !== 'HEADER' && i.itemType !== 'NOTE'
  ).length;
  const filteredProductCount = filteredItems.filter(
    (i) => i.itemType !== 'HEADER' && i.itemType !== 'NOTE'
  ).length;

  // Shared colgroup JSX — used by both sticky header table and main table
  const colgroupJsx = useMemo(() => (
    <colgroup>
      <col style={{ width: columnWidths.drag }} />
      <col style={{ width: columnWidths.pozNo }} />
      {columnVisibility.urun && (
        <>
          <col style={{ width: columnWidths.marka }} />
          <col style={{ width: columnWidths.model }} />
          <col style={{ width: columnWidths.kod }} />
        </>
      )}
      <col style={{ width: columnWidths.aciklama }} />
      <col style={{ width: columnWidths.miktar }} />
      {columnVisibility.fiyat && (
        <>
          <col style={{ width: columnWidths.birimFiyat }} />
          <col style={{ width: columnWidths.toplamFiyat }} />
        </>
      )}
      {columnVisibility.fiyat && (
        <>
          <col style={{ width: columnWidths.katsayi }} />
          <col style={{ width: columnWidths.listeFiyati }} />
        </>
      )}
      {canViewCosts && columnVisibility.maliyet && (
        <>
          <col style={{ width: columnWidths.maliyet }} />
          <col style={{ width: columnWidths.kar }} />
          <col style={{ width: columnWidths.karPct }} />
        </>
      )}
      <col style={{ width: columnWidths.pb }} />
      {columnVisibility.gecmis && (
        <>
          <col style={{ width: columnWidths.sonTeklif }} />
          <col style={{ width: columnWidths.delta1 }} />
          <col style={{ width: columnWidths.siparis }} />
          <col style={{ width: columnWidths.delta2 }} />
          <col style={{ width: columnWidths.enYuksek }} />
          <col style={{ width: columnWidths.delta3 }} />
          <col style={{ width: columnWidths.enDusuk }} />
          <col style={{ width: columnWidths.delta4 }} />
        </>
      )}
      <col style={{ width: columnWidths.delete }} />
    </colgroup>
  ), [columnWidths, columnVisibility, canViewCosts]);

  // Shared thead JSX — rendered in the sticky floating header
  const theadJsx = useMemo(() => (
    <thead>
      {/* Group header row */}
      <tr className="bg-accent-900 text-white text-[10px] uppercase tracking-wider">
        <th className="w-8 px-1 py-1" />
        <th className="px-2 py-1 whitespace-nowrap">Poz</th>
        {columnVisibility.urun && (
          <th colSpan={3} className="px-2 py-1 text-center border-l border-accent-700">Ürün Bilgisi</th>
        )}
        <th className="px-2 py-1 border-l border-accent-700">Açıklama</th>
        <th className="px-2 py-1">Miktar</th>
        {columnVisibility.fiyat && (
          <th colSpan={2} className="px-2 py-1 text-center border-l border-accent-700">Teklif Satış Fiyatları</th>
        )}
        {columnVisibility.fiyat && (
          <th colSpan={2} className="px-2 py-1 text-center border-l border-accent-700">Teklif Hazırlama</th>
        )}
        {canViewCosts && columnVisibility.maliyet && (
          <th colSpan={3} className="px-2 py-1 text-center border-l border-accent-700">Maliyet Analizi</th>
        )}
        <th className="px-1 py-1 border-l border-accent-700">PB</th>
        {columnVisibility.gecmis && (
          <th colSpan={8} className="px-2 py-1 text-center border-l border-accent-700">Fiyat Geçmişi</th>
        )}
        <th className="w-10 px-1 py-1" />
      </tr>

      {/* Individual column header row */}
      <tr className="bg-accent-800 text-white text-xs uppercase tracking-wider">
        <th className="px-1 py-2 overflow-hidden" style={{ width: columnWidths.drag }} />
        <th className="px-2 py-2 text-center whitespace-nowrap" style={{ width: columnWidths.pozNo }} onMouseDown={(e) => handleThMouseDown(e, 'pozNo')} onMouseMove={handleThMouseMove}>Poz No</th>
        {columnVisibility.urun && (
          <>
            <th className="px-2 py-2 text-left whitespace-nowrap" style={{ width: columnWidths.marka }} onMouseDown={(e) => handleThMouseDown(e, 'marka')} onMouseMove={handleThMouseMove}>Marka</th>
            <th className="px-2 py-2 text-left whitespace-nowrap" style={{ width: columnWidths.model }} onMouseDown={(e) => handleThMouseDown(e, 'model')} onMouseMove={handleThMouseMove}>Model</th>
            <th className="px-2 py-2 text-left whitespace-nowrap" style={{ width: columnWidths.kod }} onMouseDown={(e) => handleThMouseDown(e, 'kod')} onMouseMove={handleThMouseMove}>Kod</th>
          </>
        )}
        <th className="px-2 py-2 text-left whitespace-nowrap" style={{ width: columnWidths.aciklama }} onMouseDown={(e) => handleThMouseDown(e, 'aciklama')} onMouseMove={handleThMouseMove}>Açıklama</th>
        <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.miktar }} onMouseDown={(e) => handleThMouseDown(e, 'miktar')} onMouseMove={handleThMouseMove}>Miktar</th>
        {columnVisibility.fiyat && (
          <>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.birimFiyat }} onMouseDown={(e) => handleThMouseDown(e, 'birimFiyat')} onMouseMove={handleThMouseMove}>Birim Fiyat</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.toplamFiyat }} onMouseDown={(e) => handleThMouseDown(e, 'toplamFiyat')} onMouseMove={handleThMouseMove}>Toplam Fiyat</th>
          </>
        )}
        {columnVisibility.fiyat && (
          <>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.katsayi }} onMouseDown={(e) => handleThMouseDown(e, 'katsayi')} onMouseMove={handleThMouseMove}>Katsayı</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.listeFiyati }} onMouseDown={(e) => handleThMouseDown(e, 'listeFiyati')} onMouseMove={handleThMouseMove}>Liste Fiyatı</th>
          </>
        )}
        {canViewCosts && columnVisibility.maliyet && (
          <>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.maliyet }} onMouseDown={(e) => handleThMouseDown(e, 'maliyet')} onMouseMove={handleThMouseMove}>Maliyet</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.kar }} onMouseDown={(e) => handleThMouseDown(e, 'kar')} onMouseMove={handleThMouseMove}>Kar</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.karPct }} onMouseDown={(e) => handleThMouseDown(e, 'karPct')} onMouseMove={handleThMouseMove}>Kar %</th>
          </>
        )}
        <th className="px-1 py-2 text-center whitespace-nowrap" style={{ width: columnWidths.pb }} onMouseDown={(e) => handleThMouseDown(e, 'pb')} onMouseMove={handleThMouseMove}>PB</th>
        {columnVisibility.gecmis && (
          <>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.sonTeklif }} onMouseDown={(e) => handleThMouseDown(e, 'sonTeklif')} onMouseMove={handleThMouseMove}>Son Teklif</th>
            <th className="px-1 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.delta1 }} onMouseDown={(e) => handleThMouseDown(e, 'delta1')} onMouseMove={handleThMouseMove}>Δ%</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.siparis }} onMouseDown={(e) => handleThMouseDown(e, 'siparis')} onMouseMove={handleThMouseMove}>Sipariş</th>
            <th className="px-1 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.delta2 }} onMouseDown={(e) => handleThMouseDown(e, 'delta2')} onMouseMove={handleThMouseMove}>Δ%</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.enYuksek }} onMouseDown={(e) => handleThMouseDown(e, 'enYuksek')} onMouseMove={handleThMouseMove}>En Yüksek</th>
            <th className="px-1 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.delta3 }} onMouseDown={(e) => handleThMouseDown(e, 'delta3')} onMouseMove={handleThMouseMove}>Δ%</th>
            <th className="px-2 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.enDusuk }} onMouseDown={(e) => handleThMouseDown(e, 'enDusuk')} onMouseMove={handleThMouseMove}>En Düşük</th>
            <th className="px-1 py-2 text-right whitespace-nowrap" style={{ width: columnWidths.delta4 }} onMouseDown={(e) => handleThMouseDown(e, 'delta4')} onMouseMove={handleThMouseMove}>Δ%</th>
          </>
        )}
        <th className="px-1 py-2 overflow-hidden" style={{ width: columnWidths.delete }} />
      </tr>
    </thead>
  ), [columnWidths, columnVisibility, canViewCosts, handleThMouseDown, handleThMouseMove]);

  return (
    <div className="space-y-3">
      {/* ---- Action buttons ---- */}
      <div className="flex flex-wrap items-center gap-2">
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
        {onAddCustomItem && (
          <Button variant="secondary" size="sm" onClick={onAddCustomItem}>
            <Wrench className="h-4 w-4" />
            Serbest Kalem
          </Button>
        )}
        {onAddSubtotal && (
          <Button variant="secondary" size="sm" onClick={onAddSubtotal}>
            <Calculator className="h-4 w-4" />
            Ara Toplam
          </Button>
        )}
        {onAddGrandTotal && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddGrandTotal}
            disabled={items.some((i) => i.itemType === 'GRAND_TOTAL')}
            title="Teklifin sonuna genel toplam satırı ekler"
          >
            <Sigma className="h-4 w-4" />
            Genel Toplam
          </Button>
        )}
        {onCreateSet && (
          <Button variant="secondary" size="sm" onClick={onCreateSet}>
            <Layers className="h-4 w-4" />
            Set Ekle
          </Button>
        )}
        {onOpenEkMaliyet && (
          <Button variant="secondary" size="sm" onClick={onOpenEkMaliyet}>
            <DollarSign className="h-4 w-4" />
            Ek Maliyet
          </Button>
        )}

        {/* Column group toggles */}
        <div className="flex items-center gap-1 ml-auto border border-accent-200 rounded-lg p-1 bg-accent-50">
          <span className="text-xs text-accent-500 px-1.5">Sütunlar:</span>
          {COLUMN_GROUPS.map((group) => {
            if (group.requiresCosts && !canViewCosts) return null;
            const active = columnVisibility[group.key];
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => toggleGroup(group.key)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-accent-700 text-white'
                    : 'bg-white text-accent-600 hover:bg-accent-100'
                )}
              >
                <group.Icon className="h-3 w-3" />
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Filter bar ---- */}
      {items.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
            hasActiveFilter
              ? 'border-blue-200 bg-blue-50'
              : 'border-primary-200 bg-primary-50'
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary-600">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtre</span>
          </div>

          {/* Brand multi-select dropdown */}
          <div className="relative" ref={brandDropdownRef}>
            <button
              type="button"
              onClick={() => setShowBrandDropdown(!showBrandDropdown)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors',
                brandFilter.size > 0
                  ? 'border-blue-300 bg-blue-100 text-blue-700'
                  : 'border-primary-300 bg-white text-primary-600 hover:bg-primary-50'
              )}
            >
              Marka
              {brandFilter.size > 0 && (
                <span className="bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-medium">
                  {brandFilter.size}
                </span>
              )}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showBrandDropdown && 'rotate-180')} />
            </button>

            {showBrandDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-primary-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                {uniqueBrands.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-primary-500">Marka bulunamadı</div>
                ) : (
                  uniqueBrands.map((brand) => (
                    <label
                      key={brand}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={brandFilter.has(brand)}
                        onChange={() => toggleBrandFilter(brand)}
                        className="rounded border-primary-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{brand}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected brand chips */}
          {Array.from(brandFilter).map((brand) => (
            <span
              key={brand}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
            >
              {brand}
              <button
                type="button"
                onClick={() => toggleBrandFilter(brand)}
                className="hover:text-blue-900 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Divider */}
          <span className="h-4 w-px bg-primary-300" aria-hidden />

          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-400 pointer-events-none" />
            <input
              type="text"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Kod, model, açıklama..."
              className="pl-7 pr-2 py-1 text-xs border border-primary-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-400 w-48"
            />
          </div>

          {/* Clear filters */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
            >
              <X className="h-3 w-3" />
              Temizle
            </button>
          )}

          {/* Result count */}
          {hasActiveFilter && (
            <span className="text-xs text-primary-500 ml-auto">
              {filteredProductCount} / {productItemCount} kalem
            </span>
          )}
        </div>
      )}

      {/* ---- Brand profit/sales summary ---- */}
      <BrandProfitSummary
        items={filteredItems}
        discountPct={discountPct}
        currency={currency}
        canViewCosts={canViewCosts}
      />

      {/* ---- Profit margin warning ---- */}
      {canViewCosts && summary.profitMargin < 15 && summary.profitMargin > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            Dikkat: Genel kar marji dusuk (%{summary.profitMargin.toFixed(1)})
          </span>
        </div>
      )}

      {/*
        ---- Table with sticky floating header ----
        ARCHITECTURE: The horizontal scroll container (overflow-x-auto) would trap
        `position: sticky` (browsers force overflow-y: auto when overflow-x is set).
        Workaround: render the <thead> inside a separate sticky div OUTSIDE the
        scroll container, and sync its horizontal offset via transform:translateX.
        The main table has no <thead> — column widths come from the shared colgroup.
      */}
      <div>
        {/* Floating sticky header — visual duplicate of the thead */}
        <div
          className="sticky top-0 z-30 overflow-hidden rounded-t-lg border border-b-0 border-accent-200 bg-white"
          aria-hidden="true"
        >
          <div
            ref={stickyHeaderInnerRef}
            style={{ width: tableWidth, willChange: 'transform' }}
          >
            <table className="text-sm border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: tableWidth }}>
              {colgroupJsx}
              {theadJsx}
            </table>
          </div>
        </div>

        {/* Main scrolling table */}
        <div
          ref={mainScrollRef}
          className="rounded-b-lg border border-t-0 border-accent-200 bg-white overflow-x-auto"
          onScroll={handleMainScroll}
        >
        <table ref={tableRef} className="text-sm border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: tableWidth }}>
          {colgroupJsx}
          {/* thead rendered in sticky floating header above */}

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

            {filteredItems.map((item) => {
              const origIdx = itemIndexMap.get(item.id) ?? 0;
              return (
                <React.Fragment key={item.id}>
                  <QuoteItemRow
                    item={item}
                    pozNo={pozMap.get(item.id) ?? null}
                    currency={currency}
                    overallDiscountPct={
                      // Whole-quote mode (scopedItemIds === null) → every
                      // row shows the visual discount, matching legacy
                      // behavior. Scoped mode → only rows inside the
                      // targeted section show it; everything else gets 0
                      // so its price renders raw.
                      scopedItemIds === null || scopedItemIds.has(item.id)
                        ? discountPct
                        : 0
                    }
                    canViewCosts={canViewCosts}
                    isDragging={!hasActiveFilter && dragIndex === origIdx}
                    columnVisibility={columnVisibility}
                    priceHistory={item.productId ? priceHistoryBatch?.[item.productId] : undefined}
                    totalColCount={totalColCount}
                    subtotalValue={item.itemType === 'SUBTOTAL' ? subtotalMap.get(item.id) : undefined}
                    grandTotalValue={item.itemType === 'GRAND_TOTAL' ? summary.grandTotal : undefined}
                    onUpdate={(updates) => onItemUpdate(item.id, updates)}
                    onDelete={() => onItemDelete(item.id)}
                    onDuplicate={() => onItemDuplicate(item.id)}
                    onDragStart={hasActiveFilter ? noopDrag : handleDragStart(origIdx)}
                    onDragOver={hasActiveFilter ? noopDrag : handleDragOver(origIdx)}
                    onDrop={hasActiveFilter ? noopDrag : handleDrop(origIdx)}
                    canOverrideKatsayi={canOverrideKatsayi}
                    onShowPriceHistory={
                      item.productId && onShowPriceHistory
                        ? () => onShowPriceHistory(item.productId!)
                        : undefined
                    }
                    onInsertHeaderAbove={onAddHeader}
                    priceLabelOptions={priceLabelCatalog}
                    unitOptions={unitCatalog}
                  />
                  {/* Render sub-rows for SET parents */}
                  {(() => {
                    const subs = subRowsByParent.get(item.id) || [];
                    if (subs.length > 0) {
                      return (
                        <>
                          <tr>
                            <td colSpan={totalColCount} className="px-8 py-0.5 bg-accent-50 border-x border-accent-200">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setCollapsedParents(prev => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    return next;
                                  })}
                                  className="text-xs text-accent-500 hover:text-accent-700 flex items-center gap-1"
                                >
                                  {collapsedParents.has(item.id) ? '\u25B6' : '\u25BC'}
                                  {subs.length} alt kalem
                                </button>
                                {onAddSubItem && (
                                  <button
                                    type="button"
                                    onClick={() => onAddSubItem(item.id)}
                                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Veritabanından ürün ekle
                                  </button>
                                )}
                                {onAddCustomSubItem && (
                                  <button
                                    type="button"
                                    onClick={() => onAddCustomSubItem(item.id)}
                                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Serbest kalem ekle
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {!collapsedParents.has(item.id) && subs.map((sub) => (
                            <QuoteItemRow
                              key={sub.id}
                              item={sub}
                              pozNo={null}
                              currency={currency}
                              canViewCosts={canViewCosts}
                              isDragging={false}
                              isSubRow={true}
                              columnVisibility={columnVisibility}
                              totalColCount={totalColCount}
                              onUpdate={(updates) => onItemUpdate(sub.id, updates)}
                              onDelete={() => onItemDelete(sub.id)}
                              onDuplicate={() => onItemDuplicate(sub.id)}
                              onDragStart={noopDrag}
                              onDragOver={noopDrag}
                              onDrop={noopDrag}
                              priceLabelOptions={priceLabelCatalog}
                              unitOptions={unitCatalog}
                            />
                          ))}
                        </>
                      );
                    }
                    // Show add buttons for SET parents that have no sub-rows yet
                    if (item.itemType === 'SET' && (onAddSubItem || onAddCustomSubItem)) {
                      return (
                        <tr>
                          <td colSpan={totalColCount} className="px-8 py-0.5 bg-accent-50 border-x border-accent-200">
                            <div className="flex items-center gap-3">
                              {onAddSubItem && (
                                <button
                                  type="button"
                                  onClick={() => onAddSubItem(item.id)}
                                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                >
                                  <Plus className="h-3 w-3" />
                                  Veritabanından ürün ekle
                                </button>
                              )}
                              {onAddCustomSubItem && (
                                <button
                                  type="button"
                                  onClick={() => onAddCustomSubItem(item.id)}
                                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                >
                                  <Plus className="h-3 w-3" />
                                  Serbest kalem ekle
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return null;
                  })()}
                </React.Fragment>
              );
            })}

            {/* Empty filter result message */}
            {hasActiveFilter && filteredItems.length === 0 && items.length > 0 && (
              <tr>
                <td
                  colSpan={totalColCount}
                  className="px-4 py-8 text-center text-primary-500"
                >
                  <Filter className="h-5 w-5 mx-auto mb-2 text-primary-400" />
                  Filtreye uygun kalem bulunamadı.
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="block mx-auto mt-2 text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    Filtreleri temizle
                  </button>
                </td>
              </tr>
            )}
          </tbody>

          {/* ---- Summary footer ---- */}
          <tfoot className="bg-accent-50 text-sm">
            {/* Toplam */}
            <tr className="border-t-2 border-accent-300">
              <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-700">
                Toplam
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-accent-900 whitespace-nowrap">
                {formatPrice(summary.araTotal, currency)}
              </td>
              {trailingSpan > 0 && <td colSpan={trailingSpan} />}
            </tr>

            {/* Iskonto */}
            <tr>
              <td colSpan={labelSpan} className="px-3 py-2 text-right font-medium text-accent-700">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="text"
                    value={discountLabel}
                    onChange={(e) => onDiscountLabelChange?.(e.target.value)}
                    className="w-32 rounded border border-transparent px-1 py-0.5 text-right text-sm font-medium text-accent-700 hover:border-accent-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-transparent"
                    title="İskonto etiketini düzenle"
                  />
                  %
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
                  {subtotalRows.length > 0 && (
                    <select
                      value={discountScopeSubtotalId ?? ''}
                      onChange={(e) =>
                        onDiscountScopeChange?.(e.target.value === '' ? null : e.target.value)
                      }
                      className="rounded border border-accent-300 px-2 py-0.5 text-xs text-accent-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      title="İskontonun uygulanacağı bölüm — 'Tüm teklif' iskontoyu toplam üzerine uygular, bir ara toplam seçildiğinde yalnızca o bölüme uygulanır."
                    >
                      <option value="">Tüm teklif</option>
                      {subtotalRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">
                {summary.discountAmount > 0 ? `- ${formatPrice(summary.discountAmount, currency)}` : '-'}
              </td>
              {trailingSpan > 0 && <td colSpan={trailingSpan} />}
            </tr>

            {/* GENEL TOPLAM */}
            <tr className="border-t-2 border-accent-400">
              <td colSpan={labelSpan} className="px-3 py-2.5 text-right text-base font-bold text-accent-900">
                GENEL TOPLAM
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-base font-bold text-accent-900 whitespace-nowrap">
                {formatPrice(summary.grandTotal, currency)}
              </td>
              {trailingSpan > 0 && <td colSpan={trailingSpan} />}
            </tr>

          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
}
