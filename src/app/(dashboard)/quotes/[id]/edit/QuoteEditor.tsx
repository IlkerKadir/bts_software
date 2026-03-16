'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { QuoteEditorHeader } from '@/components/quotes/QuoteEditorHeader';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { ProductCatalogPanel } from '@/components/quotes/ProductCatalogPanel';
import { CommercialTermsSection, type CommercialTermsSectionHandle } from '@/components/quotes/CommercialTermsSection';
import { EkMaliyetModal } from '@/components/quotes/EkMaliyetModal';
import type { QuoteItemData, PriceHistoryStats } from '@/components/quotes/QuoteItemRow';
import type { ProductForQuote } from '@/components/quotes/ProductSearchCard';
import type { ApiQuoteItem, CommercialTerm, CreateItemPayload } from '@/lib/types/quote';
import { PriceHistory } from './PriceHistory';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return generateId();
  }
  // Fallback for non-secure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface QuoteData {
  id: string;
  quoteNumber: string;
  refNo?: string | null;
  status: string;
  currency: string;
  exchangeRate: number | string;
  protectionPct: number | string;
  protectionMap?: Record<string, number> | null;
  discountPct: number | string;
  validityDays: number;
  notes: string | null;
  language: string;
  subject: string | null;
  description: string | null;
  createdAt: string;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string };
  items: ApiQuoteItem[];
  commercialTerms: CommercialTerm[];
}

interface SessionUser {
  id: string;
  fullName: string;
  role: {
    canViewCosts: boolean;
    canApprove: boolean;
    canExport: boolean;
    canOverrideKatsayi: boolean;
    [key: string]: unknown;
  };
}

