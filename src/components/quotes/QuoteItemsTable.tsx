'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Plus, Type, StickyNote, Wrench, AlertTriangle,
  Package, DollarSign, Calculator, Clock, Layers,
  Filter, X, Search, ChevronDown, Sigma,
  Copy, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Modal } from '@/components/ui';
import {
  QuoteItemRow,
  formatPrice,
  formatNumber,
  type QuoteItemData,
  type PriceHistoryStats,
  type ColumnVisibility,
} from './QuoteItemRow';
import { BrandProfitSummary } from './BrandProfitSummary';
import { getEffectiveCostPriceForItem } from '@/lib/ek-maliyet';
import { calculateSectionBreakdown, calculateGrandTotalAtIndex, type QuoteCurrencyContext } from '@/lib/quote-calculations';
import { useSettings } from '@/components/settings/SettingsProvider';
import { expandTurkishVariants } from '@/lib/search-helpers';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuoteItemsTableProps {
  items: QuoteItemData[];
  currency: string;
  /** Quote's protected TRY rate (Quote.exchangeRate). Used to derive
   *  the base rate for converting TRY-priced SETs into the quote's
   *  currency in the live summary — mirrors the PDF/server math so
   *  the numbers the user sees while editing match the saved totals. */
  exchangeRate?: number;
  /** Quote.protectionPct, used together with exchangeRate to recover
   *  the non-protected base rate for TRY-set → quote-currency
   *  conversion. Defaults to 0 (no protection). */
  protectionPct?: number;
  canViewCosts: boolean;
  onItemUpdate: (itemId: string, updates: Partial<QuoteItemData>) => void;
  onItemDelete: (itemId: string) => void;
  onItemDuplicate: (itemId: string) => void;
  onReorder: (items: QuoteItemData[]) => void;
  onAddProduct: () => void;
  /** Right-click "Ürün Değiştir" — opens the catalog in swap mode for
   *  the given row. Only invoked from PRODUCT/SET rows that have a
   *  productId. Optional so callers that don't want the feature can
   *  omit it. */
  onSwapProductRequest?: (itemId: string) => void;
  /** Right-click "Üstüne Ürün Ekle" — open the catalog and insert the chosen
   *  product above this row. Offered on top-level rows only. */
  onInsertProductAbove?: (beforeId: string) => void;
  /** Right-click "Üstüne Başlık Ekle" — insert a header above this row.
   *  Offered on top-level rows only. */
  onInsertHeaderAbove?: (beforeId: string) => void;
  /** Bulk apply the same katsayı value to multiple items in one
   *  setItems pass. Avoids the O(N×items) cost of calling onItemUpdate
   *  per row when the user bulk-applies on a large quote. When omitted
   *  the modal falls back to per-row onItemUpdate. */
  onBulkKatsayiApply?: (ids: string[], value: number) => void;
  /** Bulk delete (#5). Single confirm + parallel DELETEs + descendant
   *  pre-filter. Required when the multi-row toolbar is exposed. */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /** Bulk duplicate (#5). Iterates per-row in items-array order so the
   *  cloned rows land deterministically. */
  onBulkDuplicate?: (ids: string[]) => Promise<void> | void;
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
  onSectionDiscountPctChange?: (subtotalItemId: string, pct: number) => void;
  onSectionDiscountLabelChange?: (subtotalItemId: string, label: string) => void;
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
  exchangeRate = 1,
  protectionPct = 0,
  canViewCosts,
  onItemUpdate,
  onItemDelete,
  onItemDuplicate,
  onReorder,
  onAddProduct,
  onSwapProductRequest,
  onInsertProductAbove,
  onInsertHeaderAbove,
  onBulkKatsayiApply,
  onBulkDelete,
  onBulkDuplicate,
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
  onSectionDiscountPctChange,
  onSectionDiscountLabelChange,
}: QuoteItemsTableProps) {
  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Multi-row selection (revision item #5). User checks rows in the
  // editor; the selection toolbar above the table offers Çoğalt and
  // Sil. Drag-handlers below also detect when the dragged row is in
  // selection and move all selected together. Limited to top-level
  // rows (sub-items of SETs aren't selectable — moving them
  // independently of their parent breaks the hierarchy).
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const toggleRowSelected = useCallback((itemId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);

  // Prune stale IDs (rows deleted via single-row context menu, revert,
  // etc.) so the toolbar count stays honest and `isMultiDrag`
  // detection isn't tricked by ghost selections.
  useEffect(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (valid.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // Collapsed parent state for sub-row toggle
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // Bulk-katsayı: a modal-driven flow for setting the same katsayı value
  // on a chosen subset of rows. Solves the "80-row quote, 40 of them need
  // 1.2" workflow without forcing the user to click 40 cells one by one.
  // State lives here; Apply iterates and calls onItemUpdate per row,
  // reusing the existing katsayı change pipeline (recomputes
  // unitPrice/totalPrice via the editor's handleItemUpdate).
  const [bulkKatsayiOpen, setBulkKatsayiOpen] = useState(false);
  const [selectedKatsayiIds, setSelectedKatsayiIds] = useState<Set<string>>(new Set());
  const [bulkKatsayiInput, setBulkKatsayiInput] = useState<string>('');
  const [bulkKatsayiFilter, setBulkKatsayiFilter] = useState<string>('');
  const toggleKatsayiSelection = useCallback((itemId: string) => {
    setSelectedKatsayiIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);
  const closeBulkKatsayi = useCallback(() => {
    setBulkKatsayiOpen(false);
    setSelectedKatsayiIds(new Set());
    setBulkKatsayiInput('');
    setBulkKatsayiFilter('');
  }, []);
  // Bulk-duplicate of all selected rows. Prefers the editor-level
  // batch handler (single confirm-free pass) when available; falls
  // back to iterating onItemDuplicate which surfaces a per-row
  // confirm prompt — kept as a safety net only.
  const handleBulkDuplicateClick = useCallback(async () => {
    if (selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    setBulkActionBusy(true);
    try {
      if (onBulkDuplicate) {
        await onBulkDuplicate(ids);
      } else {
        for (const id of ids) onItemDuplicate(id);
      }
    } finally {
      setBulkActionBusy(false);
      setSelectedRowIds(new Set());
    }
  }, [selectedRowIds, onBulkDuplicate, onItemDuplicate]);

  // Bulk-delete: editor's onBulkDelete owns the single confirm + the
  // parent/child cascade pre-filter. The fallback path (per-row
  // onItemDelete) is intentionally avoided once onBulkDelete is wired,
  // because the per-row handler still pops its own confirm dialog.
  const handleBulkDeleteClick = useCallback(async () => {
    if (selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    setBulkActionBusy(true);
    try {
      if (onBulkDelete) {
        await onBulkDelete(ids);
      } else {
        // No-op fallback: refuse to fire N per-row confirms. Caller
        // must wire onBulkDelete to use the toolbar.
        console.warn('Bulk delete invoked without onBulkDelete prop — toolbar action is a no-op');
      }
    } finally {
      setBulkActionBusy(false);
      setSelectedRowIds(new Set());
    }
  }, [selectedRowIds, onBulkDelete]);

  const applyBulkKatsayi = useCallback(() => {
    const raw = bulkKatsayiInput.trim().replace(',', '.');
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) return;
    const ids = Array.from(selectedKatsayiIds);
    // Prefer the bulk path when available — one setItems pass instead
    // of N separate reducer runs on a long quote.
    if (onBulkKatsayiApply) {
      onBulkKatsayiApply(ids, value);
    } else {
      ids.forEach((itemId) => onItemUpdate(itemId, { katsayi: value }));
    }
    closeBulkKatsayi();
  }, [bulkKatsayiInput, selectedKatsayiIds, onBulkKatsayiApply, onItemUpdate, closeBulkKatsayi]);

  // Editable items for the bulk modal: PRODUCT/CUSTOM/SET only (no
  // HEADER/NOTE/SUBTOTAL/GRAND_TOTAL — they don't carry a katsayı).
  // Filter by description/code/brand/model when the user types in the
  // modal's search box. Reuses the same Turkish-variant expansion as
  // the rest of the app so "altinay" finds "Altınay".
  const bulkKatsayiCandidates = useMemo(() => {
    const candidates = items.filter(
      (it) =>
        it.itemType === 'PRODUCT' || it.itemType === 'CUSTOM' || it.itemType === 'SET'
    );
    const q = bulkKatsayiFilter.trim();
    if (!q) return candidates;
    const variants = expandTurkishVariants(q).map((v) => v.toLocaleLowerCase('tr-TR'));
    if (variants.length === 0) return candidates;
    return candidates.filter((it) => {
      const fields = [it.code, it.description, it.brand, it.model]
        .filter((f): f is string => !!f)
        .map((f) => f.toLocaleLowerCase('tr-TR'));
      return variants.some((v) => fields.some((f) => f.includes(v)));
    });
  }, [items, bulkKatsayiFilter]);
  const selectAllVisible = useCallback(() => {
    setSelectedKatsayiIds(new Set(bulkKatsayiCandidates.map((it) => it.id)));
  }, [bulkKatsayiCandidates]);
  const deselectAll = useCallback(() => {
    setSelectedKatsayiIds(new Set());
  }, []);

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
  const stickyBottomScrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  // Drag state for the custom scrollbar thumb. Null when not dragging.
  const thumbDragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);

  // Auto-scroll loop state — only active while a row drag is in
  // progress. The rAF id is non-null when the loop is running; the
  // pointer Y is updated by a document-level `dragover` listener.
  const autoScrollRafRef = useRef<number | null>(null);
  const pointerYRef = useRef<number>(0);

  // Recompute thumb width + position from the main table's scroll
  // state. Called on scroll, resize, column toggle, etc. Direct DOM
  // writes avoid React re-renders on every scroll pixel.
  const MIN_THUMB_PX = 32;
  const syncThumb = useCallback(() => {
    const main = mainScrollRef.current;
    const thumb = thumbRef.current;
    const track = stickyBottomScrollRef.current;
    if (!main || !thumb || !track) return;
    const trackWidth = track.clientWidth;
    const { scrollLeft, scrollWidth, clientWidth } = main;
    if (scrollWidth <= clientWidth || trackWidth <= 0) {
      thumb.style.width = '0px';
      thumb.style.transform = 'translateX(0px)';
      return;
    }
    const ratio = clientWidth / scrollWidth;
    const thumbWidth = Math.max(MIN_THUMB_PX, Math.round(ratio * trackWidth));
    const maxScroll = scrollWidth - clientWidth;
    const maxThumbLeft = trackWidth - thumbWidth;
    const thumbLeft = maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbLeft : 0;
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translateX(${thumbLeft}px)`;
  }, []);

  // Sync sticky header + custom thumb horizontal scroll with main
  // table via direct DOM manipulation (avoids React re-render on
  // every scroll pixel for performance on large quotes).
  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
    syncThumb();
  }, [syncThumb]);

  // Re-sync sticky header + custom thumb after column visibility or
  // table width changes (browser may auto-clamp scrollLeft when the
  // table gets narrower).
  const syncScrollLeft = useCallback(() => {
    if (!mainScrollRef.current) return;
    const sl = mainScrollRef.current.scrollLeft;
    if (stickyHeaderInnerRef.current) {
      stickyHeaderInnerRef.current.style.transform = `translateX(-${sl}px)`;
    }
    syncThumb();
  }, [syncThumb]);

  // Thumb drag handlers. On mousedown, capture start offset. On move,
  // translate delta-X into mainScrollRef.scrollLeft. On up, release.
  const handleThumbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const main = mainScrollRef.current;
    const track = stickyBottomScrollRef.current;
    if (!main || !track) return;
    thumbDragRef.current = { startX: e.clientX, startScrollLeft: main.scrollLeft };

    const onMove = (ev: MouseEvent) => {
      const state = thumbDragRef.current;
      if (!state || !mainScrollRef.current || !stickyBottomScrollRef.current) return;
      const { scrollWidth, clientWidth } = mainScrollRef.current;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll <= 0) return;
      const trackWidth = stickyBottomScrollRef.current.clientWidth;
      const ratio = clientWidth / scrollWidth;
      const thumbWidth = Math.max(MIN_THUMB_PX, Math.round(ratio * trackWidth));
      const maxThumbLeft = trackWidth - thumbWidth;
      if (maxThumbLeft <= 0) return;
      const dx = ev.clientX - state.startX;
      const scrollDelta = (dx / maxThumbLeft) * maxScroll;
      const next = Math.max(0, Math.min(maxScroll, state.startScrollLeft + scrollDelta));
      mainScrollRef.current.scrollLeft = next;
    };
    const onUp = () => {
      thumbDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
    if (mainScrollRef.current) {
      setNeedsHScroll(mainScrollRef.current.scrollWidth > mainScrollRef.current.clientWidth + 1);
    }
  }, [tableWidth, columnVisibility, canViewCosts, syncScrollLeft]);

  // Sync on window resize
  useEffect(() => {
    window.addEventListener('resize', syncScrollLeft);
    return () => window.removeEventListener('resize', syncScrollLeft);
  }, [syncScrollLeft]);

  // Hide the sticky-bottom scrollbar when the table fits in its
  // container (no horizontal overflow). Re-check whenever the table
  // container resizes (window resize, column width change, side panel
  // toggle, etc).
  useEffect(() => {
    const node = mainScrollRef.current;
    if (!node) return;
    const update = () => {
      setNeedsHScroll(node.scrollWidth > node.clientWidth + 1);
      syncThumb();
    };
    // Defer the initial check until layout is settled — otherwise on
    // first mount `scrollWidth` may read 0 before the table paints.
    const raf = requestAnimationFrame(update);
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [syncThumb]);

  // ── Filter state ──────────────────────────────────────────────────────────

  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [textFilter, setTextFilter] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [needsHScroll, setNeedsHScroll] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  // When needsHScroll flips to true, the sticky-bottom track has just
  // been revealed (display: block). Its clientWidth was 0 until this
  // render, so syncThumb's first call in the ResizeObserver effect
  // couldn't size the thumb. Re-run it now on the next frame so the
  // thumb appears without requiring a user scroll to trigger it.
  useEffect(() => {
    if (!needsHScroll) return;
    const raf = requestAnimationFrame(syncThumb);
    return () => cancelAnimationFrame(raf);
  }, [needsHScroll, syncThumb]);

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
        const variants = expandTurkishVariants(textFilter).map((v) => v.toLocaleLowerCase('tr-TR'));
        const fields = [item.code, item.model, item.description, item.brand]
          .filter((f): f is string => !!f)
          .map((f) => f.toLocaleLowerCase('tr-TR'));
        passes = variants.length === 0
          ? true
          : variants.some((v) => fields.some((f) => f.includes(v)));
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


  // Base (non-protected) TRY rate. When the quote is TRY, or when
  // neither exchangeRate nor protectionPct have meaningful values,
  // this collapses to 1 and every row contributes at face value —
  // matching legacy single-currency behavior byte-for-byte.
  const baseForeignRate = useMemo(() => {
    if (currency === 'TRY') return 1;
    const r = Number(exchangeRate) || 1;
    const p = Number(protectionPct) || 0;
    return p > 0 ? r / (1 + p / 100) : r;
  }, [currency, exchangeRate, protectionPct]);

  // Currency context — passed to calculateSectionBreakdown so TRY-priced
  // SET rows are converted to the quote's currency before summing.
  const ctx = useMemo(
    () => ({ quoteCurrency: currency, baseForeignRate }),
    [currency, baseForeignRate]
  );

  const breakdown = useMemo(() => {
    return calculateSectionBreakdown(
      items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        discountPct: Number(it.discountPct) || 0,
        vatRate: 0,
        priceLabel: it.priceLabel ?? null,
        currency: it.currency ?? null,
        parentItemId: it.parentItemId ?? null,
        sectionDiscountPct: it.sectionDiscountPct != null ? Number(it.sectionDiscountPct) : null,
      })),
      ctx
    );
  }, [items, ctx]);

  const subtotalMap = useMemo(() => {
    const map = new Map<string, { sectionSum: number; discountPct: number; discountAmount: number; sectionNet: number }>();
    for (const b of breakdown) {
      if (b.subtotalId) {
        map.set(b.subtotalId, {
          sectionSum: b.sectionSum,
          discountPct: b.discountPct,
          discountAmount: b.discountAmount,
          sectionNet: b.sectionNet,
        });
      }
    }
    return map;
  }, [breakdown]);

  const grandTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    const ctx: QuoteCurrencyContext = { quoteCurrency: currency, baseForeignRate };
    items.forEach((item, index) => {
      if (item.itemType === 'GRAND_TOTAL' && item.id) {
        map.set(item.id, calculateGrandTotalAtIndex(items, index, ctx));
      }
    });
    return map;
  }, [items, currency, baseForeignRate]);

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

  const summary = useMemo(() => {
    const subtotal = breakdown.reduce((s, b) => s + b.sectionSum, 0);
    const discountAmount = breakdown.reduce((s, b) => s + b.discountAmount, 0);
    const grandTotal = breakdown.reduce((s, b) => s + b.sectionNet, 0);
    return { subtotal, discountAmount, grandTotal };
  }, [breakdown]);

  // Profit/cost summary – kept separate from pricing summary so the
  // discount rewrite doesn't touch cost logic.
  const profitSummary = useMemo(() => {
    let totalCost = 0;
    const setCurrencyByParentId = new Map<string, string>();
    const setQtyByParentId = new Map<string, number>();
    for (const it of items) {
      if (it.itemType === 'SET' && !it.parentItemId) {
        if (it.currency) setCurrencyByParentId.set(it.id, it.currency);
        setQtyByParentId.set(it.id, Number(it.quantity) || 1);
      }
    }
    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
      if (item.priceLabel) continue;
      if (item.itemType === 'SET' && !item.parentItemId) continue;
      const qty = Number(item.quantity) || 0;
      // CUSTOM rows fall back to listPrice as their cost (serbest kalem).
      const effectiveCost = getEffectiveCostPriceForItem(item);
      if (effectiveCost == null) continue;
      const parentSetCur = item.parentItemId ? setCurrencyByParentId.get(item.parentItemId) : undefined;
      const effCurrency = item.currency || parentSetCur || currency;
      // SET children store per-ONE-set quantities — scale by the parent SET's
      // qty so cost covers all sold sets (revenue side is qty × unitPrice).
      const setQty = item.parentItemId ? setQtyByParentId.get(item.parentItemId) ?? 1 : 1;
      let contribution = effectiveCost * qty * setQty;
      if (effCurrency === 'TRY' && currency !== 'TRY' && baseForeignRate > 0) {
        contribution = contribution / baseForeignRate;
      }
      totalCost += contribution;
    }
    const totalProfit = summary.grandTotal - totalCost;
    const profitMargin = summary.grandTotal > 0 ? (totalProfit / summary.grandTotal) * 100 : 0;
    return { totalCost, totalProfit, profitMargin };
  }, [items, summary.grandTotal, currency, baseForeignRate]);

  // Vertical auto-scroll loop. Runs during an active row drag. When
  // the pointer is within 80px of the viewport top or bottom, scroll
  // the window at a speed that ramps linearly — 0 px/frame at the
  // dead-zone's inner boundary, 18 px/frame at the viewport edge.
  // Outside the dead-zone: no scrolling, loop idle-runs.
  const startAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current !== null) return; // already running
    const EDGE = 80;
    const MAX_PX_PER_FRAME = 18;
    const tick = () => {
      const y = pointerYRef.current;
      const h = window.innerHeight;
      let dy = 0;
      if (y < EDGE) {
        dy = -MAX_PX_PER_FRAME * (1 - y / EDGE);
      } else if (y > h - EDGE) {
        dy = MAX_PX_PER_FRAME * (1 - (h - y) / EDGE);
      }
      if (dy !== 0) window.scrollBy(0, dy);
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Drag handlers
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));

      // Multi-drag detection: if the dragged row is in the current
      // selection (and the selection has >1 row), the chip shows the
      // count and `handleDrop` will move all selected together.
      const item = items[index];
      const isMultiDrag = !!item && selectedRowIds.has(item.id) && selectedRowIds.size > 1;

      // Replace the browser's default drag ghost (a full-width snapshot
      // of the row, which looks visually misaligned because the row is
      // as wide as the table) with a small floating chip that names the
      // item. Chip is appended off-screen, snapshotted by the browser,
      // and self-removed on the next frame.
      const label = isMultiDrag
        ? `${selectedRowIds.size} kalem`
        : (item?.description?.trim() || item?.code?.trim() || 'Kalem').slice(0, 60);
      const chip = document.createElement('div');
      chip.textContent = `↕  ${label}`;
      chip.style.cssText = [
        'position:absolute',
        'top:-9999px',
        'left:-9999px',
        'background:#1e293b',
        'color:#fff',
        'padding:6px 12px',
        'border-radius:6px',
        'font-size:13px',
        'font-family:Tahoma,Geneva,Verdana,sans-serif',
        'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
        'white-space:nowrap',
        'max-width:360px',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(chip);
      e.dataTransfer.setDragImage(chip, 12, 16);
      // Remove after the browser has snapshotted it (next frame is safe).
      requestAnimationFrame(() => chip.remove());

      // Install auto-scroll — tracks pointer Y at document level and
      // runs a rAF loop until the drag ends. Cleanup attaches to the
      // same listeners so they self-remove on dragend regardless of
      // whether the drop succeeded or was cancelled.
      const onDragOverDoc = (ev: DragEvent) => {
        pointerYRef.current = ev.clientY;
      };
      const onDragEndDoc = () => {
        document.removeEventListener('dragover', onDragOverDoc);
        document.removeEventListener('dragend', onDragEndDoc);
        stopAutoScrollLoop();
      };
      document.addEventListener('dragover', onDragOverDoc);
      document.addEventListener('dragend', onDragEndDoc);
      pointerYRef.current = e.clientY; // seed so first tick is correct
      startAutoScrollLoop();
    },
    [items, selectedRowIds, startAutoScrollLoop, stopAutoScrollLoop],
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
      stopAutoScrollLoop(); // belt & suspenders — dragend may not fire on all browsers after drop
      const sourceIndex = dragIndex;
      setDragIndex(null);
      if (sourceIndex === null) return;

      // Multi-drag: source row is in the selection AND ≥2 rows
      // selected. Pull all selected items out of the array (preserving
      // relative order), then insert them as a block at the target's
      // position in the remaining list. Dropping onto a row that's
      // itself in the selection is a no-op (you're dropping the group
      // onto itself).
      const sourceItem = items[sourceIndex];
      const targetItem = items[targetIndex];
      const isMultiDrag = !!sourceItem && selectedRowIds.has(sourceItem.id) && selectedRowIds.size > 1;

      if (isMultiDrag) {
        if (!targetItem || selectedRowIds.has(targetItem.id)) return;
        const selected = items.filter((it) => selectedRowIds.has(it.id));
        const remaining = items.filter((it) => !selectedRowIds.has(it.id));
        const targetIdx = remaining.findIndex((it) => it.id === targetItem.id);
        if (targetIdx < 0) return;
        remaining.splice(targetIdx, 0, ...selected);
        const reordered = remaining.map((item, idx) => ({
          ...item,
          sortOrder: idx + 1,
        }));
        onReorder(reordered);
        // Selection persists after the move so the user can keep
        // moving / duplicating the group; clear via the toolbar
        // "Temizle" link.
        return;
      }

      if (sourceIndex === targetIndex) return;

      const updated = [...items];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      const reordered = updated.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      onReorder(reordered);
    },
    [dragIndex, items, selectedRowIds, onReorder, stopAutoScrollLoop],
  );

  // Belt-and-suspenders teardown on unmount: if the component
  // unmounts mid-drag (rare — navigation during drag), cancel the
  // loop so no orphan rAF keeps firing.
  useEffect(() => {
    return () => stopAutoScrollLoop();
  }, [stopAutoScrollLoop]);

  // Count of filtered product items vs total
  const productItemCount = items.filter(
    (i) => i.itemType !== 'HEADER' && i.itemType !== 'NOTE'
  ).length;
  const filteredProductCount = filteredItems.filter(
    (i) => i.itemType !== 'HEADER' && i.itemType !== 'NOTE'
  ).length;

  // Shared colgroup JSX — used by both sticky header table and main table.
  // Internal-only columns (cost analysis, source pricing, price history,
  // PB) get a subtle slate tint via colgroup-level background so the user
  // can see at a glance which cells will not appear on the customer PDF.
  // Customer-facing columns (Poz, Açıklama, Miktar, Birim Fiyat, Toplam
  // Fiyat) stay on the default white background. SUBTOTAL/HEADER/NOTE
  // rows have their own row-level backgrounds that mask this tint —
  // intentional: section bands take priority over column tinting.
  const INTERNAL_COL_BG = '#F1F5F9'; // slate-100, very subtle
  const internalColStyle = (width: number): React.CSSProperties => ({
    width,
    backgroundColor: INTERNAL_COL_BG,
  });
  const colgroupJsx = useMemo(() => (
    <colgroup>
      <col style={{ width: columnWidths.drag }} />
      <col style={{ width: columnWidths.pozNo }} />
      {columnVisibility.urun && (
        <>
          {/* Marka / Model / Kod appear on the customer-facing Excel
              export, so keep them on the default background even though
              the PDF only renders Marka inline within the description. */}
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
          <col style={internalColStyle(columnWidths.katsayi)} />
          <col style={internalColStyle(columnWidths.listeFiyati)} />
        </>
      )}
      {canViewCosts && columnVisibility.maliyet && (
        <>
          <col style={internalColStyle(columnWidths.maliyet)} />
          <col style={internalColStyle(columnWidths.kar)} />
          <col style={internalColStyle(columnWidths.karPct)} />
        </>
      )}
      <col style={internalColStyle(columnWidths.pb)} />
      {columnVisibility.gecmis && (
        <>
          <col style={internalColStyle(columnWidths.sonTeklif)} />
          <col style={internalColStyle(columnWidths.delta1)} />
          <col style={internalColStyle(columnWidths.siparis)} />
          <col style={internalColStyle(columnWidths.delta2)} />
          <col style={internalColStyle(columnWidths.enYuksek)} />
          <col style={internalColStyle(columnWidths.delta3)} />
          <col style={internalColStyle(columnWidths.enDusuk)} />
          <col style={internalColStyle(columnWidths.delta4)} />
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
        <Button variant="secondary" size="sm" onClick={() => onAddHeader()}>
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

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setBulkKatsayiOpen(true)}
          title="Birden fazla satıra aynı katsayı uygula"
        >
          <Calculator className="h-4 w-4" />
          Toplu Katsayı
        </Button>

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
        currency={currency}
        exchangeRate={exchangeRate}
        protectionPct={protectionPct}
        canViewCosts={canViewCosts}
      />

      {/* ---- Profit margin warning ---- */}
      {canViewCosts && profitSummary.profitMargin < 15 && profitSummary.profitMargin > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            Dikkat: Genel kar marji dusuk (%{profitSummary.profitMargin.toFixed(1)})
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
        {/* Multi-row selection toolbar (#5). Appears when ≥1 row is
            checked; offers Çoğalt + Sil + Temizle. Drag-to-move while
            selection is active groups all selected rows together. */}
        {selectedRowIds.size > 0 && (
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 mb-2 shadow-sm">
            <span className="text-sm text-primary-800">
              <span className="font-semibold">{selectedRowIds.size}</span> satır seçili
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBulkDuplicateClick}
                disabled={bulkActionBusy}
                title="Seçili satırları çoğalt"
              >
                <Copy className="h-3.5 w-3.5" /> Çoğalt
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBulkDeleteClick}
                disabled={bulkActionBusy}
                className="text-red-600 hover:bg-red-50"
                title="Seçili satırları sil"
              >
                <Trash2 className="h-3.5 w-3.5" /> Sil
              </Button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkActionBusy}
                className="text-xs text-primary-600 hover:underline ml-1"
              >
                Temizle
              </button>
            </div>
          </div>
        )}

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
          className={`hide-native-hscrollbar border border-t-0 border-accent-200 bg-white overflow-x-auto ${needsHScroll ? '' : 'rounded-b-lg'}`}
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

            {filteredItems.map((item, idx) => {
              const origIdx = itemIndexMap.get(item.id) ?? 0;
              // Effective currency for pricing cells in this row. Only
              // top-level SET rows may override — everything else falls
              // back to the quote's currency. Passed to QuoteItemRow so
              // formatPrice renders the correct symbol.
              const rowCurrency = (item.itemType === 'SET' && !item.parentItemId && item.currency)
                ? item.currency
                : currency;
              const isSubtotal = item.itemType === 'SUBTOTAL';
              const info = isSubtotal && item.id ? subtotalMap.get(item.id) : null;
              const hasDiscount = isSubtotal && (Number(item.sectionDiscountPct) || 0) > 0;
              return (
                <React.Fragment key={item.id ?? idx}>
                  {hasDiscount && info && (
                    <tr className="bg-white">
                      <td colSpan={labelSpan} className="px-3 py-1.5 text-right text-sm text-accent-700">
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="text"
                            value={item.sectionDiscountLabel ?? ''}
                            placeholder="İskonto"
                            aria-label="İskonto etiketini düzenle"
                            onChange={(e) => {
                              if (item.id) {
                                onSectionDiscountLabelChange?.(item.id, e.target.value);
                              }
                            }}
                            className="w-32 rounded border border-transparent px-1 py-0.5 text-right text-sm text-accent-700 hover:border-accent-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-transparent"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={info.discountPct}
                            aria-label="Bu bölümün iskonto yüzdesi"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && item.id) {
                                onSectionDiscountPctChange?.(item.id, val);
                              }
                            }}
                            className="w-16 rounded border border-accent-300 px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                          />
                          %
                          <button
                            type="button"
                            onClick={() => item.id && onSectionDiscountPctChange?.(item.id, 0)}
                            className="text-xs text-accent-400 hover:text-red-600"
                            title="İskontoyu kaldır"
                          >
                            ×
                          </button>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-red-600 whitespace-nowrap">
                        - {formatPrice(info.discountAmount, currency)}
                      </td>
                      {trailingSpan > 0 && <td colSpan={trailingSpan} />}
                    </tr>
                  )}
                  <QuoteItemRow
                    item={item}
                    pozNo={pozMap.get(item.id) ?? null}
                    currency={rowCurrency}
                    overallDiscountPct={0}
                    canViewCosts={canViewCosts}
                    isDragging={!hasActiveFilter && dragIndex === origIdx}
                    columnVisibility={columnVisibility}
                    priceHistory={item.productId ? priceHistoryBatch?.[item.productId] : undefined}
                    totalColCount={totalColCount}
                    subtotalValue={isSubtotal && item.id ? subtotalMap.get(item.id)?.sectionNet : undefined}
                    grandTotalValue={item.itemType === 'GRAND_TOTAL' && item.id ? grandTotalMap.get(item.id) : undefined}
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
                    onInsertHeaderAbove={
                      onInsertHeaderAbove ? () => onInsertHeaderAbove(item.id) : onAddHeader
                    }
                    onInsertProductAbove={
                      onInsertProductAbove ? () => onInsertProductAbove(item.id) : undefined
                    }
                    onSwapProduct={
                      // Restricted to PRODUCT rows. A SET parent's price is
                      // derived from its children, so swapping its product
                      // reference would orphan the children's totals — that
                      // path is intentionally not exposed.
                      onSwapProductRequest && item.productId && item.itemType === 'PRODUCT'
                        ? () => onSwapProductRequest(item.id)
                        : undefined
                    }
                    isSelected={selectedRowIds.has(item.id)}
                    onToggleSelected={() => toggleRowSelected(item.id)}
                    priceLabelOptions={priceLabelCatalog}
                    unitOptions={unitCatalog}
                    onAddSectionDiscount={
                      onSectionDiscountPctChange
                        ? (itemId: string) => onSectionDiscountPctChange(itemId, 5)
                        : undefined
                    }
                  />
                  {/* Render sub-rows for SET parents */}
                  {(() => {
                    const subs = subRowsByParent.get(item.id) || [];
                    // Per-SET currency selector — shown next to the
                    // sub-item toolbar. Hidden entirely when the quote
                    // is TRY (the 2 allowed options would collapse to
                    // one) or when the row is not a SET. The picker
                    // writes `null` for the "quote currency" option so
                    // the server stores the override only when it
                    // actually differs — keeps the DB clean for the
                    // legacy single-currency case.
                    //
                    // The picker is also disabled once the SET has at
                    // least one child: flipping currency after children
                    // exist would leave their numeric prices unchanged
                    // while the displayed symbol flips, producing
                    // silently wrong numbers. User must pick the
                    // currency BEFORE adding any sub-items, or clear
                    // them first.
                    const showCurrencyPicker = item.itemType === 'SET' && !item.parentItemId && currency !== 'TRY';
                    const currentSetCurrency = item.currency ?? currency;
                    const lockCurrencyPicker = subs.length > 0;
                    const setCurrencyPicker = showCurrencyPicker ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-accent-500">Set Para Birimi:</span>
                        <select
                          value={currentSetCurrency}
                          disabled={lockCurrencyPicker}
                          onChange={(e) => {
                            const val = e.target.value;
                            onItemUpdate(item.id, { currency: val === currency ? null : val });
                          }}
                          className={cn(
                            'text-xs border rounded px-1 py-0.5',
                            lockCurrencyPicker
                              ? 'border-accent-200 bg-accent-100 text-accent-500 cursor-not-allowed'
                              : 'border-accent-300 bg-white'
                          )}
                          title={
                            lockCurrencyPicker
                              ? 'Para birimi değiştirmek için önce alt kalemleri kaldırın — fiyatlar otomatik çevrilmez.'
                              : 'Set fiyatlarının para birimi. Alt kalemlerin fiyatları bu para birimine göre girilmelidir.'
                          }
                        >
                          <option value={currency}>{currency}</option>
                          <option value="TRY">TRY</option>
                        </select>
                      </div>
                    ) : null;
                    if (subs.length > 0) {
                      return (
                        <>
                          <tr>
                            <td colSpan={totalColCount} className="px-8 py-0.5 bg-accent-50 border-x border-accent-200">
                              <div className="flex items-center gap-3">
                                {setCurrencyPicker}
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
                              currency={rowCurrency}
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
                              {setCurrencyPicker}
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
                {formatPrice(summary.subtotal, currency)}
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
        {/* Sticky-bottom custom scrollbar — always-visible track and
            draggable thumb. Uses absolute positioning rather than the
            native scrollbar (which macOS Chrome auto-hides even with
            custom ::-webkit-scrollbar styles), so mouse-only users
            can click and drag the thumb to pan the wide table. */}
        <div
          ref={stickyBottomScrollRef}
          className="sticky bottom-0 z-30 bg-accent-100 border-x border-b border-accent-200 rounded-b-lg relative"
          style={{ display: needsHScroll ? 'block' : 'none', height: '14px' }}
          aria-hidden="true"
        >
          <div
            ref={thumbRef}
            className="absolute top-0.5 bottom-0.5 left-0 bg-accent-400 hover:bg-accent-500 active:bg-accent-600 rounded cursor-grab active:cursor-grabbing transition-colors"
            style={{ width: 0, willChange: 'transform' }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>

        {/* Bulk-katsayı modal — pick rows from the editable subset and
            apply the same katsayı value at once. Filter input on top so
            on a long quote (80+ rows) the user can narrow the visible
            set before checking. */}
        <Modal
          isOpen={bulkKatsayiOpen}
          onClose={closeBulkKatsayi}
          title="Toplu Katsayı"
          size="lg"
        >
          <div className="space-y-3">
            <p className="text-sm text-primary-600">
              Birden fazla satıra aynı katsayı değerini uygulayın. Sadece
              katsayı taşıyan satırlar (Ürün, Set, Serbest Kalem) listelenir.
            </p>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-primary-600 mb-1">
                  Filtrele (kod / açıklama / marka)
                </label>
                <input
                  type="text"
                  value={bulkKatsayiFilter}
                  onChange={(e) => setBulkKatsayiFilter(e.target.value)}
                  placeholder="Filtre uygulayın..."
                  className="w-full px-3 py-2 border border-primary-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-primary-600 mb-1">
                  Katsayı
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bulkKatsayiInput}
                  onChange={(e) => setBulkKatsayiInput(e.target.value)}
                  placeholder="örn. 1,2"
                  className="w-full px-3 py-2 border border-primary-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-primary-600">
              <div>
                {selectedKatsayiIds.size} / {bulkKatsayiCandidates.length} seçili
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-accent-600 hover:underline"
                >
                  Görünenlerin tümünü seç
                </button>
                <span className="text-primary-300">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-accent-600 hover:underline"
                >
                  Temizle
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto border border-primary-200 rounded-md divide-y divide-primary-100">
              {bulkKatsayiCandidates.length === 0 ? (
                <div className="p-4 text-center text-sm text-primary-500">
                  Filtre ile eşleşen satır yok.
                </div>
              ) : (
                bulkKatsayiCandidates.map((it) => {
                  const checked = selectedKatsayiIds.has(it.id);
                  const label = [it.code, it.description].filter(Boolean).join(' — ');
                  return (
                    <label
                      key={it.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-accent-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKatsayiSelection(it.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span className="flex-1 truncate">{label || '(boş satır)'}</span>
                      <span className="tabular-nums text-xs text-primary-500 w-16 text-right">
                        {Number(it.katsayi).toFixed(3)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Out-of-range warning: when the typed value falls outside
                the product's min/max katsayı for any selected row, surface
                a count above Apply so the user notices before clicking. */}
            {(() => {
              const raw = bulkKatsayiInput.trim().replace(',', '.');
              const value = Number(raw);
              if (!raw || !Number.isFinite(value) || value <= 0) return null;
              let oorCount = 0;
              selectedKatsayiIds.forEach((id) => {
                const it = items.find((x) => x.id === id);
                if (!it) return;
                const min = it.minKatsayi != null ? Number(it.minKatsayi) : null;
                const max = it.maxKatsayi != null ? Number(it.maxKatsayi) : null;
                if ((min !== null && value < min) || (max !== null && value > max)) {
                  oorCount++;
                }
              });
              if (oorCount === 0) return null;
              return (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠ Seçilenlerin {oorCount} tanesi ürün katsayı aralığının dışında kalacak.
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2 border-t border-primary-200">
              <Button variant="secondary" size="sm" onClick={closeBulkKatsayi}>
                İptal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={applyBulkKatsayi}
                disabled={
                  selectedKatsayiIds.size === 0 ||
                  !bulkKatsayiInput.trim() ||
                  !Number.isFinite(Number(bulkKatsayiInput.trim().replace(',', '.'))) ||
                  Number(bulkKatsayiInput.trim().replace(',', '.')) <= 0
                }
              >
                Uygula ({selectedKatsayiIds.size} satır)
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
