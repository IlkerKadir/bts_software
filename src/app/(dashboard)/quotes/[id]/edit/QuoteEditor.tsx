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
import { useSettings } from '@/components/settings/SettingsProvider';
import { roundUnitPrice, computeRowTotal, round2 } from '@/lib/quote-rounding';
import { buildRateMatrix, maxRateDriftPct, type TcmbDirectRate } from '@/lib/services/tcmb-service';
import { reconvertEkMaliyetTotal, type EkMaliyetEntryLike } from '@/lib/ek-maliyet-reconvert';
import { isRateSensitiveRow } from '@/lib/quote-item-classification';
import { RateDriftBanner } from '@/components/quotes/RateDriftBanner';
import { RateUpdateDialog } from '@/components/quotes/RateUpdateDialog';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
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
  /** Frozen rate matrix at last explicit rating. Null on quotes
   *  created before this field existed. */
  rateSnapshot?: Record<string, Record<string, number>> | null;
  discountPct: number | string;
  /** cuid of the SUBTOTAL item the discount is scoped to, or null for
   *  "apply to whole quote" (legacy behavior). */
  discountScopeSubtotalId?: string | null;
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
  tcmbRateType: 'forexSelling' | 'banknoteSelling';
  language: string;
  validityDays: number;
  notes: string;
  projectId: string | null;
}

/**
 * Minimum absolute rate-drift percentage (max pair) required to
 * trigger the reopen drift banner. 0.5% sits above TCMB spread
 * noise and typical intraday jitter while still catching meaningful
 * overnight FX moves. Module-scope so it isn't re-created on every
 * render.
 */