interface HeaderFields {
  refNo: string;
  subject: string;
  description: string;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
  protectionMap: Record<string, number>;
  language: string;
  validityDays: number;
  discountPct: number;
  notes: string;
  projectId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recalculate a SET parent's totals from its children.
 * unitPrice = childrenTotal (SET has no own base price — sub-items determine the price).
 * Children are linked via parentItemId.
 *
 * Returns a new array — the original is never mutated.
 */
export function recalculateParentTotals(
  items: QuoteItemData[],
  parentId: string,
): QuoteItemData[] {
  const childrenTotal = items
    .filter(item => item.parentItemId === parentId)
    .reduce((sum, child) => sum + (Number(child.totalPrice) || 0), 0);

  return items.map((item) => {
    if (item.id !== parentId) return item;
    const qty = Number(item.quantity) || 1;
    const disc = Number(item.discountPct) || 0;
    const unitPrice = childrenTotal;
    return {
      ...item,
      unitPrice,
      totalPrice: qty * unitPrice * (1 - disc / 100),
    };
  });
}

/** Flatten nested subRows into the top-level array so every item is directly accessible. */
function flattenSubRows(items: QuoteItemData[]): QuoteItemData[] {
  const result: QuoteItemData[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
    if (item.subRows && item.subRows.length > 0) {
      for (const sub of item.subRows) {
        if (!seen.has(sub.id)) {
          result.push(sub);
          seen.add(sub.id);
        }
      }
    }
  }
  return result;
}

function mapApiItemToLocal(item: ApiQuoteItem): QuoteItemData {
  return {
    id: item.id,
    productId: item.productId ?? null,
    parentItemId: item.parentItemId ?? null,
    itemType: item.itemType,
    sortOrder: Number(item.sortOrder),
    code: item.code ?? null,
    brand: item.brand ?? null,
    model: item.model ?? item.product?.model ?? null,
    description: item.description,
    quantity: Number(item.quantity),
    unit: item.unit,
    listPrice: Number(item.listPrice),
    katsayi: Number(item.katsayi),
    unitPrice: Number(item.unitPrice),
    discountPct: Number(item.discountPct),
    vatRate: Number(item.vatRate),
    totalPrice: Number(item.totalPrice),
    notes: item.notes ?? null,
    isManualPrice: item.isManualPrice ?? false,
    costPrice: item.costPrice != null ? Number(item.costPrice) : null,
    productCurrency: item.product?.currency ?? null,
    productListPrice: item.product?.listPrice != null ? Number(item.product.listPrice) : null,
    productCostPrice: item.product?.costPrice != null ? Number(item.product.costPrice) : null,
    minKatsayi: item.product?.minKatsayi != null ? Number(item.product.minKatsayi) : null,
    maxKatsayi: item.product?.maxKatsayi != null ? Number(item.product.maxKatsayi) : null,
    subRows: item.subRows?.map(mapApiItemToLocal) ?? undefined,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface QuoteEditorProps {
  quoteId: string;
}

export function QuoteEditor({ quoteId }: QuoteEditorProps) {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [items, setItems] = useState<QuoteItemData[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [subItemParentId, setSubItemParentId] = useState<string | null>(null);
  const [ekMaliyetOpen, setEkMaliyetOpen] = useState(false);
  const [setCreationMode, setSetCreationMode] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Header fields tracked for change detection
  const [headerFields, setHeaderFields] = useState<HeaderFields>({
    refNo: '',
    subject: '',
    description: '',
    currency: 'EUR',
    exchangeRate: 1,
    protectionPct: 0,
    protectionMap: {},
    language: 'TR',
    validityDays: 30,
    discountPct: 0,
    notes: '',
    projectId: null,
  });
  const savedHeaderRef = useRef<HeaderFields | null>(null);

  // Items dirty tracking for reorder/bulk update
  const itemsDirtyRef = useRef(false);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commercialTermsRef = useRef<CommercialTermsSectionHandle>(null);

  // Guard to prevent infinite re-render loop in the auto-recalculate effect
  const isRecalculating = useRef(false);

  // Exchange rate matrix for currency conversion (fromCurrency -> toCurrency -> rate)
  const [exchangeRates, setExchangeRates] = useState<Record<string, Record<string, number>>>({});

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [quoteRes, sessionRes, ratesRes] = await Promise.all([
        fetch(`/api/quotes/${quoteId}`),
        fetch('/api/auth/me'),
        fetch('/api/exchange-rates?latestOnly=true'),
      ]);

      if (!quoteRes.ok) {
        throw new Error('Teklif yüklenirken bir hata oluştu');
      }
      if (!sessionRes.ok) {
        throw new Error('Oturum bilgisi alınamadı');
      }

      const quoteData = await quoteRes.json();
      const sessionData = await sessionRes.json();

      // Build exchange rate matrix (fromCurrency -> toCurrency -> rate)
      if (ratesRes.ok) {
        const ratesData = await ratesRes.json();
        const matrix: Record<string, Record<string, number>> = {};
        for (const r of ratesData.rates || []) {
          const from = r.fromCurrency as string;
          const to = r.toCurrency as string;
          const rate = Number(r.rate);
          if (!matrix[from]) matrix[from] = {};
          matrix[from][to] = rate;
        }
        setExchangeRates(matrix);
      }

      const q: QuoteData = quoteData.quote;
      setQuote(q);

      // Map items with Decimal -> number conversion, flatten nested subRows
      const mappedItems = (q.items || []).map(mapApiItemToLocal);
      const flatItems = flattenSubRows(mappedItems);
      setItems(flatItems);

      // Set user session
      setUser(sessionData.user);

      // Initialize header fields
      const hf: HeaderFields = {
        refNo: q.refNo || '',
        subject: q.subject || '',
        description: q.description || '',
        currency: q.currency,
        exchangeRate: Number(q.exchangeRate),
        protectionPct: Number(q.protectionPct),
        protectionMap: (q.protectionMap && typeof q.protectionMap === 'object') ? q.protectionMap as Record<string, number> : {},
        language: q.language,
        validityDays: q.validityDays,
        discountPct: Number(q.discountPct),
        notes: q.notes || '',
        projectId: q.project?.id || null,
      };
      setHeaderFields(hf);
      savedHeaderRef.current = { ...hf };
      setHasChanges(false);
      itemsDirtyRef.current = false;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Teklif yüklenirken bir hata oluştu'
      );
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Change detection ───────────────────────────────────────────────────────

  const checkHeaderChanges = useCallback((fields: HeaderFields) => {
    if (!savedHeaderRef.current) return false;
    const saved = savedHeaderRef.current;
    return (
      fields.refNo !== saved.refNo ||
      fields.subject !== saved.subject ||
      fields.description !== saved.description ||
      fields.currency !== saved.currency ||
      fields.exchangeRate !== saved.exchangeRate ||
      fields.protectionPct !== saved.protectionPct ||
      JSON.stringify(fields.protectionMap) !== JSON.stringify(saved.protectionMap) ||
      fields.language !== saved.language ||
      fields.validityDays !== saved.validityDays ||
      fields.discountPct !== saved.discountPct ||
      fields.notes !== saved.notes ||
      fields.projectId !== saved.projectId
    );
  }, []);

  const updateHeaderField = useCallback(
    <K extends keyof HeaderFields>(key: K, value: HeaderFields[K]) => {
      setHeaderFields((prev) => {
        const next = { ...prev, [key]: value };
        setHasChanges(checkHeaderChanges(next) || itemsDirtyRef.current);
        return next;
      });
    },
    [checkHeaderChanges]
  );

  // ── Unsaved changes warning ────────────────────────────────────────────────

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  // ── Success message auto-dismiss ───────────────────────────────────────────

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isEditable = quote
    ? (quote.status === 'TASLAK' || quote.status === 'REVIZYON' ||
       (quote.status === 'ONAY_BEKLIYOR' && user?.role.canApprove))
    : false;

  // All items go into the unified table (no service split)
  // Build parent-child relationships from the flat items list so sub-rows
  // always appear under their parent, even when created sequentially.
  const topLevelItems = useMemo(() => {
    const top = items.filter((item) => !item.parentItemId);
    return top.map((item) => {
      const children = items.filter((sub) => sub.parentItemId === item.id);
      return children.length > 0 ? { ...item, subRows: children } : item;
    });
  }, [items]);

  // ── Save handler ───────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!quote) return;
    setIsSaving(true);
    setError(null);

    try {
      // 1. Save header fields if changed
      if (checkHeaderChanges(headerFields)) {
        const headerRes = await fetch(`/api/quotes/${quoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refNo: headerFields.refNo || null,
            subject: headerFields.subject,
            description: headerFields.description,
            currency: headerFields.currency,
            exchangeRate: headerFields.exchangeRate,
            protectionPct: headerFields.protectionPct,
            protectionMap: headerFields.protectionMap,
            language: headerFields.language,
            validityDays: headerFields.validityDays,
            discountPct: headerFields.discountPct,
            notes: headerFields.notes,
            projectId: headerFields.projectId,
          }),
        });

        if (!headerRes.ok) {
          const data = await headerRes.json();
          throw new Error(data.error || 'Teklif kaydedilemedi');
        }

        // Update local quote data
        const headerData = await headerRes.json();
        setQuote((prev) =>
          prev ? { ...prev, ...headerData.quote } : prev
        );
      }

      // 2. Save items if dirty (reorder or modifications)
      if (itemsDirtyRef.current) {
        const bulkItems = items.map((item) => ({
          id: item.id,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          productId: item.productId,
          parentItemId: item.parentItemId || null,
          code: item.code || '',
          brand: item.brand || '',
          model: item.model || '',
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          listPrice: item.listPrice,
          katsayi: item.katsayi,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          discountPct: item.discountPct,
          vatRate: item.vatRate,
          isManualPrice: item.isManualPrice || false,
          costPrice: item.costPrice ?? null,
          notes: item.notes || '',
        }));

        if (bulkItems.length > 0) {
          const itemsRes = await fetch(`/api/quotes/${quoteId}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: bulkItems }),
          });

          if (!itemsRes.ok) {
            const data = await itemsRes.json();
            throw new Error(data.error || 'Kalemler kaydedilemedi');
          }

          const itemsData = await itemsRes.json();
          if (itemsData.items) {
            setItems(flattenSubRows(itemsData.items.map(mapApiItemToLocal)));
          }
        }
      }

