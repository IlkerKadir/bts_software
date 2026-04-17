'use client';

import { use } from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Printer,
  Download,
  Building2,
  FileText,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  ClipboardCopy,
  Copy,
  ScrollText,
  Clock,
  History,
  Folder,
  DollarSign,
  TrendingUp,
  User,
  Calendar,
  Globe,
  Shield,
  ShoppingCart,
} from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Badge, Spinner, Modal, Select } from '@/components/ui';
import { quoteStatusLabels } from '@/lib/validations/quote';
import { ApprovalStatus } from '@/components/quotes/ApprovalStatus';
import { StatusChangeDropdown } from '@/components/quotes/StatusChangeDropdown';
import { QuoteDocuments } from '@/components/quotes/QuoteDocuments';
import { QuoteHistory } from '@/components/quotes/QuoteHistory';
import { QuoteVersionPanel } from '@/components/quotes/QuoteVersionPanel';
import { AddReminderButton } from '@/components/reminders/AddReminderButton';
import { BrandProfitSummary } from '@/components/quotes/BrandProfitSummary';
import { cn } from '@/lib/cn';
import type { ApprovalCheckResult } from '@/lib/quote-approval';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface QuoteDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: {
    id: string;
    fullName: string;
  };
}

interface QuoteItem {
  id: string;
  parentItemId?: string | null;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  sortOrder: number;
  priceLabel?: string | null;
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
  ekMaliyetDelta?: number | null;
  currency?: string | null;
  product?: {
    minKatsayi?: number | string | null;
    maxKatsayi?: number | string | null;
  } | null;
}

