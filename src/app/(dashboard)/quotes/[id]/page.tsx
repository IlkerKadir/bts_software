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
  FileSpreadsheet,
  ClipboardCopy,
  Copy,
  ScrollText,
  Clock,
  History,
  Folder,
  Wrench,
  DollarSign,
  TrendingUp,
  User,
  Calendar,
  Globe,
  Shield,
} from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Badge, Spinner } from '@/components/ui';
import { quoteStatusLabels } from '@/lib/validations/quote';
import { ApprovalStatus } from '@/components/quotes/ApprovalStatus';
import { StatusChangeDropdown } from '@/components/quotes/StatusChangeDropdown';
import { QuoteDocuments } from '@/components/quotes/QuoteDocuments';
import { QuoteHistory } from '@/components/quotes/QuoteHistory';
import { QuoteVersionPanel } from '@/components/quotes/QuoteVersionPanel';
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
  const [approvalCheck, setApprovalCheck] = useState<ApprovalCheckResult | null>(null);
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);

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
    (price: number | string | { toNumber?: () => number } | null | undefined) => {
      const numPrice = Number(price) || 0;
      const symbol = quote ? (currencySymbols[quote.currency] || quote.currency) : '€';
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

  // Separate product/custom items from service items
  const nonServiceItems = useMemo(() => {
    if (!quote) return [];
    return quote.items.filter(i => i.itemType !== 'SERVICE');
  }, [quote]);

  const serviceItems = useMemo(() => {
    if (!quote) return [];
    return quote.items.filter(i => i.itemType === 'SERVICE');
  }, [quote]);

  const serviceTotalPrice = useMemo(() => {
    return serviceItems.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  }, [serviceItems]);

  // Build POZ NO mapping: sequential only for PRODUCT/CUSTOM (not SERVICE)
  const pozMap = useMemo(() => {
    if (!quote) return new Map<string, number>();
    const map = new Map<string, number>();
    let counter = 1;
    for (const item of nonServiceItems) {
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM') {
        map.set(item.id, counter);
        counter++;
      }
    }
    return map;
  }, [quote, nonServiceItems]);

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

  // ---------------------------------------------------------------------------
  // Export Handlers
  // ---------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (!quote) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/quotes/${id}/export/pdf`);
      if (!response.ok) throw new Error('PDF oluşturulamadı');

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

  const handleClone = async () => {
    if (!quote) return;
    setIsCloning(true);
    try {
      const response = await fetch(`/api/quotes/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Teklif kopyalanamadi');
      }
      const newQuoteId = data.quote?.id || data.id;
      if (newQuoteId) {
        router.push(`/quotes/${newQuoteId}/edit`);
      }
    } catch (err) {
      console.error('Clone error:', err);
      setError(err instanceof Error ? err.message : 'Teklif kopyalanirken bir hata olustu');
    } finally {
      setIsCloning(false);
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

  const canEdit = quote.status === 'TASLAK' || quote.status === 'REVIZYON';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/quotes')}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-primary-900">{quote.quoteNumber}</h1>
              <Badge status={quote.status as any} />
              <StatusChangeDropdown
                quoteId={id}
                currentStatus={quote.status}
                currentStatusLabel={quoteStatusLabels[quote.status] || quote.status}
                onStatusChange={fetchQuote}
              />
              {approvalCheck && <ApprovalStatus result={approvalCheck} compact />}
            </div>
            {quote.subject && (
              <p className="text-primary-600 mt-1">{quote.subject}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button onClick={() => router.push(`/quotes/${id}/edit`)}>
              <Edit className="w-4 h-4" />
              Düzenle
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleClone}
            isLoading={isCloning}
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
          {permissions.canExport && (
            <>
              <Button variant="secondary" onClick={handleExportPdf} disabled={isExporting}>
                <Download className="w-4 h-4" />
                PDF İndir
              </Button>
              <Button variant="secondary" onClick={handleExportExcel} disabled={isExporting}>
                <FileSpreadsheet className="w-4 h-4" />
                Excel İndir
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Yazdır
          </Button>
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
                <span className="font-medium text-primary-800">v{quote.version}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

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
                {nonServiceItems.filter(i => i.itemType === 'PRODUCT' || i.itemType === 'CUSTOM').length} kalem
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
              {nonServiceItems.map((item) => {
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

                // PRODUCT / CUSTOM rows
                const pozNo = pozMap.get(item.id);
                return (
                  <tr key={item.id} className="border-b border-accent-200 hover:bg-accent-50 transition-colors">
                    <td className="px-3 py-2.5 text-center tabular-nums text-primary-500 font-medium">
                      {pozNo ?? ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <div>
                        {item.code && (
                          <span className="font-mono text-xs text-primary-500 mr-2">{item.code}</span>
                        )}
                        <span className="text-sm text-primary-900">{item.description}</span>
                        {item.brand && (
                          <span className="text-xs text-primary-400 ml-2">({item.brand})</span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-primary-500 mt-0.5 italic">{item.notes}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-800">
                      {Number(item.quantity)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-primary-600 text-xs">
                      {item.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-800">
                      {formatPrice(Number(item.unitPrice))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-primary-900">
                      {Number(item.discountPct) > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-accent-400 line-through">
                            {formatPrice(Number(item.quantity) * Number(item.unitPrice))}
                          </span>
                          <span className="text-green-700">
                            {formatPrice(Number(item.totalPrice))}
                            <span className="ml-1 text-xs text-red-500 font-normal">(-{Number(item.discountPct)}%)</span>
                          </span>
                        </div>
                      ) : (
                        formatPrice(Number(item.totalPrice))
                      )}
                    </td>
                  </tr>
                );
              })}

              {nonServiceItems.length === 0 && (
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
                {/* Ara Toplam */}
                <tr className="border-t-2 border-accent-300">
                  <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-700">
                    Ara Toplam
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-accent-900 whitespace-nowrap">
                    {formatPrice(summary.subtotal)}
                  </td>
                </tr>

                {/* İskonto */}
                {summary.discountPct > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-700">
                      İskonto ({summary.discountPct}%)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">
                      -{formatPrice(summary.discountTotal)}
                    </td>
                  </tr>
                )}

                {/* KDV */}
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-700">
                    KDV
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-accent-800 whitespace-nowrap">
                    {formatPrice(summary.vatTotal)}
                  </td>
                </tr>

                {/* GENEL TOPLAM */}
                <tr className="border-t-2 border-accent-400">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-base font-bold text-accent-900">
                    GENEL TOPLAM
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-base font-bold text-accent-900 whitespace-nowrap">
                    {formatPrice(summary.grandTotal)}
                  </td>
                </tr>

                {/* Cost / Profit summary (only for canViewCosts users) */}
                {permissions.canViewCosts && profitSummary && (
                  <>
                    <tr className="border-t-2 border-accent-300">
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-600">
                        Toplam Maliyet (KDV Hariç)
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent-700 whitespace-nowrap">
                        {formatPrice(Number(profitSummary.totalCost))}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-accent-600">
                        Toplam Kar (KDV Hariç)
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
      {/* SERVICES CARD                                                       */}
      {/* ================================================================== */}
      {serviceItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                <Wrench className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Hizmetler</h3>
                <p className="text-xs text-primary-500">
                  Mühendislik, test ve devreye alma hizmetleri
                </p>
              </div>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-800 text-white text-xs uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Açıklama</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap w-20">Miktar</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap w-16">Birim</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Birim Fiyat</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((item) => (
                  <tr key={item.id} className="border-b border-blue-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-primary-900">{item.description}</span>
                      {item.serviceMeta?.originalTotalTRY && (
                        <p className="text-xs text-primary-500 mt-0.5">
                          Orijinal: ₺{Number(item.serviceMeta.originalTotalTRY).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          {' · '}Kur: {Number(item.serviceMeta.conversionRate || quote.exchangeRate).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          {item.serviceMeta.protectionPct > 0 && ` · Koruma: %${item.serviceMeta.protectionPct}`}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-primary-500 mt-0.5 italic">{item.notes}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-800">
                      {Number(item.quantity)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-primary-600 text-xs">
                      {item.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-primary-800">
                      {formatPrice(Number(item.unitPrice))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-primary-900">
                      {Number(item.discountPct) > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-accent-400 line-through">
                            {formatPrice(Number(item.quantity) * Number(item.unitPrice))}
                          </span>
                          <span className="text-green-700">
                            {formatPrice(Number(item.totalPrice))}
                            <span className="ml-1 text-xs text-red-500 font-normal">(-{Number(item.discountPct)}%)</span>
                          </span>
                        </div>
                      ) : (
                        formatPrice(Number(item.totalPrice))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-50 text-sm">
                <tr className="border-t-2 border-blue-200">
                  <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-blue-900">
                    Hizmet Toplamı
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-900 whitespace-nowrap">
                    {formatPrice(serviceTotalPrice)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ================================================================== */}
      {/* OVERALL TOTAL (Products + Services)                                 */}
      {/* ================================================================== */}
      {serviceItems.length > 0 && summary && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-900">Teklif Genel Toplam</h3>
                  <p className="text-xs text-primary-500">Ürünler + Hizmetler (KDV dahil)</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary-900">
                  {formatPrice(summary.grandTotal + serviceTotalPrice)}
                </p>
                <p className="text-xs text-primary-500 mt-0.5">
                  Ürünler: {formatPrice(summary.grandTotal)} + Hizmetler: {formatPrice(serviceTotalPrice)}
                </p>
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
                    <p className="text-sm text-primary-800 whitespace-pre-wrap leading-relaxed">{term.value}</p>
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
              <p className="text-xs text-primary-500">Mevcut versiyon: v{quote.version}</p>
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
    </div>
  );
}