      // 3. Save commercial terms if changed
      if (commercialTermsRef.current?.hasChanges()) {
        await commercialTermsRef.current.save();
      }

      // 4. Reset change tracking
      savedHeaderRef.current = { ...headerFields };
      itemsDirtyRef.current = false;
      setHasChanges(false);
      setSuccessMessage('Teklif başarıyla kaydedildi');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Kaydetme sırasında bir hata oluştu'
      );
    } finally {
      setIsSaving(false);
    }
  }, [quote, quoteId, headerFields, items, checkHeaderChanges]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  const shortcuts = useMemo(() => ({
    'Ctrl+S': () => handleSave(),
  }), [handleSave]);

  useKeyboardShortcuts(shortcuts);

  // ── Auto-recalculate parent totals from sub-item totals ──────────────────

  useEffect(() => {
    if (isRecalculating.current) { isRecalculating.current = false; return; }

    const childrenByParent = new Map<string, QuoteItemData[]>();
    for (const item of items) {
      if (item.parentItemId) {
        const list = childrenByParent.get(item.parentItemId) || [];
        list.push(item);
        childrenByParent.set(item.parentItemId, list);
      }
    }
    if (childrenByParent.size === 0) return;

    const parentIdsToUpdate: string[] = [];
    for (const [parentId, children] of childrenByParent) {
      const childTotal = children.reduce((s, c) => s + (Number(c.totalPrice) || 0), 0);
      const parent = items.find(i => i.id === parentId);
      if (parent) {
        const expectedUnitPrice = childTotal;
        if (Math.abs(Number(parent.unitPrice) - expectedUnitPrice) > 0.01) {
          parentIdsToUpdate.push(parentId);
        }
      }
    }
    if (parentIdsToUpdate.length === 0) return;

    isRecalculating.current = true;
    itemsDirtyRef.current = true;
    setItems(prev => {
      let result = prev;
      for (const parentId of parentIdsToUpdate) {
        result = recalculateParentTotals(result, parentId);
      }
      return result;
    });
    setHasChanges(true);
  }, [items]);

  // ── Item operations ────────────────────────────────────────────────────────

  const handleItemUpdate = useCallback(
    (itemId: string, updates: Partial<QuoteItemData>) => {
      setItems((prev) => {
        // First pass: update the target item
        let updatedItems = prev.map((item) => {
          if (item.id !== itemId) return item;

          const updated = { ...item, ...updates };

          // Recalculate derived fields if pricing inputs changed
          if (
            'listPrice' in updates ||
            'katsayi' in updates ||
            'quantity' in updates ||
            'discountPct' in updates
          ) {
            const listPrice =
              updates.listPrice !== undefined ? updates.listPrice : item.listPrice;
            const katsayi =
              updates.katsayi !== undefined ? updates.katsayi : item.katsayi;
            const quantity =
              updates.quantity !== undefined ? updates.quantity : item.quantity;
            const discPct =
              updates.discountPct !== undefined
                ? updates.discountPct
                : item.discountPct;

            // Only recalculate unitPrice if not manually priced (skip SET parents — their price comes from children)
            const isSetParentItem = updated.itemType === 'SET' && !updated.parentItemId;
            if (
              !updated.isManualPrice &&
              !isSetParentItem &&
              ('listPrice' in updates || 'katsayi' in updates)
            ) {
              updated.unitPrice = listPrice * katsayi;
            }

            updated.totalPrice =
              quantity * updated.unitPrice * (1 - discPct / 100);
          }

          return updated;
        });

        const updatedItem = updatedItems.find((i) => i.id === itemId);

        // If a sub-row changed, recalculate its parent's unitPrice/totalPrice
        if (updatedItem?.parentItemId) {
          updatedItems = recalculateParentTotals(updatedItems, updatedItem.parentItemId);
        }

        return updatedItems;
      });

      itemsDirtyRef.current = true;
      setHasChanges(true);
    },
    []
  );

  const handleItemDelete = useCallback(
    async (itemId: string) => {
      // Bug #3: Confirm before deleting
      const itemToDelete = items.find((i) => i.id === itemId);
      const totalChildren = items.filter((i) => i.parentItemId === itemId).length;

      const confirmMsg = totalChildren > 0
        ? `Bu kalemi ve ${totalChildren} alt kalemini silmek istediğinize emin misiniz?`
        : 'Bu kalemi silmek istediğinize emin misiniz?';
      if (!window.confirm(confirmMsg)) return;

      // Bug #2: Store deleted items for rollback
      const deletedItems = items.filter(
        (item) => item.id === itemId || item.parentItemId === itemId
      );

      setItems((prev) => {
        // Remove the item and its sub-rows
        let remaining = prev.filter((item) => item.id !== itemId && item.parentItemId !== itemId);

        // If the deleted item was a sub-row, recalculate its parent's total
        if (itemToDelete?.parentItemId) {
          remaining = recalculateParentTotals(remaining, itemToDelete.parentItemId);
        }

        return remaining;
      });

      // Bug #2: API call with rollback on failure
      try {
        const res = await fetch(`/api/quotes/${quoteId}/items/${itemId}`, {
          method: 'DELETE',
        });
        // 404 is OK — item was already deleted (e.g. cascade-deleted with parent)
        if (!res.ok && res.status !== 404) {
          throw new Error('Silme işlemi başarısız oldu');
        }
      } catch (err) {
        console.error('Item delete error:', err);
        // Restore deleted items on failure
        setItems((prev) => {
          // Re-insert deleted items at their original sort positions
          const merged = [...prev, ...deletedItems];
          merged.sort((a, b) => a.sortOrder - b.sortOrder);
          return merged;
        });
        setError('Kalem silinirken bir hata oluştu. Değişiklikler geri alındı.');
      }
    },
    [quoteId, items]
  );

  const handleItemDuplicate = useCallback(
    async (itemId: string) => {
      const original = items.find((item) => item.id === itemId);
      if (!original) return;

      // Find sub-rows that belong to this item
      const originalSubRows = items.filter((item) => item.parentItemId === itemId);

      const tempId = generateId();
      const duplicated: QuoteItemData = {
        ...original,
        id: tempId,
        sortOrder: original.sortOrder + 1,
      };

      // Create temp sub-rows with temp IDs pointing to the new parent temp ID
      const tempSubRows = originalSubRows.map((sub) => ({
        ...sub,
        id: generateId(),
        parentItemId: tempId,
        sortOrder: sub.sortOrder + 1,
      }));

      // Insert after original (and its sub-rows) in local state
      setItems((prev) => {
        // Find the last index of the original item or its sub-rows
        let insertAfterIdx = prev.findIndex((item) => item.id === itemId);
        for (let i = insertAfterIdx + 1; i < prev.length; i++) {
          if (prev[i].parentItemId === itemId) {
            insertAfterIdx = i;
          } else {
            break;
          }
        }
        const next = [...prev];
        next.splice(insertAfterIdx + 1, 0, duplicated, ...tempSubRows);
        // Reassign sort orders
        return next.map((item, idx) => ({
          ...item,
          sortOrder: idx + 1,
        }));
      });

      // POST parent to API
      try {
        const res = await fetch(`/api/quotes/${quoteId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: duplicated.itemType,
            productId: duplicated.productId || undefined,
            parentItemId: duplicated.parentItemId || undefined,
            code: duplicated.code || undefined,
            brand: duplicated.brand || undefined,
            model: duplicated.model || undefined,
            description: duplicated.description,
            quantity: duplicated.quantity,
            unit: duplicated.unit,
            listPrice: duplicated.listPrice,
            katsayi: duplicated.katsayi,
            discountPct: duplicated.discountPct,
            vatRate: duplicated.vatRate,
            notes: duplicated.notes || undefined,
            sortOrder: duplicated.sortOrder,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const newParentId = data.item.id;
          // Replace temp ID with server-returned ID
          setItems((prev) =>
            prev.map((item) =>
              item.id === tempId ? mapApiItemToLocal(data.item) : item
            )
          );

          // Duplicate sub-rows in parallel, pointing to the new server parent ID
          if (tempSubRows.length > 0) {
            const subResults = await Promise.allSettled(
              tempSubRows.map((tempSub) =>
                fetch(`/api/quotes/${quoteId}/items`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    itemType: tempSub.itemType,
                    productId: tempSub.productId || undefined,
                    parentItemId: newParentId,
                    code: tempSub.code || undefined,
                    brand: tempSub.brand || undefined,
                    model: tempSub.model || undefined,
                    description: tempSub.description,
                    quantity: tempSub.quantity,
                    unit: tempSub.unit,
                    listPrice: tempSub.listPrice,
                    katsayi: tempSub.katsayi,
                    discountPct: tempSub.discountPct,
                    vatRate: tempSub.vatRate,
                    notes: tempSub.notes || undefined,
                    sortOrder: tempSub.sortOrder,
                  }),
                }).then(async (subRes) => ({
                  tempId: tempSub.id,
                  ok: subRes.ok,
                  data: subRes.ok ? await subRes.json() : null,
                }))
              )
            );

            // Replace all temp sub-row IDs with server-returned IDs in a single state update
            const replacements = new Map<string, QuoteItemData>();
            for (const result of subResults) {
              if (result.status === 'fulfilled' && result.value.ok && result.value.data) {
                replacements.set(result.value.tempId, mapApiItemToLocal(result.value.data.item));
              } else if (result.status === 'rejected') {
                console.error('Sub-row duplicate error:', result.reason);
              }
            }

            if (replacements.size > 0) {
              setItems((prev) =>
                prev.map((item) => replacements.get(item.id) ?? item)
              );
            }
          }
        }
      } catch (err) {
        console.error('Item duplicate error:', err);
      }
    },
    [items, quoteId]
  );

  const handleReorder = useCallback(
    (reorderedItems: QuoteItemData[]) => {
      // Flatten: reorderedItems may have nested subRows from topLevelItems.
      // We need to re-flatten them back into the items state array.
      const flatItems: QuoteItemData[] = [];
      for (const item of reorderedItems) {
        flatItems.push(item);
        if (item.subRows && item.subRows.length > 0) {
          for (const sub of item.subRows) {
            flatItems.push(sub);
          }
        }
      }
      setItems(flatItems);
      itemsDirtyRef.current = true;
      setHasChanges(true);

      // Debounce persist
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
      }
      reorderTimerRef.current = setTimeout(async () => {
        const bulkItems = flatItems.map((item) => ({
          id: item.id,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          productId: item.productId,
          parentItemId: item.parentItemId || null,
          code: item.code || '',
          brand: item.brand || '',
          model: item.model || '',
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          listPrice: item.listPrice,
          katsayi: item.katsayi,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          isManualPrice: item.isManualPrice || false,
          discountPct: item.discountPct,
          vatRate: item.vatRate,
          costPrice: item.costPrice ?? null,
          notes: item.notes || '',
        }));

        try {
          await fetch(`/api/quotes/${quoteId}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: bulkItems }),
          });
          itemsDirtyRef.current = false;
        } catch (err) {
          console.error('Reorder persist error:', err);
        }
      }, 1000);
    },
    [quoteId]
  );

  const handleDiscountPctChange = useCallback(
    (value: number) => {
      updateHeaderField('discountPct', value);
    },
    [updateHeaderField]
  );

  // ── Add product from catalog ───────────────────────────────────────────────

  const handleAddProduct = useCallback(
    async (product: ProductForQuote) => {
      const tempId = generateId();
      const lang = headerFields.language;
      const quoteCurrency = headerFields.currency;
      const productCurrency = product.currency;
      const isSubItem = !!subItemParentId;

      // Currency conversion: convert product price to quote currency
      let convertedListPrice = product.listPrice;
      let convertedCostPrice = product.costPrice ?? null;

      if (productCurrency !== quoteCurrency) {
        // Convert product price to quote currency using raw TCMB rates.
        // Then apply per-pair protection on top of the converted price.
        const pk = [productCurrency, quoteCurrency].sort().join('/');
        const protectionPct = headerFields.protectionMap[pk] ?? 0;

        // Find raw conversion rate: productCurrency → quoteCurrency
        let rate = exchangeRates[productCurrency]?.[quoteCurrency];
        if (!rate) {
          // Try reverse: quoteCurrency → productCurrency, then invert
          const reverseRate = exchangeRates[quoteCurrency]?.[productCurrency];
          if (reverseRate && reverseRate !== 0) {
            rate = 1 / reverseRate;
          }
        }

        if (rate) {
          // First convert at raw rate, then add protection buffer
          convertedListPrice = product.listPrice * rate * (1 + protectionPct / 100);
          if (convertedCostPrice != null) {
            convertedCostPrice = convertedCostPrice * rate * (1 + protectionPct / 100);
          }
        }
        // If no rate found at all, use 1:1 (fallback — user can adjust manually)
      }

      const defaultKatsayi = 1;
      // SET parents start with unitPrice=0 (price comes from children); others use listPrice*katsayi
      const unitPrice = setCreationMode ? 0 : convertedListPrice * defaultKatsayi;

      // Sub-items: vatRate=0 (VAT is on the parent), keep catalog open for more
      const newItem: QuoteItemData = {
        id: tempId,
        productId: product.id,
        parentItemId: isSubItem ? subItemParentId : undefined,
        itemType: setCreationMode ? 'SET' : 'PRODUCT',
        sortOrder: items.length + 1,
        code: product.code,
        brand: product.brandName ?? null,
        model: product.model ?? null,
        description:
          lang === 'EN'
            ? product.nameEn || product.name
            : product.nameTr || product.name,
        quantity: 1,
        unit: setCreationMode ? 'Set' : product.unit,
        listPrice: setCreationMode ? 0 : convertedListPrice,
        katsayi: defaultKatsayi,
        unitPrice,
        discountPct: 0,
        vatRate: isSubItem ? 0 : 20,
        totalPrice: unitPrice, // qty=1, discount=0
        isManualPrice: product.pricingType === 'PROJECT_BASED',
        costPrice: convertedCostPrice,
        productCurrency: product.currency,
        productListPrice: product.listPrice,
        productCostPrice: product.costPrice ?? null,
        minKatsayi: product.minKatsayi ?? null,
        maxKatsayi: product.maxKatsayi ?? null,
      };

      // After creating a SET item, reset creation mode
      if (setCreationMode) {
        setSetCreationMode(false);
      }

      // Add to local state
      setItems((prev) => [...prev, newItem]);

      // POST to API
      const postBody: CreateItemPayload = {
        itemType: newItem.itemType as 'PRODUCT' | 'SET',
        productId: product.id,
        parentItemId: isSubItem ? subItemParentId! : undefined,
        code: product.code,
        brand: product.brandName || undefined,
        model: product.model || undefined,
        description: newItem.description,
        quantity: 1,
        unit: newItem.unit,
        listPrice: convertedListPrice,
        katsayi: defaultKatsayi,
        discountPct: 0,
        vatRate: isSubItem ? 0 : 20,
        sortOrder: newItem.sortOrder,
      };

      try {
        const res = await fetch(`/api/quotes/${quoteId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });

        if (res.ok) {
          const data = await res.json();
          // Replace temp ID with server-returned ID
          setItems((prev) =>
            prev.map((item) => {
              if (item.id !== tempId) return item;
              return mapApiItemToLocal(data.item);
            })
          );
        } else {
          // Remove optimistic item on failure
          setItems((prev) => prev.filter((item) => item.id !== tempId));
        }
      } catch (err) {
        console.error('Add product error:', err);
      }
    },
    [quoteId, headerFields.language, headerFields.currency, headerFields.protectionPct, headerFields.protectionMap, exchangeRates, items.length, subItemParentId, setCreationMode]
  );

  // ── Add header row ─────────────────────────────────────────────────────────

  const handleAddHeader = useCallback(async () => {
    const tempId = generateId();
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'HEADER',
      sortOrder: items.length + 1,
      description: 'Yeni Başlık',
      quantity: 0,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 0,
      totalPrice: 0,
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'HEADER',
          description: 'Yeni Başlık',
          quantity: 0,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          discountPct: 0,
          vatRate: 0,
          sortOrder: newItem.sortOrder,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = mapApiItemToLocal(data.item);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== tempId) return item;
            return { ...item, ...serverItem, description: item.description };
          })
        );
      }
    } catch (err) {
      console.error('Add header error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add note row ───────────────────────────────────────────────────────────

  const handleAddNote = useCallback(async () => {
    const tempId = generateId();
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'NOTE',
      sortOrder: items.length + 1,
      description: 'Not...',
      quantity: 0,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 0,
      totalPrice: 0,
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'NOTE',
          description: 'Not...',
          quantity: 0,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          discountPct: 0,
          vatRate: 0,
          sortOrder: newItem.sortOrder,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = mapApiItemToLocal(data.item);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== tempId) return item;
            // Merge: keep user's local edits (e.g. description), only take server ID
            return { ...item, ...serverItem, description: item.description };
          })
        );
      }
    } catch (err) {
      console.error('Add note error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add custom item ──────────────────────────────────────────────────────

  const handleAddCustomItem = useCallback(async () => {
    const tempId = generateId();
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'CUSTOM',
      sortOrder: items.length + 1,
      description: 'Serbest Kalem',
      quantity: 1,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 20,
      totalPrice: 0,
      isManualPrice: false,
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'CUSTOM',
          description: 'Serbest Kalem',
          quantity: 1,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          unitPrice: 0,
          totalPrice: 0,
          vatRate: 20,
          discountPct: 0,
          sortOrder: newItem.sortOrder,
          isManualPrice: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = mapApiItemToLocal(data.item);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== tempId) return item;
            return { ...item, ...serverItem, description: item.description };
          })
        );
      }
    } catch (err) {
      console.error('Add custom item error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add subtotal row ────────────────────────────────────────────────────

  const handleAddSubtotal = useCallback(async () => {
    const tempId = generateId();
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'SUBTOTAL',
      sortOrder: items.length + 1,
      description: 'Ara Toplam',
      quantity: 0,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 0,
      totalPrice: 0,
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'SUBTOTAL',
          description: 'Ara Toplam',
          quantity: 0,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          discountPct: 0,
          vatRate: 0,
          sortOrder: newItem.sortOrder,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverItem = mapApiItemToLocal(data.item);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== tempId) return item;
            return { ...item, ...serverItem, description: item.description };
          })
        );
      }
    } catch (err) {
      console.error('Add subtotal error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add sub-item to a parent ──────────────────────────────────────────

  const handleAddSubItem = useCallback((parentId: string) => {
    setSubItemParentId(parentId);
    setCatalogOpen(true);
  }, []);

  // ── Price history ─────────────────────────────────────────────────────────

  // ── Batch price history for inline columns ──────────────────────────────
  const [priceHistoryBatch, setPriceHistoryBatch] = useState<Record<string, PriceHistoryStats>>({});

  // Memoize the unique product IDs string so the effect only re-runs when the
  // set of products actually changes, not on every price/quantity edit.
  const productIdsKey = useMemo(() => {
    return items
      .filter((i) => i.productId && i.itemType === 'PRODUCT')
      .map((i) => i.productId!)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()
      .join(',');
  }, [items]);

  useEffect(() => {
    if (!quote || !user) return;
    if (!productIdsKey) return;

    const fetchBatchHistory = async () => {
      try {
        const params = new URLSearchParams({
          companyId: quote.company.id,
          productIds: productIdsKey,
        });
        const res = await fetch(`/api/products/price-history/batch-stats?${params}`);
        if (res.ok) {
          const data = await res.json();
          setPriceHistoryBatch(data.stats || {});
        }
      } catch (err) {
        console.error('Batch price history fetch error:', err);
      }
    };

    fetchBatchHistory();
  }, [quote, user, productIdsKey]);

  const [priceHistoryProductId, setPriceHistoryProductId] = useState<string | null>(null);

  const handleShowPriceHistory = useCallback((productId: string) => {
    setPriceHistoryProductId(productId);
  }, []);

  const handleApplyPrice = useCallback(
    (productId: string, unitPrice: number, katsayi: number) => {
      // Find the item(s) that match this productId and update them
      setItems((prev) =>
        prev.map((item) => {
          if (item.productId !== productId) return item;
          if (item.itemType === 'SET' && !item.parentItemId) return item;
          const newUnitPrice = item.isManualPrice ? unitPrice : item.listPrice * katsayi;
          const total = item.quantity * newUnitPrice * (1 - item.discountPct / 100);
          return { ...item, katsayi, unitPrice: newUnitPrice, totalPrice: total };
        })
      );
      itemsDirtyRef.current = true;
      setHasChanges(true);
      setPriceHistoryProductId(null);
    },
    []
  );

  // ── Submit for approval ────────────────────────────────────────────────────

  const handleSubmitForApproval = useCallback(async () => {
    if (!quote || hasChanges) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ONAY_BEKLIYOR' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Onaya gönderme işlemi başarısız');
      }

      // Update local status
      setQuote((prev) =>
        prev ? { ...prev, status: 'ONAY_BEKLIYOR' } : prev
      );
      setSuccessMessage('Teklif onaya gönderildi');

      // Redirect to detail page after brief delay
      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Onaya gönderme sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);

  // ── Approve / Reject (manager actions from editor) ───────────────────────

  const handleApproveFromEditor = useCallback(async () => {
    if (!quote || hasChanges) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ONAYLANDI' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Onaylama işlemi başarısız');
      }

      setQuote((prev) => (prev ? { ...prev, status: 'ONAYLANDI' } : prev));
      setSuccessMessage('Teklif onaylandı');

      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Onaylama sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);

  const handleRejectFromEditor = useCallback(async () => {
    if (!quote || hasChanges) return;

    const note = prompt('Revizyon nedeni:');
    if (!note) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVIZYON', note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Reddetme işlemi başarısız');
      }

      setQuote((prev) => (prev ? { ...prev, status: 'REVIZYON' } : prev));
      setSuccessMessage('Teklif revizyona gönderildi');

      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Reddetme sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    window.open(`/api/quotes/${quoteId}/export/excel`, '_blank');
  }, [quoteId]);

  // ── Create SET handler ─────────────────────────────────────────────────────

  const handleCreateSet = useCallback(() => {
    setSubItemParentId(null);
    setSetCreationMode(true);
    setCatalogOpen(true);
  }, []);

  // ── Exchange Rate Apply handler ────────────────────────────────────────────

  const handleExchangeRateApply = useCallback(
    (
      _newRate: number,
      _newProtectionPct: number,
      newProtectionMap: Record<string, number>,
      rateMatrix: Record<string, Record<string, number>>,
    ) => {
      const quoteCurrency = headerFields.currency;

      setItems((prev) => {
        let result = prev.map((item) => {
          // Skip non-priced items, SET parents, manual-priced items, and items without product data
          if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') return item;
          if (item.itemType === 'SET' && !item.parentItemId) return item;
          if (item.isManualPrice) return item;
          if (!item.productCurrency || item.productListPrice == null || item.productListPrice === 0) return item;
          if (item.productCurrency === quoteCurrency) return item;

          // Re-convert from product's original price using fresh rateMatrix + protection
          const pk = [item.productCurrency, quoteCurrency].sort().join('/');
          const protectionPct = newProtectionMap[pk] ?? 0;

          let rate = rateMatrix[item.productCurrency]?.[quoteCurrency];
          if (!rate) {
            const reverseRate = rateMatrix[quoteCurrency]?.[item.productCurrency];
            if (reverseRate && reverseRate !== 0) rate = 1 / reverseRate;
          }
          if (!rate) return item;

          const newListPrice = item.productListPrice * rate * (1 + protectionPct / 100);
          const newUnitPrice = newListPrice * Number(item.katsayi);
          const newTotalPrice = Number(item.quantity) * newUnitPrice * (1 - Number(item.discountPct) / 100);

          // Reconvert costPrice if available
          let newCostPrice = item.costPrice;
          if (item.productCostPrice != null) {
            newCostPrice = item.productCostPrice * rate * (1 + protectionPct / 100);
          }

          return { ...item, listPrice: newListPrice, unitPrice: newUnitPrice, totalPrice: newTotalPrice, costPrice: newCostPrice };
        });

        // Recalculate SET parents whose children may have changed
        const affectedParentIds = new Set<string>();
        for (const item of result) {
          if (item.parentItemId) affectedParentIds.add(item.parentItemId);
        }
        for (const parentId of affectedParentIds) {
          result = recalculateParentTotals(result, parentId);
        }

        return result;
      });

      // Update exchangeRates state so newly added products use fresh rates too
      setExchangeRates(rateMatrix);

      itemsDirtyRef.current = true;
      setHasChanges(true);
    },
    [headerFields.currency]
  );

  // ── Ek Maliyet Apply handler ──────────────────────────────────────────────

  const handleEkMaliyetApply = useCallback((totalAmount: number) => {
    // totalAmount is already in quote currency
    // Always recalculate from base price (listPrice * katsayi) so edits/deletes are idempotent
    const taseronItems = items.filter(i => i.brand === 'TAŞERON' && i.parentItemId);
    const totalQty = taseronItems.reduce((s, i) => s + Number(i.quantity), 0);

    // No TAŞERON items to distribute across — skip silently
    if (taseronItems.length === 0 || totalQty === 0) return;

    const perUnit = totalAmount / totalQty;

    itemsDirtyRef.current = true;
    setItems(prev => {
      let result = prev.map(item => {
        if (item.brand !== 'TAŞERON' || !item.parentItemId) return item;
        const baseUnitPrice = Number(item.listPrice) * Number(item.katsayi);
        const newUnitPrice = baseUnitPrice + perUnit;
        const newTotal = Number(item.quantity) * newUnitPrice * (1 - Number(item.discountPct) / 100);
        return { ...item, unitPrice: newUnitPrice, totalPrice: newTotal };
      });
      // Recalculate affected SET parents
      const affectedParents = new Set(taseronItems.map(i => i.parentItemId!));
      for (const parentId of affectedParents) {
        result = recalculateParentTotals(result, parentId);
      }
      return result;
    });
    setHasChanges(true);
  }, [items]);

  // ── Render: Loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-primary-500">Teklif yükleniyor...</p>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────────

  if (error && !quote) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 max-w-md text-center">
          <p className="text-sm text-red-700 font-medium">
            Teklif yüklenirken bir hata oluştu
          </p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-3 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (!quote || !user) return null;

  // ── Render: Main ───────────────────────────────────────────────────────────

  // "Submit for Approval" — any user can submit their quote for approval
  const canSubmitForApproval =
    (quote.status === 'TASLAK' || quote.status === 'REVIZYON') && !hasChanges
      ? handleSubmitForApproval
      : undefined;

  // Approve / Reject buttons only when an approver is viewing an ONAY_BEKLIYOR quote
  const canApprove =
    quote.status === 'ONAY_BEKLIYOR' && user.role.canApprove
      ? handleApproveFromEditor
      : undefined;
  const canReject =
    quote.status === 'ONAY_BEKLIYOR' && user.role.canApprove
      ? handleRejectFromEditor
      : undefined;

  const canExport = user.role.canExport ? handleExport : undefined;

  return (
    <div className="space-y-4">
      {/* Success banner */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3">
          <p className="text-sm text-green-700 font-medium">
            {successMessage}
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Header */}
      <QuoteEditorHeader
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        status={quote.status}
        companyName={quote.company.name}
        companyId={quote.company.id}
        projectId={headerFields.projectId}
        projectName={
          headerFields.projectId === quote.project?.id
            ? quote.project?.name
            : undefined
        }
        refNo={headerFields.refNo}
        systemBrand={headerFields.subject}
        description={headerFields.description}
        date={new Date(quote.createdAt).toLocaleDateString('tr-TR')}
        currency={headerFields.currency}
        exchangeRate={headerFields.exchangeRate}
        protectionPct={headerFields.protectionPct}
        protectionMap={headerFields.protectionMap}
        language={headerFields.language}
        validityDays={headerFields.validityDays}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onProjectChange={(v) => updateHeaderField('projectId', v)}
        onRefNoChange={(v) => updateHeaderField('refNo', v)}
        onSystemBrandChange={(v) => updateHeaderField('subject', v)}
        onDescriptionChange={(v) => updateHeaderField('description', v)}
        onCurrencyChange={(v) => updateHeaderField('currency', v)}
        onExchangeRateChange={(v) => updateHeaderField('exchangeRate', v)}
        onProtectionPctChange={(v) => updateHeaderField('protectionPct', v)}
        onProtectionMapChange={(v) => updateHeaderField('protectionMap', v)}
        onExchangeRateApply={handleExchangeRateApply}
        onLanguageChange={(v) => updateHeaderField('language', v)}
        onValidityDaysChange={(v) => updateHeaderField('validityDays', v)}
        onSave={handleSave}
        onSubmitForApproval={canSubmitForApproval}
        onApprove={canApprove}
        onReject={canReject}
        onExport={canExport}
      />

      {/* Items table */}
      <QuoteItemsTable
        items={topLevelItems}
        currency={headerFields.currency}
        discountPct={headerFields.discountPct}
        canViewCosts={user.role.canViewCosts}
        canOverrideKatsayi={user.role.canOverrideKatsayi}
        priceHistoryBatch={priceHistoryBatch}
        onItemUpdate={handleItemUpdate}
        onItemDelete={handleItemDelete}
        onItemDuplicate={handleItemDuplicate}
        onReorder={handleReorder}
        onDiscountPctChange={handleDiscountPctChange}
        onAddProduct={() => setCatalogOpen(true)}
        onAddHeader={handleAddHeader}
        onAddNote={handleAddNote}
        onAddCustomItem={handleAddCustomItem}
        onAddSubtotal={handleAddSubtotal}
        onAddSubItem={handleAddSubItem}
        onCreateSet={handleCreateSet}
        onOpenEkMaliyet={() => setEkMaliyetOpen(true)}
        onShowPriceHistory={handleShowPriceHistory}
      />

      {/* Price History Slide-over */}
      {priceHistoryProductId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setPriceHistoryProductId(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-primary-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary-900">Fiyat Gecmisi</h3>
              <button
                type="button"
                onClick={() => setPriceHistoryProductId(null)}
                className="text-primary-500 hover:text-primary-700 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <PriceHistory
                productId={priceHistoryProductId}
                currency={headerFields.currency}
                onApplyPrice={(unitPrice, katsayi) =>
                  handleApplyPrice(priceHistoryProductId, unitPrice, katsayi)
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Commercial terms section (collapsible) */}
      <CommercialTermsSection
        ref={commercialTermsRef}
        quoteId={quoteId}
        initialTerms={quote.commercialTerms?.map((t) => ({
          id: t.id,
          category: t.category,
          value: t.value,
          sortOrder: Number(t.sortOrder),
          highlight: t.highlight,
        }))}
        onTermsChange={() => setHasChanges(true)}
      />

      {/* Product catalog slide-over panel */}
      <ProductCatalogPanel
        isOpen={catalogOpen}
        onClose={() => { setCatalogOpen(false); setSubItemParentId(null); setSetCreationMode(false); }}
        companyId={quote.company.id}
        quoteLanguage={headerFields.language}
        onAddProduct={handleAddProduct}
        title={setCreationMode ? 'Set Oluştur - Ürün Seç' : subItemParentId ? 'Alt Kalem Ekle' : undefined}
      />

      {/* Ek Maliyet Modal */}
      <EkMaliyetModal
        isOpen={ekMaliyetOpen}
        onClose={() => setEkMaliyetOpen(false)}
        quoteId={quoteId}
        currency={headerFields.currency}
        exchangeRate={(() => {
          if (headerFields.currency === 'TRY') return 1;
          const rawRate = exchangeRates[headerFields.currency]?.['TRY'] || Number(headerFields.exchangeRate);
          const pk = [headerFields.currency, 'TRY'].sort().join('/');
          const protPct = headerFields.protectionMap[pk] ?? 0;
          return rawRate * (1 + protPct / 100);
        })()}
        onApply={handleEkMaliyetApply}
      />

    </div>
  );
}
