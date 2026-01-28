'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { QuoteEditorHeader } from '@/components/quotes/QuoteEditorHeader';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { ProductCatalogPanel } from '@/components/quotes/ProductCatalogPanel';
import { ServiceCostSection } from '@/components/quotes/ServiceCostSection';
import { CommercialTermsSection } from '@/components/quotes/CommercialTermsSection';
import type { QuoteItemData } from '@/components/quotes/QuoteItemRow';
import type { ProductForQuote } from '@/components/quotes/ProductSearchCard';

// ── Legacy re-export for backward compatibility with edit/QuoteItemRow.tsx ──
export type { QuoteItemData as QuoteItem } from '@/components/quotes/QuoteItemRow';

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
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapApiItemToLocal(item: any): QuoteItemData {
  return {
    id: item.id,
    productId: item.productId ?? null,
    itemType: item.itemType,
    sortOrder: Number(item.sortOrder),
    code: item.code ?? null,
    brand: item.brand ?? null,
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
  });
  const savedHeaderRef = useRef<HeaderFields | null>(null);

  // Items dirty tracking for reorder/bulk update
  const itemsDirtyRef = useRef(false);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      fields.notes !== saved.notes
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

  const serviceItems = items
    .filter((item) => item.itemType === 'SERVICE')
    .map((item) => ({
      id: item.id,
      description: item.description,
      totalPrice: item.totalPrice,
      serviceMeta: item.serviceMeta,
    }));

  const nonServiceItems = items.filter((item) => item.itemType !== 'SERVICE');

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
            validityDays: headerFields.validityDays,
            discountPct: headerFields.discountPct,
            notes: headerFields.notes,
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
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          listPrice: item.listPrice,
          katsayi: item.katsayi,
          discountPct: item.discountPct,
          vatRate: item.vatRate,
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

      // 3. Reset change tracking
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
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          listPrice: item.listPrice,
          katsayi: item.katsayi,
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
    isEditable && !hasChanges ? handleSubmitForApproval : undefined;

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
        projectName={quote.project?.name ?? null}
        systemBrand={headerFields.subject}
        date={new Date(quote.createdAt).toLocaleDateString('tr-TR')}
        currency={headerFields.currency}
        exchangeRate={headerFields.exchangeRate}
        protectionPct={headerFields.protectionPct}
        language={headerFields.language}
        validityDays={headerFields.validityDays}
        hasChanges={hasChanges}
        isSaving={isSaving}
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
        items={nonServiceItems}
        currency={headerFields.currency}
        discountPct={headerFields.discountPct}
        canViewCosts={user.role.canViewCosts}
        onItemUpdate={handleItemUpdate}
        onItemDelete={handleItemDelete}
        onItemDuplicate={handleItemDuplicate}
        onReorder={handleReorder}
        onDiscountPctChange={handleDiscountPctChange}
        onAddProduct={() => setCatalogOpen(true)}
        onAddHeader={handleAddHeader}
        onAddNote={handleAddNote}
      />

      {/* Service cost section (collapsible) */}
      <ServiceCostSection
        quoteId={quoteId}
        serviceItems={serviceItems}
        currency={headerFields.currency}
        onServiceAdded={handleServiceAdded}
        onServiceDeleted={handleServiceDeleted}
      />

      {/* Commercial terms section (collapsible) */}
      <CommercialTermsSection
        quoteId={quoteId}
        initialTerms={quote.commercialTerms?.map((t: any) => ({
          id: t.id,
          category: t.category,
          value: t.value,
          sortOrder: Number(t.sortOrder),
        }))}
      />

      {/* Product catalog slide-over panel */}
      <ProductCatalogPanel
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        companyId={quote.company.id}
        quoteLanguage={headerFields.language}
        onAddProduct={handleAddProduct}
      />
    </div>
  );
}