interface CommercialTerm {
  id: string;
  sortOrder: number;
  category: string;
  value: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  version: number;
  parentQuoteId: string | null;
  company: { id: string; name: string; address?: string | null };
  project?: { id: string; name: string } | null;
  subject?: string | null;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
  discountPct: number;
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  validityDays: number;
  validUntil?: string | null;
  notes?: string | null;
  status: string;
  language?: string;
  items: QuoteItem[];
  commercialTerms: CommercialTerm[];
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

interface ProfitSummary {
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
}

interface UserPermissions {
  canViewCosts: boolean;
  canExport: boolean;
  canApprove: boolean;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const currencySymbols: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  TRY: '₺',
};

const TERM_CATEGORY_LABELS: Record<string, string> = {
  uretici_firmalar: 'Üretici Firmalar',
  onaylar: 'Onaylar',
  garanti: 'Garanti',
  teslim_yeri: 'Teslim Yeri',
  odeme: 'Ödeme',
  kdv: 'KDV',
  teslimat: 'Teslimat',
  opsiyon: 'Opsiyon',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuoteDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>({
    canViewCosts: false,
    canExport: true,
    canApprove: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Clone dialog state — the user picks a target company (defaulting
  // to the source's company) and optional project, then clicks
  // Kopyala to create the new quote. Backend accepts null projectId
  // to detach the clone from any project.
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneCompanyId, setCloneCompanyId] = useState('');
  const [cloneProjectId, setCloneProjectId] = useState<string>('');
  const [cloneCompanies, setCloneCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [cloneProjects, setCloneProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [approvalCheck, setApprovalCheck] = useState<ApprovalCheckResult | null>(null);
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);
  const [ekMaliyetItems, setEkMaliyetItems] = useState<{ title: string; amount: number }[]>([]);

  // Fetch user session for permissions
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role) {
            setPermissions({
              canViewCosts: !!data.user.role.canViewCosts,
              canExport: !!data.user.role.canExport,
              canApprove: !!data.user.role.canApprove,
            });
          }
        }
      } catch {
        // fail silently, use defaults
      }
    })();
  }, []);

  const fetchQuote = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Teklif yüklenemedi');
      }

      setQuote(data.quote);
      if (data.profitSummary) {
        setProfitSummary(data.profitSummary);
      }

      // Fetch approval status
      const statusResponse = await fetch(`/api/quotes/${id}/status`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.approvalCheck) {
          setApprovalCheck(statusData.approvalCheck);
        }
      }

      // Fetch documents
      const docsResponse = await fetch(`/api/quotes/${id}/documents`);
      if (docsResponse.ok) {
        const docsData = await docsResponse.json();
        setDocuments(docsData.documents || []);
      }

      // Fetch ek maliyet entries
      const ekRes = await fetch(`/api/quotes/${id}/ek-maliyet`);
      if (ekRes.ok) {
        const ekData = await ekRes.json();
        setEkMaliyetItems((ekData.items || []).map((i: any) => ({ title: i.title, amount: Number(i.amount) })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const formatPrice = useCallback(
    (
      price: number | string | { toNumber?: () => number } | null | undefined,
      overrideCurrency?: string
    ) => {
      const numPrice = Number(price) || 0;
      const cur = overrideCurrency ?? (quote?.currency ?? 'EUR');
      const symbol = currencySymbols[cur] || cur;
      return `${symbol}${numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [quote],
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Build POZ NO mapping: sequential for top-level PRODUCT/CUSTOM/SET
  // only. Sub-rows (children of a SET) are not numbered — their
  // contribution is rolled into the SET parent's line, same rule as
  // the PDF/editor. Without this filter children would push the POZ
  // counter and make top-level items look like they skip numbers.
  const pozMap = useMemo(() => {
    if (!quote) return new Map<string, number>();
    const map = new Map<string, number>();
    let counter = 1;
    for (const item of quote.items) {
      if (item.parentItemId) continue;
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
        map.set(item.id, counter);
        counter++;
      }
    }
    return map;
  }, [quote]);

  // Map each sub-item to its parent SET's currency override, so a
  // child of a TRY-priced SET in an EUR quote renders with its TRY
  // unitPrice/totalPrice instead of being converted. Top-level rows
  // continue to render in the quote's currency (via the existing
  // `convertRowTotalToQuote` helper).
  const parentSetCurrencyById = useMemo(() => {
    if (!quote) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const it of quote.items) {
      if (it.itemType === 'SET' && !it.parentItemId && it.currency) {
        map.set(it.id, it.currency);
      }
    }
    return map;
  }, [quote]);

  // Group children by their parent SET so the rendering loop can emit
  // them directly under the parent row regardless of their raw
  // `sortOrder`. Without this, a child with sortOrder=5 and a parent
  // with sortOrder=10 ended up visually above an unrelated row
  // between them. Mirrors the editor's subRowsByParent behavior.
  const subRowsByParent = useMemo(() => {
    if (!quote) return new Map<string, QuoteItem[]>();
    const map = new Map<string, QuoteItem[]>();
    for (const it of quote.items) {
      if (!it.parentItemId) continue;
      const list = map.get(it.parentItemId) ?? [];
      list.push(it);
      map.set(it.parentItemId, list);
    }
    // Keep each child group internally sorted by its own sortOrder.
    for (const list of map.values()) {
      list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }
    return map;
  }, [quote]);

  // Precompute the section sum ending at each SUBTOTAL row. Price-labeled
  // items contribute 0, matching the PDF export logic.
  // Base (non-protected) foreign/TRY rate, used to convert any
  // TRY-priced SET into the quote's currency for every view on the
  // detail page. Collapses to identity for TRY quotes and for quotes
  // with no mixed-currency SETs — legacy behavior preserved.
  const baseForeignRate = useMemo(() => {
    if (!quote || quote.currency === 'TRY') return 1;
    const r = Number(quote.exchangeRate) || 1;
    const p = Number(quote.protectionPct) || 0;
    return p > 0 ? r / (1 + p / 100) : r;
  }, [quote]);

  const convertRowTotalToQuote = useCallback(
    (item: QuoteItem, amount: number): number => {
      if (!quote) return amount;
      if (item.currency === 'TRY' && quote.currency !== 'TRY' && baseForeignRate > 0) {
        return amount / baseForeignRate;
      }
      return amount;
    },
    [quote, baseForeignRate]
  );

  const subtotalSumMap = useMemo(() => {
    if (!quote) return new Map<string, number>();
    const map = new Map<string, number>();
    let running = 0;
    for (const item of quote.items) {
      if (item.itemType === 'SUBTOTAL') {
        map.set(item.id, running);
        running = 0;
        continue;
      }
      if (item.priceLabel) continue;
      // Sub-rows are already rolled into the SET parent's totalPrice —
      // counting them here would double their contribution AND treat
      // their native-currency numbers as quote currency (children
      // have no own `currency` field so the converter passes them
      // through). Skip them entirely.
      if (item.parentItemId) continue;
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
        running += convertRowTotalToQuote(item, Number(item.totalPrice));
      }
    }
    return map;
  }, [quote, convertRowTotalToQuote]);

  // Summary calculations
  const summary = useMemo(() => {
    if (!quote) return null;
    const subtotal = Number(quote.subtotal) || 0;
    const discountPct = Number(quote.discountPct) || 0;
    const discountTotal = Number(quote.discountTotal) || 0;
    const vatTotal = Number(quote.vatTotal) || 0;
    const grandTotal = Number(quote.grandTotal) || 0;

    return { subtotal, discountPct, discountTotal, vatTotal, grandTotal };
  }, [quote]);

  // Skip the default tfoot summary when the user has placed inline
  // SUBTOTAL / GRAND_TOTAL rows, otherwise we'd duplicate the totals.
  const hasInlineSubtotal = useMemo(
    () => !!quote?.items.some(i => i.itemType === 'SUBTOTAL'),
    [quote],
  );
  const hasInlineGrandTotal = useMemo(
    () => !!quote?.items.some(i => i.itemType === 'GRAND_TOTAL'),
    [quote],
  );

  // ---------------------------------------------------------------------------
  // Export Handlers
  // ---------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (!quote) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/quotes/${id}/export/pdf`);
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `PDF oluşturulamadı (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quote.quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF export error:', err);
      setError(err instanceof Error ? err.message : 'PDF oluşturulurken bir hata oluştu');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!quote) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/quotes/${id}/export/excel`);
      if (!response.ok) throw new Error('Excel oluşturulamadı');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quote.quoteNumber}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Excel export error:', err);
      setError(err instanceof Error ? err.message : 'Excel oluşturulurken bir hata oluştu');
    } finally {
      setIsExporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Revision Handler
  // ---------------------------------------------------------------------------

  const handleCreateRevision = async () => {
    if (!quote) return;
    setIsCreatingRevision(true);
    try {
      const response = await fetch(`/api/quotes/${id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Revizyon oluşturulamadı');
      }
      // Redirect to the new revision's edit page
      const newQuoteId = data.quote?.id || data.id;
      if (newQuoteId) {
        router.push(`/quotes/${newQuoteId}/edit`);
      }
    } catch (err) {
      console.error('Revision error:', err);
      setError(err instanceof Error ? err.message : 'Revizyon oluşturulurken bir hata oluştu');
    } finally {
      setIsCreatingRevision(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Clone Handler
  // ---------------------------------------------------------------------------

  /**
   * Open the clone modal with the company and project pre-filled from
   * the source quote. Fetches the full company + project lists lazily
   * so the dropdowns are populated when the user opens the modal,
   * not on page load.
   */
  const handleOpenCloneModal = useCallback(async () => {
    if (!quote) return;
    setCloneCompanyId(quote.company.id);
    setCloneProjectId(quote.project?.id ?? '');
    // Seed the lists with the source so the <Select> can always
    // render the pre-filled value, even if the source lives outside
    // the first 200 rows of the list endpoint or the fetch fails.
    // The real lists (below) will overwrite once they arrive.
    setCloneCompanies([{ id: quote.company.id, name: quote.company.name }]);
    setCloneProjects(quote.project ? [{ id: quote.project.id, name: quote.project.name }] : []);
    setCloneError(null);
    setCloneModalOpen(true);

    // Lazy fetch — only when the user actually wants to clone.
    // Merge the source into each list so it stays selectable even
    // if pagination hid it.
    const mergeById = <T extends { id: string }>(seed: T[], incoming: T[]): T[] => {
      const seen = new Set(seed.map((x) => x.id));
      return [...seed, ...incoming.filter((x) => !seen.has(x.id))];
    };

    try {
      const [companiesRes, projectsRes] = await Promise.all([
        fetch('/api/companies?limit=200'),
        fetch('/api/projects?limit=200'),
      ]);
      if (companiesRes.ok) {
        const data = await companiesRes.json();
        const fetched = (data.companies || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
        setCloneCompanies((prev) => mergeById(prev, fetched));
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        const fetched = (data.projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
        setCloneProjects((prev) => mergeById(prev, fetched));
      }
    } catch (err) {
      console.error('Clone modal lookup fetch failed', err);
      setCloneError('Liste yüklenemedi — yine de kaynak firma/proje seçili kalır.');
    }
  }, [quote]);

  const handleCloneSubmit = async () => {
    if (!quote) return;
    if (!cloneCompanyId) {
      setCloneError('Hedef firma seçilmedi');
      return;
    }
    setCloneError(null);
    setIsCloning(true);
    try {
      const response = await fetch(`/api/quotes/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: cloneCompanyId,
          // Send null when the user explicitly cleared the project,
          // so the backend detaches instead of inheriting.
          projectId: cloneProjectId === '' ? null : cloneProjectId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Teklif kopyalanamadi');
      }
      const newQuoteId = data.quote?.id || data.id;
      // Success: close the modal and navigate. On error we keep
      // the modal open (below) so the user can fix the picker
      // and retry without re-opening + re-fetching.
      setCloneModalOpen(false);
      if (newQuoteId) {
        router.push(`/quotes/${newQuoteId}/edit`);
      }
    } catch (err) {
      console.error('Clone error:', err);
      setCloneError(err instanceof Error ? err.message : 'Teklif kopyalanirken bir hata olustu');
    } finally {
      setIsCloning(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create Order Handler
  // ---------------------------------------------------------------------------

  const handleCreateOrder = async () => {
    if (!quote) return;
    setIsCreatingOrder(true);
    setError(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Siparis olusturulamadi');
      }
      router.push('/orders');
    } catch (err) {
      console.error('Create order error:', err);
      setError(err instanceof Error ? err.message : 'Siparis olusturulurken bir hata olustu');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error}</p>
        <Button variant="secondary" onClick={() => router.push('/quotes')}>
          <ArrowLeft className="w-4 h-4" />
          Tekliflere Dön
        </Button>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">Teklif bulunamadı</p>
        <Button variant="secondary" onClick={() => router.push('/quotes')}>
          <ArrowLeft className="w-4 h-4" />
          Tekliflere Dön
        </Button>
      </div>
    );
  }

  // Regular flow: creators and editors can edit TASLAK / REVIZYON quotes.
  // Extra flow: managers (canApprove) can also edit ONAY_BEKLIYOR quotes
  // so they can adjust the quote in place instead of bouncing it back to
  // the salesperson. The backend PUT handler already allows this branch;
  // this just surfaces the button in the UI.
  const canEdit =
    quote.status === 'TASLAK' ||
    quote.status === 'REVIZYON' ||
    (quote.status === 'ONAY_BEKLIYOR' && permissions.canApprove);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}
      <div className="space-y-3">
        {/* Row 1: Back + Title + Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-primary-900">{quote.quoteNumber}</h1>
          <StatusChangeDropdown
            quoteId={id}
            currentStatus={quote.status}
            currentStatusLabel={quoteStatusLabels[quote.status] || quote.status}
            onStatusChange={fetchQuote}
          />
          {approvalCheck && <ApprovalStatus result={approvalCheck} compact />}
        </div>

        {/* Row 2: Subject */}
        {quote.subject && (
          <p className="text-sm text-primary-500 ml-12">{quote.subject}</p>
        )}

        {/* Row 3: Action buttons — grouped logically */}
        <div className="flex items-center gap-1.5 flex-wrap ml-12">
          {/* Primary action */}
          {canEdit && (
            <Button onClick={() => router.push(`/quotes/${id}/edit`)}>
              <Edit className="w-4 h-4" />
              Düzenle
            </Button>
          )}
          {quote.status === 'KAZANILDI' && (
            <Button
              onClick={handleCreateOrder}
              isLoading={isCreatingOrder}
              disabled={isCreatingOrder}
            >
              <ShoppingCart className="w-4 h-4" />
              Sipariş Oluştur
            </Button>
          )}

          {/* Divider */}
          {(canEdit || quote.status === 'KAZANILDI') && (
            <div className="w-px h-6 bg-primary-200 mx-1" />
          )}

          {/* Copy / Revision */}
          <Button
            variant="secondary"
            onClick={handleOpenCloneModal}
            disabled={isCloning}
          >
            <Copy className="w-4 h-4" />
            Kopyala
          </Button>
          <Button
            variant="secondary"
            onClick={handleCreateRevision}
            isLoading={isCreatingRevision}
            disabled={isCreatingRevision}
          >
            <ClipboardCopy className="w-4 h-4" />
            Revizyon Oluştur
          </Button>

          {/* Divider */}
          <div className="w-px h-6 bg-primary-200 mx-1" />

          {/* Export / Print */}
          {permissions.canExport && (
            <>
              <Button variant="secondary" onClick={handleExportPdf} disabled={isExporting}>
                <Download className="w-4 h-4" />
                PDF
              </Button>
              <Button variant="secondary" onClick={handleExportExcel} disabled={isExporting}>
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Yazdır
          </Button>
          <AddReminderButton quoteId={id} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ================================================================== */}
      {/* APPROVAL WARNING                                                    */}
      {/* ================================================================== */}
      {approvalCheck && approvalCheck.needsApproval && (
        <ApprovalStatus result={approvalCheck} showMetrics />
      )}

      {/* ================================================================== */}
      {/* INFO CARDS                                                          */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Firma Bilgileri</h3>
                <p className="text-xs text-primary-500">Müşteri ve proje detayları</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <h4 className="text-lg font-semibold text-primary-900">{quote.company.name}</h4>
            {quote.company.address && (
              <p className="text-sm text-primary-600 mt-1">{quote.company.address}</p>
            )}
            {quote.project && (
              <div className="mt-4 pt-3 border-t border-primary-100 flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary-400" />
                <span className="text-sm text-primary-500">Proje:</span>
                <span className="text-sm font-medium text-primary-800">{quote.project.name}</span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quote Meta Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Teklif Bilgileri</h3>
                <p className="text-xs text-primary-500">Tarih, para birimi ve detaylar</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Tarih:</span>
                <span className="font-medium text-primary-800">{formatDate(quote.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Para Birimi:</span>
                <span className="font-medium text-primary-800">{quote.currency}</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Kur:</span>
                <span className="font-medium text-primary-800">
                  {Number(quote.exchangeRate).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Geçerlilik:</span>
                <span className="font-medium text-primary-800">{quote.validityDays} gün</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Hazırlayan:</span>
                <span className="font-medium text-primary-800">{quote.createdBy.fullName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Versiyon:</span>
                <span className="font-medium text-primary-800">
                  {quote.parentQuoteId === null
                    ? 'Orijinal'
                    : `Revizyon ${quote.quoteNumber.split('.').pop()}`}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* BRAND PROFIT SUMMARY                                                */}
      {/* ================================================================== */}
      {quote.items.length > 0 && (
        <BrandProfitSummary
          items={quote.items.map((item) => ({
            id: item.id,
            parentItemId: item.parentItemId ?? null,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            code: item.code,
            brand: item.brand,
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit,
            listPrice: Number(item.listPrice),
            katsayi: Number(item.katsayi),
            unitPrice: Number(item.unitPrice),
            discountPct: Number(item.discountPct),
            vatRate: Number(item.vatRate),
            totalPrice: Number(item.totalPrice),
            notes: item.notes,
            isManualPrice: item.isManualPrice,
            costPrice: item.costPrice != null ? Number(item.costPrice) : null,
            ekMaliyetDelta: item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : null,
            currency: item.currency ?? null,
          }))}
          discountPct={Number(quote.discountPct) || 0}
          currency={quote.currency}
          exchangeRate={Number(quote.exchangeRate) || 1}
          protectionPct={Number(quote.protectionPct) || 0}
          canViewCosts={permissions.canViewCosts}
        />
      )}

      {/* ================================================================== */}
      {/* ITEMS TABLE                                                         */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Teklif Kalemleri</h3>
              <p className="text-xs text-primary-500">
                {quote.items.filter(i => i.itemType === 'PRODUCT' || i.itemType === 'CUSTOM' || i.itemType === 'SET').length} kalem
              </p>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-accent-800 text-white text-xs uppercase tracking-wider">
                <th className="px-3 py-2.5 text-center whitespace-nowrap w-16">Poz No</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Açıklama</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-20">Miktar</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap w-16">Birim</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Birim Fiyat</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Toplam Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Render top-level items in sortOrder; after each SET
                // parent, emit its children immediately below — never
                // rely on a child's raw sortOrder for visual position,
                // otherwise a stray parentItemId pointer would land
                // the child between unrelated rows (which is exactly
                // what the client reported in the view).
                const out: React.ReactNode[] = [];
                const renderRow = (item: typeof quote.items[number]) => {
                // HEADER row
                if (item.itemType === 'HEADER') {
                  return (
                    <tr key={item.id} className="bg-accent-100">
                      <td className="px-3 py-2" />
                      <td colSpan={5} className="px-3 py-2 font-bold text-primary-800 text-sm">
                        {item.description}
                      </td>
                    </tr>
                  );
                }

                // NOTE row
                if (item.itemType === 'NOTE') {
                  return (
                    <tr key={item.id} className="bg-amber-50/50">
                      <td className="px-3 py-2" />
                      <td colSpan={5} className="px-3 py-2 text-sm text-primary-700 italic">
                        {item.description}
                      </td>
                    </tr>
                  );
                }

                // SUBTOTAL row — inline section total band
                if (item.itemType === 'SUBTOTAL') {
                  const sectionSum = subtotalSumMap.get(item.id) ?? 0;
                  return (
                    <tr key={item.id} className="bg-accent-50 border-t-2 border-accent-300">
                      <td colSpan={5} className="px-3 py-2 text-right text-sm font-medium text-accent-700">
                        {item.description || 'Ara Toplam'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-accent-900 whitespace-nowrap">
                        {formatPrice(sectionSum)}
                      </td>
                    </tr>
                  );
                }

                // GRAND_TOTAL row — inline grand total band
                if (item.itemType === 'GRAND_TOTAL') {
                  return (
                    <tr key={item.id} className="bg-primary-50 border-t-2 border-primary-300">
                      <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-bold text-primary-900">
                        {item.description || 'GENEL TOPLAM'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary-900 whitespace-nowrap">
                        {formatPrice(summary?.grandTotal ?? 0)}
                      </td>
                    </tr>
                  );
                }

                // PRODUCT / CUSTOM / SET rows
                const pozNo = pozMap.get(item.id);
                const isSubRow = !!item.parentItemId;
                // Sub-rows render in their parent SET's currency (no
                // conversion) — matches the editor and the PDF. Top
                // level rows go through the convert helper so a
                // TRY-SET line shows as e.g. €70,13 instead of its
                // raw ₺4.000,00 face value.
                const rowCurrency = isSubRow
                  ? (parentSetCurrencyById.get(item.parentItemId!) ?? quote.currency)
                  : quote.currency;
                const formatRowPrice = (amount: number) =>
                  isSubRow
                    ? formatPrice(amount, rowCurrency)
                    : formatPrice(convertRowTotalToQuote(item, amount));

                // Katsayi range check
                const k = Number(item.katsayi);
                const minK = item.product?.minKatsayi != null ? Number(item.product.minKatsayi) : null;
                const maxK = item.product?.maxKatsayi != null ? Number(item.product.maxKatsayi) : null;
                const kOutOfRange =
                  (minK !== null && k < minK) || (maxK !== null && k > maxK);
                const kRangeLabel =
                  (minK !== null || maxK !== null)
                    ? `Aralik: ${minK !== null ? minK.toFixed(3) : '-'} - ${maxK !== null ? maxK.toFixed(3) : '-'}`
                    : null;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-accent-200 hover:bg-accent-50 transition-colors',
                      kOutOfRange && 'bg-amber-50',
                      isSubRow && 'bg-blue-50/30 text-accent-500',
                    )}
                  >
                    <td className="px-3 py-2.5 text-center tabular-nums text-primary-500 font-medium">
                      {pozNo ?? ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-start gap-1">
                        {isSubRow && (
                          <span className="text-accent-400 mr-1 leading-5" aria-hidden>↳</span>
                        )}
                        <div>
                          {item.code && (
                            <span className="font-mono text-xs text-primary-500 mr-2">{item.code}</span>
                          )}
                          <span
                            className={cn(
                              'text-sm',
                              isSubRow ? 'text-accent-600' : 'text-primary-900'
                            )}
                          >
                            {item.description}
                          </span>
                          {item.brand && (
                            <span className="text-xs text-primary-400 ml-2">({item.brand})</span>
                          )}
                        </div>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-primary-500 mt-0.5 italic">{item.notes}</p>
                      )}
                      {kOutOfRange && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span className="text-[11px] text-amber-600">
                            Belirlenen aralik disinda (katsayi: {k.toFixed(3)}{kRangeLabel ? `, ${kRangeLabel}` : ''})
                          </span>
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        isSubRow ? 'text-accent-500' : 'text-primary-800'
                      )}
                    >
                      {Number(item.quantity)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-center text-xs',
                        isSubRow ? 'text-accent-500' : 'text-primary-600'
                      )}
                    >
                      {item.unit}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        isSubRow ? 'text-accent-500' : 'text-primary-800'
                      )}
                    >
                      {formatRowPrice(Number(item.unitPrice))}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums font-medium',
                        isSubRow ? 'text-accent-500' : 'text-primary-900'
                      )}
                    >
                      {Number(item.discountPct) > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-accent-400 line-through">
                            {formatRowPrice(Number(item.quantity) * Number(item.unitPrice))}
                          </span>
                          <span className={isSubRow ? '' : 'text-green-700'}>
                            {formatRowPrice(Number(item.totalPrice))}
                            <span className="ml-1 text-xs text-red-500 font-normal">(-{Number(item.discountPct)}%)</span>
                          </span>
                        </div>
                      ) : (
                        formatRowPrice(Number(item.totalPrice))
                      )}
                    </td>
                  </tr>
                );
                };
                const topLevel = quote.items.filter((i) => !i.parentItemId);
                const rendered = new Set<string>();
                for (const item of topLevel) {
                  out.push(renderRow(item));
                  rendered.add(item.id);
                  const subs = subRowsByParent.get(item.id) ?? [];
                  for (const sub of subs) {
                    out.push(renderRow(sub));
                    rendered.add(sub.id);
                  }
                }
                // Orphans: children whose parentItemId doesn't match any
                // top-level row. Shouldn't happen with onDelete:Cascade
                // but we still render them rather than silently drop.
                for (const item of quote.items) {
                  if (!rendered.has(item.id)) out.push(renderRow(item));
                }
                return out;
              })()}

              {quote.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-accent-500">
                    Henüz kalem eklenmedi.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Summary footer */}
            {summary && (
              <tfoot className="bg-accent-50 text-sm">
                {/* Ara Toplam / İskonto / Genel Toplam — only when the quote
                    doesn't already carry inline SUBTOTAL/GRAND_TOTAL rows,
                    so we don't render duplicates. */}
                {!hasInlineSubtotal && (
                  <tr className="border-t-2 border-accent-300">
                    <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-700">
                      Ara Toplam
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-accent-900 whitespace-nowrap">
                      {formatPrice(summary.subtotal)}
                    </td>
                  </tr>
                )}

                {!hasInlineSubtotal && summary.discountPct > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-700">
                      İskonto ({summary.discountPct}%)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">
                      -{formatPrice(summary.discountTotal)}
                    </td>
                  </tr>
                )}

                {!hasInlineGrandTotal && (
                  <tr className="border-t-2 border-accent-400">
                    <td colSpan={5} className="px-3 py-2.5 text-right text-base font-bold text-accent-900">
                      GENEL TOPLAM
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-base font-bold text-accent-900 whitespace-nowrap">
                      {formatPrice(summary.subtotal - summary.discountTotal)}
                    </td>
                  </tr>
                )}

                {/* Cost / Profit summary (only for canViewCosts users) */}
                {permissions.canViewCosts && profitSummary && (
                  <>
                    <tr className="border-t-2 border-accent-300">
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-600">
                        Toplam Maliyet
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent-700 whitespace-nowrap">
                        {formatPrice(Number(profitSummary.totalCost))}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-600">
                        Toplam Kar
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium',
                          Number(profitSummary.totalProfit) < 0 ? 'text-red-600' : 'text-green-700',
                        )}
                      >
                        {formatPrice(Number(profitSummary.totalProfit))}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-600">
                        Kar Marjı %
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium',
                          Number(profitSummary.profitMargin) < 15 ? 'text-red-600' : 'text-green-700',
                        )}
                      >
                        %{Number(profitSummary.profitMargin).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ================================================================== */}
      {/* EK MALİYET                                                          */}
      {/* ================================================================== */}
      {ekMaliyetItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Ek Maliyet</h3>
                <p className="text-xs text-primary-500">
                  TAŞERON kalemlerine dağıtılan ek maliyetler
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {ekMaliyetItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-primary-100 last:border-0">
                  <span className="text-sm text-primary-800">{item.title}</span>
                  <span className="text-sm font-semibold tabular-nums text-primary-900">
                    {item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRY
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-primary-300">
                <span className="text-sm font-semibold text-primary-900">Toplam</span>
                <span className="text-sm font-bold tabular-nums text-primary-900">
                  {ekMaliyetItems.reduce((s, i) => s + i.amount, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRY
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ================================================================== */}
      {/* COMMERCIAL TERMS                                                    */}
      {/* ================================================================== */}
      {quote.commercialTerms && quote.commercialTerms.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Ticari Şartlar</h3>
                <p className="text-xs text-primary-500">
                  {quote.commercialTerms.filter(t => t.value && t.value.trim().length > 0).length} kategori dolduruldu
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {quote.commercialTerms
                .filter((term) => term.value && term.value.trim().length > 0)
                .map((term) => (
                  <div key={term.id} className="border-b border-primary-100 pb-3 last:border-0 last:pb-0">
                    <span className="inline-block text-xs font-medium text-primary-500 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded-full mb-1.5">
                      {TERM_CATEGORY_LABELS[term.category] || term.category}
                    </span>
                    {term.category === 'uretici_firmalar' ? (() => {
                      try {
                        const parsed = JSON.parse(term.value) as Record<string, string[]>;
                        return Object.entries(parsed).map(([brand, systems]) => (
                          <p key={brand} className="text-sm text-primary-800 leading-relaxed">
                            {systems.length > 0 ? `${brand} - ${systems.join(', ')}` : brand}
                          </p>
                        ));
                      } catch {
                        return <p className="text-sm text-primary-800 whitespace-pre-wrap leading-relaxed">{term.value}</p>;
                      }
                    })() : (
                      <p className="text-sm text-primary-800 whitespace-pre-wrap leading-relaxed">{term.value}</p>
                    )}
                  </div>
                ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ================================================================== */}
      {/* NOTES                                                               */}
      {/* ================================================================== */}
      {quote.notes && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-semibold text-primary-900">Notlar</h3>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-primary-700 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
          </CardBody>
        </Card>
      )}

      {/* ================================================================== */}
      {/* DOCUMENTS                                                           */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Dökümanlar</h3>
              <p className="text-xs text-primary-500">{documents.length} dosya</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <QuoteDocuments
            quoteId={id}
            documents={documents}
            onRefresh={fetchQuote}
          />
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* VERSION HISTORY                                                     */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Versiyon Geçmişi</h3>
              <p className="text-xs text-primary-500 font-mono">{quote.quoteNumber}</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <QuoteVersionPanel
            quoteId={id}
            currentVersion={quote.version}
            onRevert={(newQuoteId) => router.push(`/quotes/${newQuoteId}`)}
          />
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* AUDIT TRAIL / HISTORY                                               */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Geçmiş</h3>
              <p className="text-xs text-primary-500">İşlem kayıtları</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <QuoteHistory quoteId={id} />
        </CardBody>
      </Card>

      {/* Clone confirmation modal — lets the user pick a target
          company and optionally a project before cloning. */}
      <Modal
        isOpen={cloneModalOpen}
        onClose={() => {
          if (!isCloning) {
            setCloneModalOpen(false);
            setCloneError(null);
          }
        }}
        title="Teklifi Kopyala"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCloneModalOpen(false);
                setCloneError(null);
              }}
              disabled={isCloning}
            >
              İptal
            </Button>
            <Button onClick={handleCloneSubmit} isLoading={isCloning} disabled={isCloning || !cloneCompanyId}>
              Kopyala
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-primary-600">
            Yeni teklif için firma ve proje seçin. Kaynak teklifin tüm kalemleri, ticari şartları ve ek maliyetleri kopyalanır.
          </p>
          {cloneError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {cloneError}
            </div>
          )}
          <Select
            label="Firma *"
            value={cloneCompanyId}
            onChange={(e) => setCloneCompanyId(e.target.value)}
            options={cloneCompanies.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Proje"
            value={cloneProjectId}
            onChange={(e) => setCloneProjectId(e.target.value)}
            options={[
              { value: '', label: '— Proje seçilmedi —' },
              ...cloneProjects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
