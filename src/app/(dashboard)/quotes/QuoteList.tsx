'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Eye,
  FileText,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Trash2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Button, Input, Select, Card, Badge, Modal } from '@/components/ui';
import { quoteStatusLabels } from '@/lib/validations/quote';
import { BulkStatusModal } from '@/components/quotes/BulkStatusModal';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Pagination } from '@/lib/types/pagination';

interface Company {
  id: string;
  name: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  company: { id: string; name: string };
  project?: { id: string; name: string } | null;
  subject?: string | null;
  currency: string;
  grandTotal: number | { toNumber: () => number };
  profitMargin?: number | null;
  status: string;
  version: number;
  validUntil?: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  revisions?: Quote[];
}

interface QuoteListProps {
  userId: string;
  canApprove: boolean;
  canViewCosts: boolean;
}

type SortField = 'quoteNumber' | 'company' | 'grandTotal' | 'status' | 'createdAt' | 'createdBy' | 'profitMargin';
type SortDirection = 'asc' | 'desc';

const statusOptions = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'TASLAK', label: 'Taslak' },
  { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
  { value: 'ONAYLANDI', label: 'Onaylandı' },
  { value: 'GONDERILDI', label: 'Gönderildi' },
  { value: 'TAKIPTE', label: 'Takipte' },
  { value: 'REVIZYON', label: 'Revizyon' },
  { value: 'KAZANILDI', label: 'Kazanıldı' },
  { value: 'KAYBEDILDI', label: 'Kaybedildi' },
  { value: 'IPTAL', label: 'İptal' },
];

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TASLAK: 'default',
  ONAY_BEKLIYOR: 'warning',
  ONAYLANDI: 'info',
  GONDERILDI: 'info',
  TAKIPTE: 'warning',
  REVIZYON: 'warning',
  KAZANILDI: 'success',
  KAYBEDILDI: 'error',
  IPTAL: 'error',
};

/** Extract base quote number: "BTS-2026-0001-R2" -> "BTS-2026-0001" */
function getBaseQuoteNumber(quoteNumber: string): string {
  return quoteNumber.split('-R')[0];
}

