'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { QuoteEditorHeader } from '@/components/quotes/QuoteEditorHeader';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { ProductCatalogPanel } from '@/components/quotes/ProductCatalogPanel';
import { ServiceCostCalculator } from '@/components/quotes/ServiceCostCalculator';
import { CommercialTermsSection, type CommercialTermsSectionHandle } from '@/components/quotes/CommercialTermsSection';
import type { QuoteItemData, PriceHistoryStats } from '@/components/quotes/QuoteItemRow';
import type { ProductForQuote } from '@/components/quotes/ProductSearchCard';
import type { SectionTemplate } from '@/components/quotes/SectionTemplateDropdown';
import { PriceHistory } from './PriceHistory';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// ── Types ────────────────────────────────────────────────────────────────────

interface QuoteData {
  id: string;
  quoteNumber: string;
  status: string;
  currency: string;
  exchangeRate: number | string;
  protectionPct: number | string;
  discountPct: number | string;
  validityDays: number;
  notes: string | null;
  language: string;
  subject: string | null;
  createdAt: string;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string };
  items: any[];
  commercialTerms: any[];
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
  subject: string;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
  language: string;
  validityDays: number;
  discountPct: number;
  notes: string;
  projectId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapApiItemToLocal(item: any): QuoteItemData {
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
    serviceMeta: item.serviceMeta ?? undefined,
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
  const [serviceCalculatorOpen, setServiceCalculatorOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Header fields tracked for change detection
  const [headerFields, setHeaderFields] = useState<HeaderFields>({
    subject: '',
    currency: 'EUR',
    exchangeRate: 1,
    protectionPct: 0,
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

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [quoteRes, sessionRes] = await Promise.all([
        fetch(`/api/quotes/${quoteId}`),
        fetch('/api/auth/me'),
      ]);

      if (!quoteRes.ok) {
        throw new Error('Teklif yüklenirken bir hata oluştu');
      }
      if (!sessionRes.ok) {
        throw new Error('Oturum bilgisi alınamadı');
      }

      const quoteData = await quoteRes.json();
      const sessionData = await sessionRes.json();

      const q: QuoteData = quoteData.quote;
      setQuote(q);

      // Map items with Decimal -> number conversion
      const mappedItems = (q.items || []).map(mapApiItemToLocal);
      setItems(mappedItems);

      // Set user session
      setUser(sessionData.user);

      // Initialize header fields
      const hf: HeaderFields = {
        subject: q.subject || '',
        currency: q.currency,
        exchangeRate: Number(q.exchangeRate),
        protectionPct: Number(q.protectionPct),
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
      fields.subject !== saved.subject ||
      fields.currency !== saved.currency ||
      fields.exchangeRate !== saved.exchangeRate ||
      fields.protectionPct !== saved.protectionPct ||
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
    ? quote.status === 'TASLAK' || quote.status === 'REVIZYON'
    : false;

  // All items go into the unified table (no service split)
  const topLevelItems = items.filter((item) => !item.parentItemId);

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
            subject: headerFields.subject,
            currency: headerFields.currency,
            exchangeRate: headerFields.exchangeRate,
            protectionPct: headerFields.protectionPct,
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
            setItems(itemsData.items.map(mapApiItemToLocal));
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

  // ── Item operations ────────────────────────────────────────────────────────

  const handleItemUpdate = useCallback(
    (itemId: string, updates: Partial<QuoteItemData>) => {
      setItems((prev) =>
        prev.map((item) => {
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

            // Only recalculate unitPrice if not manually priced
            if (
              !updated.isManualPrice &&
              ('listPrice' in updates || 'katsayi' in updates)
            ) {
              updated.unitPrice = listPrice * katsayi;
            }

            updated.totalPrice =
              quantity * updated.unitPrice * (1 - discPct / 100);
          }

          return updated;
        })
      );

      itemsDirtyRef.current = true;
      setHasChanges(true);
    },
    []
  );

  const handleItemDelete = useCallback(
    async (itemId: string) => {
      // Optimistic removal
      setItems((prev) => prev.filter((item) => item.id !== itemId));

      // Fire and forget API call
      fetch(`/api/quotes/${quoteId}/items/${itemId}`, {
        method: 'DELETE',
      }).catch((err) => {
        console.error('Item delete error:', err);
      });
    },
    [quoteId]
  );

  const handleItemDuplicate = useCallback(
    async (itemId: string) => {
      const original = items.find((item) => item.id === itemId);
      if (!original) return;

      const tempId = crypto.randomUUID();
      const duplicated: QuoteItemData = {
        ...original,
        id: tempId,
        sortOrder: original.sortOrder + 1,
      };

      // Insert after original in local state
      setItems((prev) => {
        const index = prev.findIndex((item) => item.id === itemId);
        const next = [...prev];
        next.splice(index + 1, 0, duplicated);
        // Reassign sort orders
        return next.map((item, idx) => ({
          ...item,
          sortOrder: idx + 1,
        }));
      });

      // POST to API
      try {
        const res = await fetch(`/api/quotes/${quoteId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: duplicated.itemType,
            productId: duplicated.productId || undefined,
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
          // Replace temp ID with server-returned ID
          setItems((prev) =>
            prev.map((item) =>
              item.id === tempId ? mapApiItemToLocal(data.item) : item
            )
          );
        }
      } catch (err) {
        console.error('Item duplicate error:', err);
      }
    },
    [items, quoteId]
  );

  const handleReorder = useCallback(
    (reorderedItems: QuoteItemData[]) => {
      setItems(reorderedItems);
      itemsDirtyRef.current = true;
      setHasChanges(true);

      // Debounce persist
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
      }
      reorderTimerRef.current = setTimeout(async () => {
        const bulkItems = reorderedItems.map((item) => ({
          id: item.id,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          productId: item.productId,
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
      const tempId = crypto.randomUUID();
      const lang = headerFields.language;
      const unitPrice = product.listPrice * product.defaultKatsayi;

      const newItem: QuoteItemData = {
        id: tempId,
        productId: product.id,
        itemType: 'PRODUCT',
        sortOrder: items.length + 1,
        code: product.code,
        brand: product.brandName ?? null,
        model: product.model ?? null,
        description:
          lang === 'EN'
            ? product.nameEn || product.name
            : product.nameTr || product.name,
        quantity: 1,
        unit: product.unit,
        listPrice: product.listPrice,
        katsayi: product.defaultKatsayi,
        unitPrice,
        discountPct: 0,
        vatRate: 20,
        totalPrice: unitPrice, // qty=1, discount=0
        isManualPrice: product.pricingType === 'PROJECT_BASED',
        costPrice: product.costPrice ?? null,
      };

      // Add to local state
      setItems((prev) => [...prev, newItem]);

      // POST to API
      try {
        const res = await fetch(`/api/quotes/${quoteId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: 'PRODUCT',
            productId: product.id,
            code: product.code,
            brand: product.brandName || undefined,
            model: product.model || undefined,
            description: newItem.description,
            quantity: 1,
            unit: product.unit,
            listPrice: product.listPrice,
            katsayi: product.defaultKatsayi,
            discountPct: 0,
            vatRate: 20,
            notes: undefined,
            sortOrder: newItem.sortOrder,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Replace temp ID with server-returned ID
          setItems((prev) =>
            prev.map((item) =>
              item.id === tempId ? mapApiItemToLocal(data.item) : item
            )
          );
        }
      } catch (err) {
        console.error('Add product error:', err);
      }
    },
    [quoteId, headerFields.language, items.length]
  );

  // ── Add header row ─────────────────────────────────────────────────────────

  const handleAddHeader = useCallback(async () => {
    const tempId = crypto.randomUUID();
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
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? mapApiItemToLocal(data.item) : item
          )
        );
      }
    } catch (err) {
      console.error('Add header error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add note row ───────────────────────────────────────────────────────────

  const handleAddNote = useCallback(async () => {
    const tempId = crypto.randomUUID();
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
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? mapApiItemToLocal(data.item) : item
          )
        );
      }
    } catch (err) {
      console.error('Add note error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add custom item ──────────────────────────────────────────────────────

  const handleAddCustomItem = useCallback(async () => {
    const tempId = crypto.randomUUID();
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
      isManualPrice: true,
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
          isManualPrice: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? mapApiItemToLocal(data.item) : item
          )
        );
      }
    } catch (err) {
      console.error('Add custom item error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add subtotal row ────────────────────────────────────────────────────

  const handleAddSubtotal = useCallback(async () => {
    const tempId = crypto.randomUUID();
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
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? mapApiItemToLocal(data.item) : item
          )
        );
      }
    } catch (err) {
      console.error('Add subtotal error:', err);
    }
  }, [quoteId, items.length]);

  // ── Add section template ──────────────────────────────────────────────────

  const handleAddSectionTemplate = useCallback(async (template: SectionTemplate) => {
    const baseOrder = items.length + 1;

    const createItem = async (data: any) => {
      const res = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        return mapApiItemToLocal(result.item);
      }
      return null;
    };

    const newItems: QuoteItemData[] = [];

    switch (template) {
      case 'MUHENDISLIK_SET': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj S\u00FCperviz\u00F6rl\u00FC\u011F\u00FC, M\u00FChendislik, Test ve Devreye Alma \u00C7al\u0131\u015Fmalar\u0131',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        const parent = await createItem({
          itemType: 'SERVICE', description: 'Montaj S\u00FCperviz\u00F6rl\u00FC\u011F\u00FC, M\u00FChendislik, Test ve Devreye Alma \u00C7al\u0131\u015Fmalar\u0131',
          quantity: 1, unit: 'Set', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (parent) {
          newItems.push(parent);
          const sub1 = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'S\u00FCpervizyon Hizmeti', quantity: 1, unit: 'Ki\u015Fi/G\u00FCn',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
          });
          if (sub1) newItems.push(sub1);
          const sub2 = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'Test ve Devreye Alma Hizmeti', quantity: 1, unit: 'Ki\u015Fi/G\u00FCn',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 3,
          });
          if (sub2) newItems.push(sub2);
        }
        break;
      }
      case 'MUHENDISLIK_KISI_GUN': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj S\u00FCperviz\u00F6rl\u00FC\u011F\u00FC, M\u00FChendislik, Test ve Devreye Alma \u00C7al\u0131\u015Fmalar\u0131',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        const svc1 = await createItem({
          itemType: 'SERVICE', description: 'S\u00FCpervizyon Hizmeti',
          quantity: 1, unit: 'Ki\u015Fi/G\u00FCn', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (svc1) newItems.push(svc1);
        const svc2 = await createItem({
          itemType: 'SERVICE', description: 'Test ve Devreye Alma Hizmeti',
          quantity: 1, unit: 'Ki\u015Fi/G\u00FCn', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
        });
        if (svc2) newItems.push(svc2);
        break;
      }
      case 'MONTAJ_PER_ITEM': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj ve \u0130\u015F\u00E7ilik',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        break;
      }
      case 'MONTAJ_TEMINI_VE_MONTAJI': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Montaj ve \u0130\u015F\u00E7ilik (Temini ve Montaj\u0131)',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        break;
      }
      case 'GRAFIK_IZLEME': {
        const header = await createItem({
          itemType: 'HEADER', description: 'Grafik \u0130zleme Yaz\u0131l\u0131m \u00C7al\u0131\u015Fmalar\u0131',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder,
        });
        if (header) newItems.push(header);
        const parent = await createItem({
          itemType: 'SERVICE', description: 'Grafik \u0130zleme Yaz\u0131l\u0131m \u00C7al\u0131\u015Fmalar\u0131',
          quantity: 1, unit: 'Set', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 20,
          isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 1,
        });
        if (parent) {
          newItems.push(parent);
          const sub = await createItem({
            itemType: 'SERVICE', parentItemId: parent.id,
            description: 'Test ve Devreye Alma Hizmeti (Ofis)', quantity: 1, unit: 'Ki\u015Fi/G\u00FCn',
            listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0,
            isManualPrice: true, unitPrice: 0, totalPrice: 0, sortOrder: baseOrder + 2,
          });
          if (sub) newItems.push(sub);
        }
        const note = await createItem({
          itemType: 'NOTE',
          description: '\u00C7al\u0131\u015Fma yap\u0131lmas\u0131 i\u00E7in mimari projelerde mahal bilgilerinin tamam\u0131 sa\u011Flanm\u0131\u015F olmal\u0131, zone bilgisinin harita \u00FCzerinde i\u015Faretli olarak iletilmesi, zone isimleri iletilmesi gereklidir.',
          quantity: 0, unit: 'Adet', listPrice: 0, katsayi: 1, discountPct: 0, vatRate: 0, sortOrder: baseOrder + 3,
        });
        if (note) newItems.push(note);
        break;
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
    }
  }, [quoteId, items.length]);

  // ── Price history ─────────────────────────────────────────────────────────

  // ── Batch price history for inline columns ──────────────────────────────
  const [priceHistoryBatch, setPriceHistoryBatch] = useState<Record<string, PriceHistoryStats>>({});

  useEffect(() => {
    if (!quote || !user?.role.canViewCosts) return;

    const productIds = items
      .filter((i) => i.productId && i.itemType === 'PRODUCT')
      .map((i) => i.productId!)
      .filter((v, i, a) => a.indexOf(v) === i);

    if (productIds.length === 0) return;

    const fetchBatchHistory = async () => {
      try {
        const params = new URLSearchParams({
          companyId: quote.company.id,
          productIds: productIds.join(','),
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
    // Only re-fetch when quote company or item productIds change (not on every item edit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.company.id, user?.role.canViewCosts, items.length]);

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

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    window.open(`/api/quotes/${quoteId}/export/excel`, '_blank');
  }, [quoteId]);

  // ── Service item handlers ──────────────────────────────────────────────────

  const handleServiceAdded = useCallback((item: any) => {
    const mapped = mapApiItemToLocal(item);
    setItems((prev) => [...prev, mapped]);
  }, []);

  const handleServiceDeleted = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

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

  const canSubmitForApproval =
    isEditable && !hasChanges && user.role.canApprove ? handleSubmitForApproval : undefined;

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
        systemBrand={headerFields.subject}
        date={new Date(quote.createdAt).toLocaleDateString('tr-TR')}
        currency={headerFields.currency}
        exchangeRate={headerFields.exchangeRate}
        protectionPct={headerFields.protectionPct}
        language={headerFields.language}
        validityDays={headerFields.validityDays}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onProjectChange={(v) => updateHeaderField('projectId', v)}
        onSystemBrandChange={(v) => updateHeaderField('subject', v)}
        onCurrencyChange={(v) => updateHeaderField('currency', v)}
        onExchangeRateChange={(v) => updateHeaderField('exchangeRate', v)}
        onProtectionPctChange={(v) => updateHeaderField('protectionPct', v)}
        onLanguageChange={(v) => updateHeaderField('language', v)}
        onValidityDaysChange={(v) => updateHeaderField('validityDays', v)}
        onSave={handleSave}
        onSubmitForApproval={canSubmitForApproval}
        onExport={canExport}
      />

      {/* Items table */}
      <QuoteItemsTable
        items={topLevelItems}
        allItems={items}
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
        onAddService={() => setServiceCalculatorOpen(true)}
        onAddSectionTemplate={handleAddSectionTemplate}
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
        initialTerms={quote.commercialTerms?.map((t: any) => ({
          id: t.id,
          category: t.category,
          value: t.value,
          sortOrder: Number(t.sortOrder),
        }))}
        onTermsChange={() => setHasChanges(true)}
      />

      {/* Product catalog slide-over panel */}
      <ProductCatalogPanel
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        companyId={quote.company.id}
        quoteLanguage={headerFields.language}
        onAddProduct={handleAddProduct}
      />

      {/* Service cost calculator modal */}
      {serviceCalculatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setServiceCalculatorOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <ServiceCostCalculator
              quoteId={quoteId}
              onServiceAdded={(item) => {
                handleServiceAdded(item);
                setServiceCalculatorOpen(false);
              }}
              onClose={() => setServiceCalculatorOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