const DRIFT_THRESHOLD_PCT = 0.5;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recalculate a SET parent's totals from its children.
 * unitPrice = sum of children's (already-rounded) totalPrice — SET has
 * no own base price, sub-items determine the price. Children link via
 * parentItemId.
 *
 * SET parent unit prices are NOT re-rounded through roundUnitPrice: the
 * sum of child rounded totals is already post-rounding, and ceiling-
 * rounding the sum again would make the parent total diverge from the
 * visible sum of its children. totalPrice is still round2'd so the
 * display is clean to the penny.
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
    const unitPrice = round2(childrenTotal);
    return {
      ...item,
      unitPrice,
      totalPrice: round2(qty * unitPrice * (1 - disc / 100)),
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
    priceLabel: item.priceLabel ?? null,
    isManualPrice: item.isManualPrice ?? false,
    costPrice: item.costPrice != null ? Number(item.costPrice) : null,
    productCurrency: item.product?.currency ?? null,
    productListPrice: item.product?.listPrice != null ? Number(item.product.listPrice) : null,
    productCostPrice: item.product?.costPrice != null ? Number(item.product.costPrice) : null,
    minKatsayi: item.product?.minKatsayi != null ? Number(item.product.minKatsayi) : null,
    maxKatsayi: item.product?.maxKatsayi != null ? Number(item.product.maxKatsayi) : null,
    subRows: item.subRows?.map(mapApiItemToLocal) ?? undefined,
    customPozNo: (item.serviceMeta as Record<string, unknown> | null)?.customPozNo as string | null ?? null,
    highlight: ((item.serviceMeta as Record<string, unknown> | null)?.highlight as boolean | undefined) ?? false,
    ekMaliyetDelta: item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : null,
    currency: item.currency ?? null,
    sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
    sectionDiscountLabel: item.sectionDiscountLabel ?? null,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface QuoteEditorProps {
  quoteId: string;
}

export function QuoteEditor({ quoteId }: QuoteEditorProps) {
  const router = useRouter();
  const { quoteDefaults } = useSettings();
  const defaultVatRate = quoteDefaults.defaultVatRate;

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
    tcmbRateType: 'forexSelling',
    language: 'TR',
    validityDays: 30,
    notes: '',
    projectId: null,
  });
  const savedHeaderRef = useRef<HeaderFields | null>(null);

  // Items dirty tracking for reorder/bulk update
  const itemsDirtyRef = useRef(false);
  // Holds a pending rate-matrix snapshot to persist on the next save.
  // Set whenever the user clicks Uygula in the exchange rate modal (or
  // the Phase 4 Kurları Güncelle dialog). Read by handleSave, then
  // cleared. Null means "nothing to persist for rateSnapshot".
  const pendingRateSnapshotRef = useRef<Record<string, Record<string, number>> | null>(null);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commercialTermsRef = useRef<CommercialTermsSectionHandle>(null);

  // Guard to prevent infinite re-render loop in the auto-recalculate effect
  const isRecalculating = useRef(false);

  // Exchange rate matrix for currency conversion (fromCurrency -> toCurrency -> rate).
  //
  // `exchangeRates` is the matrix that drives the editor's live math —
  // it's sourced from `quote.rateSnapshot` when present so the quote
  // stays internally consistent on reopen. New items added during this
  // session use the same rates as items already in the quote.
  //
  // `liveExchangeRates` is today's fresh-from-TCMB matrix, fetched in
  // parallel on mount. It's used only by the drift-detection banner
  // (Phase 5) and the Kurları Güncelle preview dialog (Phase 4) — it
  // never touches item math directly.
  const [exchangeRates, setExchangeRates] = useState<Record<string, Record<string, number>>>({});
  const [liveExchangeRates, setLiveExchangeRates] = useState<Record<string, Record<string, number>>>({});

  // Rate-drift banner / Kurları Güncelle dialog state.
  //
  // `rateBannerDismissed` hides the banner for this editor session
  // only (no persistence) — on next reopen, drift is re-evaluated
  // against fresh TCMB. `rateDialogOpen` controls the preview
  // dialog. `rateDialogApplying` disables the Uygula button while
  // `applyRateMatrix` runs its async pipeline.
  const [rateBannerDismissed, setRateBannerDismissed] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateDialogApplying, setRateDialogApplying] = useState(false);
  // Error surfaced inline inside RateUpdateDialog — separate from
  // the page-level `error` state which is hidden behind the modal
  // backdrop while the dialog is open.
  const [rateDialogError, setRateDialogError] = useState<string | null>(null);
  // Ek maliyet counts used by the dialog's "affected vs unaffected"
  // summary. Fetched lazily when the dialog opens so we don't pay
  // for it on every editor mount.
  const [ekMaliyetStampedCount, setEkMaliyetStampedCount] = useState<number | null>(null);
  const [ekMaliyetLegacyCount, setEkMaliyetLegacyCount] = useState<number>(0);

  // Companies list for the header's company dropdown. Populated once on
  // mount; the dropdown lets the user fix a wrong-company selection
  // without recreating the quote (revision item #2).
  const [availableCompanies, setAvailableCompanies] = useState<{ id: string; name: string }[]>([]);
  const [isChangingCompany, setIsChangingCompany] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [quoteRes, sessionRes, ratesRes, tcmbRes] = await Promise.all([
        fetch(`/api/quotes/${quoteId}`),
        fetch('/api/auth/me'),
        fetch('/api/exchange-rates?latestOnly=true'),
        fetch('/api/exchange-rates/tcmb'),
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

      // Map items with Decimal -> number conversion, flatten nested subRows
      const mappedItems = (q.items || []).map(mapApiItemToLocal);
      const flatItems = flattenSubRows(mappedItems);
      setItems(flatItems);

      // Set user session
      setUser(sessionData.user);

      // Extract persisted meta fields from the protection map JSON
      const rawMap = (q.protectionMap && typeof q.protectionMap === 'object') ? q.protectionMap as Record<string, unknown> : {};
      const savedRateType = rawMap.__rateType === 'banknoteSelling' ? 'banknoteSelling' as const : 'forexSelling' as const;
      const { __rateType: _rt, __discountLabel: _dl, ...cleanMap } = rawMap;

      // Build exchange rate matrices. Two matrices matter here:
      //
      //   1. `exchangeRates`  — the matrix that drives the editor's
      //      math (new items, recalc, TL conversion). Sourced from
      //      the quote's `rateSnapshot` when present so reopening a
      //      quote preserves its internal consistency. If the snapshot
      //      is null (legacy quote) we fall back to fresh TCMB, then
      //      to DB rates.
      //
      //   2. `liveExchangeRates` — today's fresh-from-TCMB matrix,
      //      always populated if TCMB is reachable. Used only by the
      //      Phase 4/5 Kurları Güncelle flow for drift detection and
      //      preview; never touches item math.
      let liveMatrix: Record<string, Record<string, number>> | null = null;
      let tcmbFreshRates: TcmbDirectRate[] | null = null;
      if (tcmbRes.ok) {
        const tcmbData = await tcmbRes.json();
        tcmbFreshRates = (tcmbData.rates || []) as TcmbDirectRate[];
        if (tcmbFreshRates.length > 0) {
          liveMatrix = buildRateMatrix(tcmbFreshRates, savedRateType);
          setLiveExchangeRates(liveMatrix);
        }
      }

      // Prefer the quote's frozen snapshot when present.
      const snapshot = q.rateSnapshot && typeof q.rateSnapshot === 'object'
        ? (q.rateSnapshot as Record<string, Record<string, number>>)
        : null;

      if (snapshot && Object.keys(snapshot).length > 0) {
        setExchangeRates(snapshot);
      } else if (liveMatrix) {
        // Legacy quote without a stored snapshot — use today's rates.
        setExchangeRates(liveMatrix);
      } else if (ratesRes.ok) {
        // Last-resort fallback: DB-stored rates table.
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
      const hf: HeaderFields = {
        refNo: q.refNo || '',
        subject: q.subject || '',
        description: q.description || '',
        currency: q.currency,
        exchangeRate: Number(q.exchangeRate),
        protectionPct: Number(q.protectionPct),
        protectionMap: cleanMap as Record<string, number>,
        tcmbRateType: savedRateType,
        language: q.language,
        validityDays: q.validityDays,
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

  // Companies for the in-editor company-change dropdown. One-shot fetch
  // on mount; the list rarely changes during a single edit session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/companies?limit=500');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAvailableCompanies(
            (data.companies ?? []).map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            }))
          );
        }
      } catch {
        // Silent — the company chip will just show the current value
        // without an editable dropdown if the fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fix a wrong-company selection without recreating the quote. We hit
  // the existing PUT /api/quotes/[id] route — the server auto-clears
  // projectId when the project's client doesn't match the new company,
  // so the user has to re-pick a project after the change.
  const handleCompanyChange = useCallback(
    async (newCompanyId: string) => {
      if (!quote || newCompanyId === quote.company.id) return;
      const target = availableCompanies.find((c) => c.id === newCompanyId);
      if (!target) return;
      if (!window.confirm(`"${target.name}" firmasına geçilecek. Devam edilsin mi?`)) return;

      setIsChangingCompany(true);
      try {
        const res = await fetch(`/api/quotes/${quoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: newCompanyId }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Firma değiştirilemedi');
          return;
        }
        const data = await res.json();
        const updated = data.quote;
        setQuote((prev) =>
          prev
            ? {
                ...prev,
                company: { id: updated.company.id, name: updated.company.name },
                project: updated.project
                  ? { id: updated.project.id, name: updated.project.name }
                  : null,
              }
            : prev
        );
        setHeaderFields((prev) => ({
          ...prev,
          projectId: updated.project?.id ?? null,
        }));
      } catch (err) {
        console.error('Company change error:', err);
        alert('Firma değiştirilirken bir hata oluştu');
      } finally {
        setIsChangingCompany(false);
      }
    },
    [quote, quoteId, availableCompanies, headerFields.projectId]
  );

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
      fields.tcmbRateType !== saved.tcmbRateType ||
      fields.language !== saved.language ||
      fields.validityDays !== saved.validityDays ||
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

  // Returns true when the quote was persisted cleanly, false when any
  // step failed. Callers chain on this to block exports (PDF preview,
  // Excel download) until the DB matches the editor's live state.
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!quote) return false;
    setIsSaving(true);
    setError(null);

    try {
      // 1. Save header fields if changed (or if rateSnapshot is pending).
      //    The header PUT fires whenever anything stored on the Quote
      //    row has changed, including a new rateSnapshot pushed by the
      //    exchange-rate modal's Uygula button.
      const headerDirty = checkHeaderChanges(headerFields);
      const pendingSnapshot = pendingRateSnapshotRef.current;
      if (headerDirty || pendingSnapshot) {
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
            protectionMap: { ...headerFields.protectionMap, __rateType: headerFields.tcmbRateType },
            language: headerFields.language,
            validityDays: headerFields.validityDays,
            notes: headerFields.notes,
            projectId: headerFields.projectId,
            // Only include rateSnapshot when we have a fresh one queued
            // — leaving the key absent preserves whatever's in the DB.
            ...(pendingSnapshot ? { rateSnapshot: pendingSnapshot } : {}),
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
        // Snapshot successfully persisted — clear the pending ref,
        // but only if the user hasn't queued a newer snapshot while
        // this PUT was in flight (double-Uygula race). Clearing only
        // when the ref still holds the same reference we sent keeps
        // a fresher snapshot alive for the next save.
        if (pendingSnapshot && pendingRateSnapshotRef.current === pendingSnapshot) {
          pendingRateSnapshotRef.current = null;
        }
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
          ekMaliyetDelta: item.ekMaliyetDelta ?? null,
          notes: item.notes || '',
          priceLabel: item.priceLabel ?? null,
          serviceMeta: (item.customPozNo || item.highlight)
            ? {
                ...(item.customPozNo ? { customPozNo: item.customPozNo } : {}),
                ...(item.highlight ? { highlight: true } : {}),
              }
            : null,
          sectionDiscountPct: item.sectionDiscountPct ?? null,
          sectionDiscountLabel: item.sectionDiscountLabel ?? null,
          // Per-SET currency override — only set on top-level SET rows.
          // Sending it always (null for non-SET rows) lets the API reset
          // stray values when a row changes type.
          currency: item.itemType === 'SET' && !item.parentItemId
            ? (item.currency ?? null)
            : null,
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
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Kaydetme sırasında bir hata oluştu'
      );
      return false;
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
              // Include ek maliyet delta so the distribution is preserved,
              // then tier-round per BTS's invoicing rule so the displayed
              // unit price matches the value used in totalPrice / subtotal.
              const ekDelta = updated.ekMaliyetDelta != null ? Number(updated.ekMaliyetDelta) : 0;
              updated.unitPrice = roundUnitPrice(
                (Number(listPrice) + ekDelta) * Number(katsayi)
              );
            }
            // For manual-price items (e.g. TAŞERON), if only katsayi changed,
            // the unit price is user-set — we don't recalculate. The delta is
            // already baked into the unit price from handleEkMaliyetApply.

            updated.totalPrice = computeRowTotal({
              quantity: Number(quantity),
              unitPrice: Number(updated.unitPrice),
              discountPct: Number(discPct),
            });
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

  const handleSectionDiscountPctChange = useCallback((subtotalItemId: string, pct: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === subtotalItemId && it.itemType === 'SUBTOTAL'
          ? { ...it, sectionDiscountPct: Math.min(100, Math.max(0, pct)) }
          : it
      )
    );
    itemsDirtyRef.current = true;
    setHasChanges(true);
  }, []);

  const handleSectionDiscountLabelChange = useCallback((subtotalItemId: string, label: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === subtotalItemId && it.itemType === 'SUBTOTAL'
          ? { ...it, sectionDiscountLabel: label.length > 0 ? label : null }
          : it
      )
    );
    itemsDirtyRef.current = true;
    setHasChanges(true);
  }, []);

  // ── Add product from catalog ───────────────────────────────────────────────

  const handleAddProduct = useCallback(
    async (product: ProductForQuote, quantity?: number) => {
      const tempId = generateId();
      const lang = headerFields.language;
      const quoteCurrency = headerFields.currency;
      const productCurrency = product.currency;
      const isSubItem = !!subItemParentId;

      // When the new row is a sub-item of a SET with a per-SET
      // currency override, prices must be converted into the SET's
      // currency instead of the quote's — otherwise a TRY-based SET in
      // an EUR quote would end up with EUR-valued children rendered
      // as TRY. For top-level rows we still target the quote currency.
      let targetCurrency = quoteCurrency;
      let isSetOverride = false;
      if (isSubItem) {
        const parentSet = items.find((i) => i.id === subItemParentId);
        if (parentSet && parentSet.itemType === 'SET' && parentSet.currency) {
          targetCurrency = parentSet.currency;
          isSetOverride = true;
        }
      }

      // Currency conversion: convert product price to target currency
      let convertedListPrice = product.listPrice;
      let convertedCostPrice = product.costPrice ?? null;

      if (productCurrency !== targetCurrency) {
        // Convert product price to target currency using raw TCMB rates.
        // Then apply per-pair protection on top of the converted price —
        // EXCEPT when the target is a SET's currency override. The
        // whole point of a SET override is "no FX protection applies",
        // and the grand-total math elsewhere divides by the
        // non-protected rate; applying protection here would make the
        // round-trip numbers disagree.
        const pk = [productCurrency, targetCurrency].sort().join('/');
        const protectionPct = isSetOverride ? 0 : (headerFields.protectionMap[pk] ?? 0);

        // Find raw conversion rate: productCurrency → targetCurrency
        let rate = exchangeRates[productCurrency]?.[targetCurrency];
        if (!rate) {
          // Try reverse: targetCurrency → productCurrency, then invert
          const reverseRate = exchangeRates[targetCurrency]?.[productCurrency];
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
      // SET parents start with unitPrice=0 (price comes from children);
      // others use roundUnitPrice(listPrice * katsayi) so the stored
      // value matches the displayed one from the first render.
      const unitPrice = setCreationMode
        ? 0
        : roundUnitPrice(convertedListPrice * defaultKatsayi);

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
        quantity: quantity || 1,
        unit: setCreationMode ? 'Set' : product.unit,
        listPrice: setCreationMode ? 0 : convertedListPrice,
        katsayi: defaultKatsayi,
        unitPrice,
        discountPct: 0,
        vatRate: isSubItem ? 0 : defaultVatRate,
        totalPrice: computeRowTotal({
          quantity: quantity || 1,
          unitPrice,
          discountPct: 0,
        }),
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
        quantity: quantity || 1,
        unit: newItem.unit,
        listPrice: convertedListPrice,
        katsayi: defaultKatsayi,
        discountPct: 0,
        vatRate: isSubItem ? 0 : defaultVatRate,
        sortOrder: newItem.sortOrder,
        costPrice: convertedCostPrice,
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
    [quoteId, headerFields.language, headerFields.currency, headerFields.protectionPct, headerFields.protectionMap, exchangeRates, items.length, subItemParentId, setCreationMode, defaultVatRate]
  );

  // ── Bulk delete + duplicate for the multi-row toolbar (#5) ───────────────
  // Both run a single confirm + a single state mutation so the user
  // doesn't see N modal prompts and so the per-row handlers' stale
  // closure over `items` doesn't bite when iterating a Set.

  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      // Drop any IDs whose parent is also being deleted — the cascade
      // handles them server-side and a direct DELETE would 404.
      const idSet = new Set(ids);
      const directIds = ids.filter((id) => {
        const it = items.find((x) => x.id === id);
        return !it?.parentItemId || !idSet.has(it.parentItemId);
      });

      const totalCount = ids.length;
      if (!window.confirm(`${totalCount} satır silinecek. Devam edilsin mi?`)) return;

      // Optimistic local removal — drop targets and any descendants.
      setItems((prev) =>
        prev.filter((it) => !idSet.has(it.id) && !(it.parentItemId && idSet.has(it.parentItemId)))
      );

      // Fire DELETEs in parallel. Failures aren't surfaced individually
      // — at this scale a refetch on the next save covers any drift.
      await Promise.allSettled(
        directIds.map((id) =>
          fetch(`/api/quotes/${quoteId}/items/${id}`, { method: 'DELETE' })
        )
      );
    },
    [items, quoteId]
  );

  const handleBulkDuplicate = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      // Iterate in items-array order (deterministic UX) rather than
      // Set-insertion order. Awaiting each call lets handleItemDuplicate
      // see fresh state; for ≤20 rows the latency is acceptable.
      const ordered = items.map((it) => it.id).filter((id) => ids.includes(id));
      for (const id of ordered) {
        await handleItemDuplicate(id);
      }
    },
    [items, handleItemDuplicate]
  );

  // ── Bulk-apply same katsayı value to many rows in one pass ───────────────
  // Mirrors handleItemUpdate's per-row recompute (unitPrice + totalPrice +
  // ekDelta handling), but does it inside a single setItems call instead of
  // N separate ones. Skips SET parents (price comes from children) and
  // manual-priced rows (user-set unitPrice is intentional). Marks dirty so
  // the existing auto-save persists.
  const handleBulkKatsayiApply = useCallback(
    (ids: string[], katsayi: number) => {
      if (!Number.isFinite(katsayi) || katsayi <= 0 || ids.length === 0) return;
      const idSet = new Set(ids);
      setItems((prev) =>
        prev.map((item) => {
          if (!idSet.has(item.id)) return item;
          const isSetParentItem = item.itemType === 'SET' && !item.parentItemId;
          const updated = { ...item, katsayi };
          if (!item.isManualPrice && !isSetParentItem) {
            const ekDelta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;
            updated.unitPrice = roundUnitPrice(
              (Number(item.listPrice) + ekDelta) * Number(katsayi)
            );
          }
          updated.totalPrice = computeRowTotal({
            quantity: Number(item.quantity),
            unitPrice: Number(updated.unitPrice),
            discountPct: Number(item.discountPct),
          });
          return updated;
        })
      );
      itemsDirtyRef.current = true;
      setHasChanges(true);
    },
    []
  );

  // ── Swap product on an existing row ───────────────────────────────────────
  // Right-click → "Ürün Değiştir" → catalog → pick replacement. Keeps the
  // user's quantity, katsayı, discount, VAT, sortOrder, highlight, and
  // custom poz label. Replaces product reference and re-derives prices
  // exactly as handleAddProduct would for a fresh add.
  const [swapTargetItemId, setSwapTargetItemId] = useState<string | null>(null);

  const handleSwapProduct = useCallback(
    async (product: ProductForQuote) => {
      const targetId = swapTargetItemId;
      if (!targetId) return;
      const existing = items.find((i) => i.id === targetId);
      if (!existing) {
        setSwapTargetItemId(null);
        return;
      }

      // Determine target currency: a sub-item inherits its parent SET's
      // override; a top-level row uses the quote currency.
      let targetCurrency = headerFields.currency;
      let isSetOverride = false;
      if (existing.parentItemId) {
        const parent = items.find((i) => i.id === existing.parentItemId);
        if (parent && parent.itemType === 'SET' && parent.currency) {
          targetCurrency = parent.currency;
          isSetOverride = true;
        }
      } else if (existing.itemType === 'SET' && existing.currency) {
        targetCurrency = existing.currency;
        isSetOverride = true;
      }

      // Convert the new product's price into the target currency. Mirrors
      // handleAddProduct's logic — see comments there for the protection
      // pct subtleties on SET currency overrides.
      let convertedListPrice = product.listPrice;
      let convertedCostPrice = product.costPrice ?? null;
      if (product.currency !== targetCurrency) {
        const pk = [product.currency, targetCurrency].sort().join('/');
        const protectionPct = isSetOverride ? 0 : (headerFields.protectionMap[pk] ?? 0);
        let rate = exchangeRates[product.currency]?.[targetCurrency];
        if (!rate) {
          const reverseRate = exchangeRates[targetCurrency]?.[product.currency];
          if (reverseRate && reverseRate !== 0) rate = 1 / reverseRate;
        }
        if (rate) {
          convertedListPrice = product.listPrice * rate * (1 + protectionPct / 100);
          if (convertedCostPrice != null) {
            convertedCostPrice = convertedCostPrice * rate * (1 + protectionPct / 100);
          }
        }
      }

      const lang = headerFields.language;
      const newDescription =
        lang === 'EN'
          ? product.nameEn || product.name
          : product.nameTr || product.name;

      // Recompute unit + total using the row's existing katsayi/qty/discount.
      // ekMaliyetDelta is intentionally preserved: it's a per-row distributed
      // cost set via the ek-maliyet sidebar, not derived from the product —
      // swapping the product doesn't invalidate the row's allocated share.
      const ekDelta = existing.ekMaliyetDelta ?? 0;
      const newUnitPrice = roundUnitPrice((convertedListPrice + ekDelta) * existing.katsayi);
      const newTotalPrice = computeRowTotal({
        quantity: existing.quantity,
        unitPrice: newUnitPrice,
        discountPct: existing.discountPct,
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id !== targetId
            ? it
            : {
                ...it,
                productId: product.id,
                code: product.code,
                brand: product.brandName ?? null,
                model: product.model ?? null,
                description: newDescription,
                listPrice: convertedListPrice,
                unitPrice: newUnitPrice,
                totalPrice: newTotalPrice,
                isManualPrice: product.pricingType === 'PROJECT_BASED',
                costPrice: convertedCostPrice,
                productCurrency: product.currency,
                productListPrice: product.listPrice,
                productCostPrice: product.costPrice ?? null,
                minKatsayi: product.minKatsayi ?? null,
                maxKatsayi: product.maxKatsayi ?? null,
              }
        )
      );

      itemsDirtyRef.current = true;
      setHasChanges(true);
      setSwapTargetItemId(null);
      setCatalogOpen(false);
    },
    [
      swapTargetItemId,
      items,
      headerFields.language,
      headerFields.currency,
      headerFields.protectionMap,
      exchangeRates,
    ]
  );

  const handleSwapProductRequest = useCallback((itemId: string) => {
    setSwapTargetItemId(itemId);
    setCatalogOpen(true);
  }, []);

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
      vatRate: defaultVatRate,
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
          vatRate: defaultVatRate,
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
  }, [quoteId, items.length, defaultVatRate]);

  // ── Add custom sub-item to a SET ─────────────────────────────────────────

  const handleAddCustomSubItem = useCallback(async (parentId: string) => {
    const tempId = generateId();
    // Insert after the last child of the parent SET
    const parentIdx = items.findIndex((i) => i.id === parentId);
    let insertIdx = parentIdx + 1;
    while (insertIdx < items.length && items[insertIdx].parentItemId === parentId) {
      insertIdx++;
    }

    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'CUSTOM',
      sortOrder: insertIdx,
      description: 'Serbest Kalem',
      quantity: 1,
      unit: 'Adet',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: defaultVatRate,
      totalPrice: 0,
      isManualPrice: false,
      parentItemId: parentId,
    };

    setItems((prev) => {
      const copy = [...prev];
      copy.splice(insertIdx, 0, newItem);
      return copy;
    });

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
          vatRate: defaultVatRate,
          discountPct: 0,
          sortOrder: insertIdx,
          isManualPrice: false,
          parentItemId: parentId,
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
      console.error('Add custom sub-item error:', err);
    }
  }, [quoteId, items, defaultVatRate]);

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

  // ── Add grand total row ────────────────────────────────────────────────
  // A single "GENEL TOPLAM" item appended at the end of the quote. Renders
  // in both the editor and the PDF/Excel exports as a total header that
  // displays the quote's persisted grandTotal. There can be only one per
  // quote — calling this when one already exists does nothing.

  const handleAddGrandTotal = useCallback(async () => {
    if (items.some((i) => i.itemType === 'GRAND_TOTAL')) return;
    const tempId = generateId();
    const sortOrder = items.length + 1;
    const newItem: QuoteItemData = {
      id: tempId,
      itemType: 'GRAND_TOTAL',
      sortOrder,
      description: 'GENEL TOPLAM',
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
          itemType: 'GRAND_TOTAL',
          description: 'GENEL TOPLAM',
          quantity: 0,
          unit: 'Adet',
          listPrice: 0,
          katsayi: 1,
          discountPct: 0,
          vatRate: 0,
          sortOrder,
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
      console.error('Add grand total error:', err);
    }
  }, [quoteId, items]);

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
          const rawUnitPrice = item.isManualPrice
            ? unitPrice
            : item.listPrice * katsayi;
          const newUnitPrice = roundUnitPrice(rawUnitPrice);
          const total = computeRowTotal({
            quantity: Number(item.quantity),
            unitPrice: newUnitPrice,
            discountPct: Number(item.discountPct),
          });
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

    const note = prompt('Düzenleme talebi notu:');
    if (!note || !note.trim()) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'TASLAK', note: note.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Düzenleme talebi gönderilemedi');
      }

      setQuote((prev) => (prev ? { ...prev, status: 'TASLAK' } : prev));
      setSuccessMessage('Düzenleme talebi gönderildi');

      setTimeout(() => {
        router.push(`/quotes/${quoteId}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Düzenleme talebi sırasında bir hata oluştu'
      );
    }
  }, [quote, quoteId, hasChanges, router]);

  // ── Export ─────────────────────────────────────────────────────────────────

  // Excel export auto-flushes any unsaved editor changes first so the
  // downloaded file reflects the on-screen state, not the last
  // persisted version.
  const handleExport = useCallback(async () => {
    if (hasChanges) {
      const ok = await handleSave();
      if (!ok) return;
    }
    window.open(`/api/quotes/${quoteId}/export/excel`, '_blank');
  }, [quoteId, hasChanges, handleSave]);

  // ── Create SET handler ─────────────────────────────────────────────────────

  const handleCreateSet = useCallback(() => {
    setSubItemParentId(null);
    setSetCreationMode(true);
    setCatalogOpen(true);
  }, []);

  // ── Exchange Rate Apply handler ────────────────────────────────────────────

  /** Recalculate all item prices for a given quote currency using the rate matrix + protection map */
  const recalcItemPrices = useCallback(
    (
      items: QuoteItemData[],
      quoteCurrency: string,
      protectionMap: Record<string, number>,
      rateMatrix: Record<string, Record<string, number>>,
    ): QuoteItemData[] => {
      // Pre-index top-level SETs with currency overrides so sub-rows
      // can look up their target currency in O(1) during the map.
      const setCurrencyByParentId = new Map<string, string>();
      for (const it of items) {
        if (it.itemType === 'SET' && !it.parentItemId && it.currency) {
          setCurrencyByParentId.set(it.id, it.currency);
        }
      }

      let result = items.map((item) => {
        // Skip rows the rate-update pipeline cannot derive: structural,
        // SET parents (rolled up separately below), manual-priced, and
        // items missing a product-level reference. The shared predicate
        // also drives RateUpdateDialog's "affected" count, so the two
        // stay in sync by construction.
        if (!isRateSensitiveRow(item)) return item;

        // Children of a mixed-currency SET target the SET's currency,
        // not the quote's — matches handleAddProduct so a TRY-set child
        // keeps its TRY prices through a rate refresh.
        const setOverrideCurrency = item.parentItemId
          ? setCurrencyByParentId.get(item.parentItemId)
          : undefined;
        const targetCurrency = setOverrideCurrency || quoteCurrency;
        const isSetOverride = !!setOverrideCurrency;

        // Ek maliyet delta is preserved as-is through currency changes.
        // It was applied in the previous quote currency; user can re-apply to
        // re-distribute in the new currency if needed.
        const ekDelta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;

        // Same currency → use original product price directly (no conversion)
        if (item.productCurrency === targetCurrency) {
          const newListPrice = item.productListPrice;
          const effectiveListPrice = newListPrice + ekDelta;
          const newUnitPrice = roundUnitPrice(effectiveListPrice * Number(item.katsayi));
          const newTotalPrice = computeRowTotal({
            quantity: Number(item.quantity),
            unitPrice: newUnitPrice,
            discountPct: Number(item.discountPct),
          });
          const newCostPrice = item.productCostPrice ?? null;
          return { ...item, listPrice: newListPrice, unitPrice: newUnitPrice, totalPrice: newTotalPrice, costPrice: newCostPrice };
        }

        // Different currency → convert using rate matrix + protection.
        // Suppress protection for SET-override children so their list
        // price round-trips through the grand-total conversion (which
        // divides by the non-protected base rate — applying protection
        // here would break the identity).
        const pk = [item.productCurrency, targetCurrency].sort().join('/');
        const protectionPct = isSetOverride ? 0 : (protectionMap[pk] ?? 0);

        let rate = rateMatrix[item.productCurrency]?.[targetCurrency];
        if (!rate) {
          const reverseRate = rateMatrix[targetCurrency]?.[item.productCurrency];
          if (reverseRate && reverseRate !== 0) rate = 1 / reverseRate;
        }
        if (!rate) return item;

        const newListPrice = item.productListPrice * rate * (1 + protectionPct / 100);
        const effectiveListPrice = newListPrice + ekDelta;
        const newUnitPrice = roundUnitPrice(effectiveListPrice * Number(item.katsayi));
        const newTotalPrice = computeRowTotal({
          quantity: Number(item.quantity),
          unitPrice: newUnitPrice,
          discountPct: Number(item.discountPct),
        });

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
    },
    []
  );

  // `applyRateMatrix` is declared after `handleEkMaliyetApply` below
  // to avoid a Temporal Dead Zone reference through its dep array.
  // We still need `handleExchangeRateApply` to be stable before the
  // exchange-rate modal uses it, so the actual implementation lives
  // in a ref captured after both dependencies are in scope.
  const exchangeRateApplyRef = useRef<
    | ((
        _newRate: number,
        _newProtectionPct: number,
        newProtectionMap: Record<string, number>,
        rateMatrix: Record<string, Record<string, number>>,
      ) => void)
    | null
  >(null);

  const handleExchangeRateApply = useCallback(
    (
      newRate: number,
      newProtectionPct: number,
      newProtectionMap: Record<string, number>,
      rateMatrix: Record<string, Record<string, number>>,
    ) => {
      exchangeRateApplyRef.current?.(newRate, newProtectionPct, newProtectionMap, rateMatrix);
    },
    []
  );

  // ── Currency Change handler (recalculates all item prices) ────────────────

  const handleCurrencyChange = useCallback(
    (newCurrency: string) => {
      const oldCurrency = headerFields.currency;
      if (newCurrency === oldCurrency) return;

      // Check if exchange rates are available for conversion
      const hasRates = Object.keys(exchangeRates).length > 0;
      if (!hasRates) {
        setError('Döviz kuru bulunamadı — önce Döviz Kuru Yönetimi\'ni açarak TCMB kurlarını güncelleyin.');
      }

      // Update the header field first
      updateHeaderField('currency', newCurrency);

      // Recalculate all item prices for the new currency
      setItems((prev) =>
        recalcItemPrices(prev, newCurrency, headerFields.protectionMap, exchangeRates)
      );

      // Update the exchange rate header field to the new currency's TRY rate
      const tryRate = exchangeRates[newCurrency]?.TRY;
      if (tryRate) {
        const protPct = headerFields.protectionMap[[newCurrency, 'TRY'].sort().join('/')] ?? 0;
        updateHeaderField('exchangeRate', tryRate * (1 + protPct / 100));
      }

      itemsDirtyRef.current = true;
      setHasChanges(true);
    },
    [headerFields.currency, headerFields.protectionMap, exchangeRates, updateHeaderField, recalcItemPrices]
  );

  // ── Ek Maliyet Apply handler ──────────────────────────────────────────────

  /**
   * Distribute ek maliyet across TAŞERON items.
   *
   * Architecture: the distributed per-unit amount is stored separately in each
   * item's `ekMaliyetDelta` field. The user's original `listPrice` and
   * `costPrice` are NEVER mutated — they remain as entered. The effective list
   * price displayed to the user is `listPrice + ekMaliyetDelta`, and the
   * effective cost price is `(costPrice ?? 0) + ekMaliyetDelta`.
   *
   * `unitPrice` and `totalPrice` ARE updated here (and persisted) because the
   * backend saves them as-is for manual-price items, and they need to reflect
   * the katsayi markup applied to the effective list price.
   *
   * Deletion sets totalAmount to 0 → ekMaliyetDelta becomes null/0 →
   * unitPrice & totalPrice revert automatically.
   */
  const handleEkMaliyetApply = useCallback((totalAmount: number) => {
    setItems(prev => {
      const taseronItems = prev.filter(i => i.brand === 'TAŞERON');
      const totalQty = taseronItems.reduce((s, i) => s + Number(i.quantity), 0);

      if (taseronItems.length === 0 || totalQty === 0) return prev;

      const perUnit = totalAmount > 0 && totalQty > 0 ? totalAmount / totalQty : 0;

      let result = prev.map(item => {
        if (item.brand !== 'TAŞERON') return item;

        const newDelta = perUnit > 0 ? round2(perUnit) : null;
        const deltaVal = newDelta ?? 0;
        const oldDelta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;

        // Compute the base unitPrice WITHOUT any previous ek maliyet delta,
        // then add the new delta. This preserves manually-set prices and
        // handles items where listPrice=0 but unitPrice was set directly.
        // The result is tier-rounded so the displayed unit price matches
        // the one used for the row total and the section subtotal.
        const currentUnitPrice = Number(item.unitPrice);
        const baseUnitPrice = currentUnitPrice - (oldDelta * Number(item.katsayi));
        const newUnitPrice = roundUnitPrice(
          baseUnitPrice + (deltaVal * Number(item.katsayi))
        );
        const newTotal = computeRowTotal({
          quantity: Number(item.quantity),
          unitPrice: newUnitPrice,
          discountPct: Number(item.discountPct),
        });

        return {
          ...item,
          ekMaliyetDelta: newDelta,
          unitPrice: newUnitPrice,
          totalPrice: newTotal,
        };
      });

      // Recalculate affected SET parents (only for sub-items)
      const affectedParents = new Set(taseronItems.filter(i => i.parentItemId).map(i => i.parentItemId!));
      for (const parentId of affectedParents) {
        result = recalculateParentTotals(result, parentId);
      }
      return result;
    });
    itemsDirtyRef.current = true;
    setHasChanges(true);
  }, []);

  /**
   * Shared "apply a new rate matrix" pipeline used by both the
   * exchange-rate modal's Uygula button and Phase 4's Kurları
   * Güncelle dialog. Recalculates catalog items, reconverts ek
   * maliyet lines via their stamped sourceCurrency, stashes the new
   * matrix for persistence on the next save, and marks everything
   * dirty. Async because it needs to fetch the latest ek maliyet
   * entries from the server so we reconvert whatever's on disk —
   * the `await` between steps 1 and 2 is load-bearing because the
   * second `setItems` inside `handleEkMaliyetApply` must see the
   * freshly-recalculated state.
   *
   * Returns null on a clean apply, or an error message string when
   * the ek maliyet redistribution failed. Even on partial failure,
   * step 1 (item recalc) still happens because most quotes have no
   * ek maliyet at all — the caller can decide to show the error,
   * offer retry, or dismiss.
   */
  const applyRateMatrix = useCallback(
    async (
      rateMatrix: Record<string, Record<string, number>>,
      newProtectionMap: Record<string, number>,
    ): Promise<string | null> => {
      const quoteCurrency = headerFields.currency;

      // 1. Recalculate item prices using the new matrix and protection.
      setItems((prev) => recalcItemPrices(prev, quoteCurrency, newProtectionMap, rateMatrix));

      // 2. Reconvert ek maliyet lines and redistribute the new total
      //    across TAŞERON items. Uses the latest entries from the DB
      //    so we reflect whatever's actually stamped with
      //    sourceCurrency, not a stale client snapshot.
      const EK_MALIYET_ERROR =
        'Ek maliyet satırları yeniden hesaplanamadı (bağlantı hatası). Lütfen tekrar deneyin veya Ek Maliyet modalını manuel olarak açın.';
      let ekMaliyetError: string | null = null;
      try {
        const entriesRes = await fetch(`/api/quotes/${quoteId}/ek-maliyet`);
        if (!entriesRes.ok) {
          ekMaliyetError = EK_MALIYET_ERROR;
          console.error(
            `[applyRateMatrix] ek maliyet GET returned ${entriesRes.status} — skipping redistribution`
          );
        } else {
          const data = await entriesRes.json();
          const entries = (data.items || []) as Array<{
            amount: number;
            sourceCurrency?: string | null;
          }>;
          if (entries.length > 0) {
            const normalized: EkMaliyetEntryLike[] = entries.map((e) => ({
              amount: Number(e.amount),
              sourceCurrency: e.sourceCurrency ?? null,
            }));
            const newTotal = reconvertEkMaliyetTotal(normalized, rateMatrix, quoteCurrency);
            handleEkMaliyetApply(newTotal);
          }
        }
      } catch (err) {
        ekMaliyetError = EK_MALIYET_ERROR;
        console.error('[applyRateMatrix] ek maliyet reconvert fetch failed', err);
      }

      // 3. Update exchangeRates so newly added products use fresh
      //    rates too, and stash the matrix for the next save so it
      //    lands on the quote as the new rateSnapshot.
      setExchangeRates(rateMatrix);
      pendingRateSnapshotRef.current = rateMatrix;

      itemsDirtyRef.current = true;
      setHasChanges(true);
      return ekMaliyetError;
    },
    [headerFields.currency, recalcItemPrices, quoteId, handleEkMaliyetApply]
  );

  // Wire applyRateMatrix into the ref that `handleExchangeRateApply`
  // reads from. The ref indirection is only here to dodge the TDZ
  // issue between these two callbacks — both end up calling the
  // same pipeline at runtime.
  useEffect(() => {
    exchangeRateApplyRef.current = (
      _newRate,
      _newProtectionPct,
      newProtectionMap,
      rateMatrix,
    ) => {
      // The ExchangeRateModal path has no in-dialog error surface,
      // so route any ek-maliyet-reconvert error to the page-level
      // banner. The drift-dialog path below handles its own error
      // inline without touching `error` state.
      void applyRateMatrix(rateMatrix, newProtectionMap).then((errMsg) => {
        if (errMsg) setError(errMsg);
      });
    };
  }, [applyRateMatrix]);

  // ── Rate drift detection (Phase 5) ────────────────────────────────────────

  // Max absolute drift between the quote's frozen snapshot
  // (`exchangeRates`) and today's fresh TCMB (`liveExchangeRates`).
  // Null when we can't compute a diff (no snapshot, live fetch
  // failed, empty matrices).
  const rateDriftPct = useMemo(() => {
    if (Object.keys(exchangeRates).length === 0) return null;
    if (Object.keys(liveExchangeRates).length === 0) return null;
    return maxRateDriftPct(exchangeRates, liveExchangeRates);
  }, [exchangeRates, liveExchangeRates]);

  const showRateDriftBanner =
    !rateBannerDismissed &&
    rateDriftPct !== null &&
    rateDriftPct >= DRIFT_THRESHOLD_PCT;

  // When the user opens the Kurları Güncelle dialog, lazily fetch
  // ek maliyet counts so the preview dialog can show accurate
  // "affected vs unaffected" numbers. Legacy rows (null source)
  // are unaffected; stamped rows (with source) are affected.
  //
  // Counts are reset to null at the start of every open so a
  // second open after close doesn't flash stale numbers from the
  // previous session.
  const handleOpenRateDialog = useCallback(async () => {
    setEkMaliyetStampedCount(null);
    setEkMaliyetLegacyCount(0);
    setRateDialogOpen(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/ek-maliyet`);
      if (res.ok) {
        const data = await res.json();
        const entries = (data.items || []) as Array<{ sourceCurrency?: string | null }>;
        let stamped = 0;
        let legacy = 0;
        for (const e of entries) {
          if (e.sourceCurrency) stamped++;
          else legacy++;
        }
        setEkMaliyetStampedCount(stamped);
        setEkMaliyetLegacyCount(legacy);
      } else {
        setEkMaliyetStampedCount(0);
        setEkMaliyetLegacyCount(0);
      }
    } catch (err) {
      console.warn('[RateUpdateDialog] ek maliyet count fetch failed', err);
      setEkMaliyetStampedCount(0);
      setEkMaliyetLegacyCount(0);
    }
  }, [quoteId]);

  // When the user confirms Kurları Güncelle, run the unified apply
  // pipeline against the live matrix, then close the dialog and
  // dismiss the banner. Dismissal sticks because after apply, the
  // snapshot IS the live matrix → drift is 0 and the banner
  // wouldn't re-trigger anyway.
  //
  // On partial failure (ek maliyet fetch error), the error is
  // surfaced inline inside the dialog via `rateDialogError` so the
  // user can retry or cancel in context — the page-level error
  // banner is hidden behind the modal backdrop at this point.
  const handleApplyRateUpdate = useCallback(async () => {
    setRateDialogApplying(true);
    setRateDialogError(null);
    try {
      const errMsg = await applyRateMatrix(liveExchangeRates, headerFields.protectionMap);
      if (errMsg === null) {
        setRateDialogOpen(false);
        setRateBannerDismissed(true);
      } else {
        setRateDialogError(errMsg);
      }
    } finally {
      setRateDialogApplying(false);
    }
  }, [applyRateMatrix, liveExchangeRates, headerFields.protectionMap]);

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
    <div className="space-y-4" style={{ fontFamily: 'Tahoma, Calibri, sans-serif' }}>
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

      {/* Rate drift banner — shows when the quote's frozen rate
          snapshot has meaningfully drifted from fresh TCMB */}
      {showRateDriftBanner && rateDriftPct !== null && (
        <RateDriftBanner
          driftPct={rateDriftPct}
          onOpenDialog={handleOpenRateDialog}
          onDismiss={() => setRateBannerDismissed(true)}
        />
      )}

      {/* Header */}
      <QuoteEditorHeader
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        status={quote.status}
        companyName={quote.company.name}
        companyId={quote.company.id}
        userFullName={user.fullName}
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
        availableCompanies={availableCompanies}
        onCompanyChange={handleCompanyChange}
        isChangingCompany={isChangingCompany}
        onProjectChange={(v) => updateHeaderField('projectId', v)}
        onRefNoChange={(v) => updateHeaderField('refNo', v)}
        onSystemBrandChange={(v) => updateHeaderField('subject', v)}
        onDescriptionChange={(v) => updateHeaderField('description', v)}
        onCurrencyChange={handleCurrencyChange}
        onExchangeRateChange={(v) => updateHeaderField('exchangeRate', v)}
        onProtectionPctChange={(v) => updateHeaderField('protectionPct', v)}
        onProtectionMapChange={(v) => updateHeaderField('protectionMap', v)}
        tcmbRateType={headerFields.tcmbRateType}
        onTcmbRateTypeChange={(v) => updateHeaderField('tcmbRateType', v)}
        onExchangeRateApply={handleExchangeRateApply}
        onLanguageChange={(v) => updateHeaderField('language', v)}
        onValidityDaysChange={(v) => updateHeaderField('validityDays', v)}
        onSave={handleSave}
        onSubmitForApproval={canSubmitForApproval}
        onApprove={canApprove}
        onReject={canReject}
        onExport={canExport}
        onQuoteNumberChange={async (newNo) => {
          try {
            const res = await fetch(`/api/quotes/${quoteId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quoteNumber: newNo }),
            });
            if (res.ok) {
              setQuote(prev => prev ? { ...prev, quoteNumber: newNo } : prev);
            }
          } catch (err) {
            console.error('Quote number update error:', err);
          }
        }}
      />

      {/* Items table */}
      <QuoteItemsTable
        items={topLevelItems}
        currency={headerFields.currency}
        exchangeRate={headerFields.exchangeRate}
        protectionPct={headerFields.protectionPct}
        canViewCosts={user.role.canViewCosts}
        canOverrideKatsayi={user.role.canOverrideKatsayi}
        priceHistoryBatch={priceHistoryBatch}
        onItemUpdate={handleItemUpdate}
        onItemDelete={handleItemDelete}
        onItemDuplicate={handleItemDuplicate}
        onReorder={handleReorder}
        onSectionDiscountPctChange={handleSectionDiscountPctChange}
        onSectionDiscountLabelChange={handleSectionDiscountLabelChange}
        onAddProduct={() => setCatalogOpen(true)}
        onSwapProductRequest={handleSwapProductRequest}
        onBulkKatsayiApply={handleBulkKatsayiApply}
        onBulkDelete={handleBulkDelete}
        onBulkDuplicate={handleBulkDuplicate}
        onAddHeader={handleAddHeader}
        onAddNote={handleAddNote}
        onAddCustomItem={handleAddCustomItem}
        onAddSubtotal={handleAddSubtotal}
        onAddGrandTotal={handleAddGrandTotal}
        onAddSubItem={handleAddSubItem}
        onAddCustomSubItem={handleAddCustomSubItem}
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
                companyId={quote.company.id}
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
        onClose={() => {
          setCatalogOpen(false);
          setSubItemParentId(null);
          setSetCreationMode(false);
          setSwapTargetItemId(null);
        }}
        companyId={quote.company.id}
        quoteLanguage={headerFields.language}
        onAddProduct={swapTargetItemId ? handleSwapProduct : handleAddProduct}
        title={
          swapTargetItemId
            ? 'Ürün Değiştir - Yeni Ürün Seç'
            : setCreationMode
              ? 'Serbest Kalem Ekle - Ürün Seç'
              : subItemParentId
                ? 'Serbest Kalem Ekle'
                : undefined
        }
      />

      {/* Ek Maliyet Modal */}
      <EkMaliyetModal
        isOpen={ekMaliyetOpen}
        onClose={() => setEkMaliyetOpen(false)}
        quoteId={quoteId}
        currency={headerFields.currency}
        rateMatrix={exchangeRates}
        exchangeRate={(() => {
          if (headerFields.currency === 'TRY') return 1;
          const rawRate = exchangeRates[headerFields.currency]?.['TRY'] || Number(headerFields.exchangeRate);
          const pk = [headerFields.currency, 'TRY'].sort().join('/');
          const protPct = headerFields.protectionMap[pk] ?? 0;
          return rawRate * (1 + protPct / 100);
        })()}
        onApply={handleEkMaliyetApply}
      />

      {/* Kurları Güncelle preview dialog — opened from the drift
          banner above. Reads both matrices from editor state and
          runs `applyRateMatrix(liveExchangeRates, ...)` on Uygula. */}
      <RateUpdateDialog
        isOpen={rateDialogOpen}
        onClose={() => {
          setRateDialogOpen(false);
          setRateDialogError(null);
        }}
        onApply={handleApplyRateUpdate}
        quoteCurrency={headerFields.currency}
        oldMatrix={exchangeRates}
        newMatrix={liveExchangeRates}
        items={items}
        ekMaliyetStampedCount={ekMaliyetStampedCount}
        ekMaliyetLegacyCount={ekMaliyetLegacyCount}
        isApplying={rateDialogApplying}
        applyError={rateDialogError}
      />

    </div>
  );
}