export function QuoteList({ userId, canApprove, canViewCosts }: QuoteListProps) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
  const [newQuoteData, setNewQuoteData] = useState({
    companyId: '',
    projectId: '',
    subject: '',
    currency: 'EUR',
  });
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [deletingQuote, setDeletingQuote] = useState<Quote | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());

  const fetchQuotes = useCallback(async (page = 1) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (sortField) params.set('sortField', sortField);
      if (sortDirection) params.set('sortDirection', sortDirection);
      params.set('groupRevisions', 'true');
      params.set('page', page.toString());

      const response = await fetch(`/api/quotes?${params}`);
      const data = await response.json();

      if (response.ok) {
        setQuotes(data.quotes);
        setPagination(data.pagination);
      } else {
        setFetchError(data.error || 'Teklifler yüklenirken bir hata oluştu');
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
      setFetchError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, companyFilter, dateFrom, dateTo, sortField, sortDirection]);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies?limit=100');
        const data = await response.json();
        setCompanies(data.companies || []);
      } catch (err) {
        console.error('Error fetching companies:', err);
      }
    };

    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // Fetch projects when company changes in the create modal
  useEffect(() => {
    if (!newQuoteData.companyId) {
      setProjects([]);
      return;
    }
    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const res = await fetch(`/api/projects?clientId=${newQuoteData.companyId}&limit=100`);
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setProjects([]);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [newQuoteData.companyId]);

  const handleCreateQuote = async () => {
    if (!newQuoteData.companyId || !newQuoteData.projectId) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuoteData),
      });

      const data = await response.json();

      if (response.ok) {
        setIsNewQuoteModalOpen(false);
        setNewQuoteData({ companyId: '', projectId: '', subject: '', currency: 'EUR' });
        router.push(`/quotes/${data.quote.id}/edit`);
      } else {
        setCreateError(data.error || 'Teklif oluşturulurken bir hata oluştu');
      }
    } catch (error) {
      console.error('Error creating quote:', error);
      setCreateError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingQuote) return;
    try {
      const response = await fetch(`/api/quotes/${deletingQuote.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        setDeleteError(data.error || 'Silme işlemi başarısız');
        return;
      }
      setDeletingQuote(null);
      setDeleteError('');
      fetchQuotes();
    } catch {
      setDeleteError('Bir hata oluştu');
    }
  };

  const isExpired = (validUntil: string | null | undefined) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  const getNumericValue = (val: number | string | { toNumber?: () => number } | null | undefined): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    if (val && typeof val.toNumber === 'function') return val.toNumber();
    return 0;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleExpand = (baseNumber: string) => {
    setExpandedQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(baseNumber)) {
        next.delete(baseNumber);
      } else {
        next.add(baseNumber);
      }
      return next;
    });
  };

  // Sorting is now handled server-side; quotes are already sorted by the API
  const sortedQuotes = quotes;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary-700" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary-700" />
    );
  };

  const colCount = canViewCosts ? 10 : 9;

  const toggleQuoteSelection = (quoteId: string) => {
    setSelectedQuoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedQuoteIds.size === sortedQuotes.length) {
      setSelectedQuoteIds(new Set());
    } else {
      setSelectedQuoteIds(new Set(sortedQuotes.map((q) => q.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Teklifler</h1>
          <p className="text-sm text-primary-500">Tüm teklifleri yönetin</p>
        </div>
        <Button onClick={() => setIsNewQuoteModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Yeni Teklif
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 space-y-3">
          {/* First row: search + company + status */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input
                type="text"
                placeholder="Teklif no, firma veya proje ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <Select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              options={[
                { value: '', label: 'Tüm Firmalar' },
                ...companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
              className="w-full sm:w-48"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
              className="w-full sm:w-48"
            />
          </div>
          {/* Second row: date range */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-400 shrink-0" />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="Başlangıç"
                  title="Başlangıç Tarihi"
                />
                <span className="text-primary-400 text-sm">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="Bitiş"
                  title="Bitiş Tarihi"
                />
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-xs text-primary-500 hover:text-primary-700 underline cursor-pointer"
              >
                Tarihi Temizle
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 font-medium">{fetchError}</p>
          <button
            onClick={() => fetchQuotes()}
            className="text-sm text-red-600 underline ml-4"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Bulk Selection Toolbar */}
      {selectedQuoteIds.size > 0 && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-accent-800">{selectedQuoteIds.size} teklif seçildi</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedQuoteIds(new Set())}>
              Seçimi Temizle
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowBulkModal(true)}>
              Toplu Durum Değiştir
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sortedQuotes.length > 0 && selectedQuoteIds.size === sortedQuotes.length}
                    onChange={toggleSelectAll}
                    className="rounded border-primary-300 cursor-pointer"
                  />
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('quoteNumber')}
                >
                  <div className="flex items-center">
                    Teklif No
                    <SortIcon field="quoteNumber" />
                  </div>
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('company')}
                >
                  <div className="flex items-center">
                    Firma
                    <SortIcon field="company" />
                  </div>
                </th>
                <th>Proje</th>
                <th
                  className="text-right cursor-pointer select-none"
                  onClick={() => handleSort('grandTotal')}
                >
                  <div className="flex items-center justify-end">
                    Tutar
                    <SortIcon field="grandTotal" />
                  </div>
                </th>
                {canViewCosts && (
                  <th
                    className="text-right cursor-pointer select-none"
                    onClick={() => handleSort('profitMargin')}
                  >
                    <div className="flex items-center justify-end">
                      Kar Marjı %
                      <SortIcon field="profitMargin" />
                    </div>
                  </th>
                )}
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Durum
                    <SortIcon field="status" />
                  </div>
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('createdBy')}
                >
                  <div className="flex items-center">
                    Oluşturan
                    <SortIcon field="createdBy" />
                  </div>
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center">
                    Tarih
                    <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="w-20">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-8 text-primary-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : sortedQuotes.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-8 text-primary-500">
                    Teklif bulunamadı
                  </td>
                </tr>
              ) : (
                sortedQuotes.map((quote) => {
                  const baseNumber = getBaseQuoteNumber(quote.quoteNumber);
                  const hasRevisions = quote.revisions && quote.revisions.length > 0;
                  const isExpanded = expandedQuotes.has(baseNumber);

                  return (
                    <QuoteGroupRows
                      key={quote.id}
                      quote={quote}
                      baseNumber={baseNumber}
                      hasRevisions={!!hasRevisions}
                      isExpanded={isExpanded}
                      onToggleExpand={toggleExpand}
                      canViewCosts={canViewCosts}
                      selectedQuoteIds={selectedQuoteIds}
                      onToggleSelection={toggleQuoteSelection}
                      onNavigate={(id) => router.push(`/quotes/${id}`)}
                      onEdit={(id) => router.push(`/quotes/${id}/edit`)}
                      onDelete={setDeletingQuote}
                      isExpiredFn={isExpired}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-primary-200 flex items-center justify-between">
            <p className="text-sm text-primary-500">
              Toplam {pagination.total} teklif
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-500">
                Sayfa {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchQuotes(pagination.page - 1)}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchQuotes(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* New Quote Modal */}
      <Modal
        isOpen={isNewQuoteModalOpen}
        onClose={() => setIsNewQuoteModalOpen(false)}
        title="Yeni Teklif Oluştur"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsNewQuoteModalOpen(false)}
              disabled={isCreating}
            >
              İptal
            </Button>
            <Button
              onClick={handleCreateQuote}
              isLoading={isCreating}
              disabled={!newQuoteData.companyId || !newQuoteData.projectId}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {createError}
            </div>
          )}
          <Select
            label="Firma *"
            value={newQuoteData.companyId}
            onChange={(e) => setNewQuoteData({ ...newQuoteData, companyId: e.target.value, projectId: '' })}
            options={[
              { value: '', label: 'Firma Seçin' },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          <Select
            label="Proje *"
            value={newQuoteData.projectId}
            onChange={(e) => setNewQuoteData({ ...newQuoteData, projectId: e.target.value })}
            options={[
              { value: '', label: isLoadingProjects ? 'Yükleniyor...' : newQuoteData.companyId ? 'Proje Seçin' : 'Önce firma seçin' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            disabled={!newQuoteData.companyId || isLoadingProjects}
          />

          <Input
            label="Konu"
            placeholder="Teklif konusu girin"
            value={newQuoteData.subject}
            onChange={(e) => setNewQuoteData({ ...newQuoteData, subject: e.target.value })}
          />

          <Select
            label="Para Birimi"
            value={newQuoteData.currency}
            onChange={(e) => setNewQuoteData({ ...newQuoteData, currency: e.target.value })}
            options={[
              { value: 'EUR', label: 'EUR' },
              { value: 'USD', label: 'USD' },
              { value: 'GBP', label: 'GBP' },
              { value: 'TRY', label: 'TRY' },
            ]}
          />
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingQuote}
        onClose={() => { setDeletingQuote(null); setDeleteError(''); }}
        title="Teklifi Sil"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDeletingQuote(null); setDeleteError(''); }}>
              İptal
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Sil
            </Button>
          </>
        }
      >
        {deleteError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {deleteError}
          </div>
        ) : (
          <p className="text-primary-700">
            <strong>{deletingQuote?.quoteNumber}</strong> numaralı teklifi silmek istediğinize emin misiniz?
            Bu işlem geri alınamaz.
          </p>
        )}
      </Modal>

      {/* Bulk Status Modal */}
      {showBulkModal && (
        <BulkStatusModal
          quotes={quotes.filter((q) => selectedQuoteIds.has(q.id)).map((q) => ({
            id: q.id,
            quoteNumber: q.quoteNumber,
            status: q.status,
          }))}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false);
            setSelectedQuoteIds(new Set());
            fetchQuotes();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QuoteGroupRows — renders one primary row + optional revision rows   */
/* ------------------------------------------------------------------ */

interface QuoteGroupRowsProps {
  quote: Quote;
  baseNumber: string;
  hasRevisions: boolean;
  isExpanded: boolean;
  onToggleExpand: (baseNumber: string) => void;
  canViewCosts: boolean;
  selectedQuoteIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onNavigate: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (quote: Quote) => void;
  isExpiredFn: (validUntil: string | null | undefined) => boolean;
}

function QuoteGroupRows({
  quote,
  baseNumber,
  hasRevisions,
  isExpanded,
  onToggleExpand,
  canViewCosts,
  selectedQuoteIds,
  onToggleSelection,
  onNavigate,
  onEdit,
  onDelete,
  isExpiredFn,
}: QuoteGroupRowsProps) {
  const rows: React.ReactNode[] = [];

  // --- Primary row ---
  rows.push(
    <tr
      key={quote.id}
      className="cursor-pointer hover:bg-primary-50 transition-colors"
      onClick={() => onNavigate(quote.id)}
    >
      <td onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={selectedQuoteIds.has(quote.id)}
            onChange={() => onToggleSelection(quote.id)}
            className="rounded border-primary-300 cursor-pointer"
          />
        </div>
      </td>
      <td className="font-medium font-mono text-xs tabular-nums">
        <div className="flex items-center gap-1.5">
          {hasRevisions ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(baseNumber);
              }}
              className="p-0.5 rounded hover:bg-primary-200 text-primary-500 cursor-pointer flex-shrink-0"
              title={isExpanded ? 'Daralt' : 'Genişlet'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 flex-shrink-0" />
          )}
          <span>{quote.quoteNumber}</span>
          {quote.version > 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent-100 text-accent-700 leading-none">
              v{quote.version}
            </span>
          )}
        </div>
      </td>
      <td className="text-xs">{quote.company.name}</td>
      <td className="text-xs text-primary-600">
        {quote.project?.name || '-'}
      </td>
      <td className="text-right text-xs tabular-nums font-medium">
        {formatCurrency(quote.grandTotal, quote.currency)}
      </td>
      {canViewCosts && (
        <td className="text-right text-xs tabular-nums">
          {quote.profitMargin != null
            ? `%${Number(quote.profitMargin).toFixed(1)}`
            : '-'}
        </td>
      )}
      <td>
        <div className="flex items-center gap-1.5">
          <Badge variant={statusVariants[quote.status] || 'default'}>
            {quoteStatusLabels[quote.status] || quote.status}
          </Badge>
          {quote.validUntil && isExpiredFn(quote.validUntil) && (
            <span title="Geçerlilik süresi doldu">
              <Clock className="w-3.5 h-3.5 text-red-500" />
            </span>
          )}
        </div>
      </td>
      <td className="text-xs">{quote.createdBy.fullName}</td>
      <td className="text-xs tabular-nums">{formatDate(quote.createdAt)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onNavigate(quote.id)}
            className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
            title="Görüntüle"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(quote.id)}
            className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
            title="Düzenle"
          >
            <FileText className="w-4 h-4" />
          </button>
          {quote.status === 'TASLAK' && (
            <button
              onClick={() => onDelete(quote)}
              className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer"
              title="Sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  // --- Revision sub-rows (when expanded) ---
  if (hasRevisions && isExpanded) {
    for (const rev of quote.revisions!) {
      rows.push(
        <tr
          key={rev.id}
          className="cursor-pointer hover:bg-primary-100 transition-colors bg-primary-50"
          onClick={() => onNavigate(rev.id)}
        >
          {/* Checkbox cell — empty for sub-rows */}
          <td />
          {/* Quote number cell — indented with version label */}
          <td className="pl-8 font-mono text-xs tabular-nums text-primary-500">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-200 text-primary-600 leading-none">
                v{rev.version}
              </span>
              <span>{rev.quoteNumber}</span>
            </div>
          </td>
          {/* Firma — same as parent, show dash */}
          <td className="text-xs text-primary-400">—</td>
          {/* Proje — same as parent, show dash */}
          <td className="text-xs text-primary-400">—</td>
          {/* Tutar */}
          <td className="text-right text-xs tabular-nums text-primary-500">
            {formatCurrency(rev.grandTotal, rev.currency)}
          </td>
          {/* Kar Marjı */}
          {canViewCosts && (
            <td className="text-right text-xs tabular-nums text-primary-400">
              {rev.profitMargin != null
                ? `%${Number(rev.profitMargin).toFixed(1)}`
                : '-'}
            </td>
          )}
          {/* Durum */}
          <td>
            <Badge variant={statusVariants[rev.status] || 'default'}>
              {quoteStatusLabels[rev.status] || rev.status}
            </Badge>
          </td>
          {/* Oluşturan */}
          <td className="text-xs text-primary-500">{rev.createdBy.fullName}</td>
          {/* Tarih */}
          <td className="text-xs tabular-nums text-primary-500">{formatDate(rev.createdAt)}</td>
          {/* İşlemler — minimal for sub-rows */}
          <td onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onNavigate(rev.id)}
              className="p-1.5 rounded hover:bg-primary-100 text-primary-400 cursor-pointer"
              title="Görüntüle"
            >
              <Eye className="w-4 h-4" />
            </button>
          </td>
        </tr>
      );
    }
  }

  return <>{rows}</>;
}
