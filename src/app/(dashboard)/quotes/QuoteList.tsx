'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Eye, FileText, Clock } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { quoteStatusLabels } from '@/lib/validations/quote';

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
  status: string;
  validUntil?: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface QuoteListProps {
  userId: string;
  canApprove: boolean;
  canViewCosts: boolean;
}

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

export function QuoteList({ userId, canApprove, canViewCosts }: QuoteListProps) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
  const [newQuoteData, setNewQuoteData] = useState({ companyId: '', projectId: '', currency: 'EUR' });
  const [isCreating, setIsCreating] = useState(false);

  const fetchQuotes = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/quotes?${params}`);
      const data = await response.json();

      if (response.ok) {
        setQuotes(data.quotes);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, companyFilter]);

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
    const debounce = setTimeout(() => {
      fetchQuotes();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchQuotes]);

  const handleCreateQuote = async () => {
    if (!newQuoteData.companyId) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuoteData),
      });

      const data = await response.json();

      if (response.ok) {
        setIsNewQuoteModalOpen(false);
        setNewQuoteData({ companyId: '', projectId: '', currency: 'EUR' });
        // Navigate to quote editor
        router.push(`/quotes/${data.quote.id}/edit`);
      }
    } catch (error) {
      console.error('Error creating quote:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const formatPrice = (price: number | { toNumber: () => number }, currency: string) => {
    const numPrice = typeof price === 'number' ? price : price.toNumber();
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(numPrice);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const isExpired = (validUntil: string | null | undefined) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Teklifler</h1>
          <p className="text-primary-500">Tüm teklifleri yönetin</p>
        </div>
        <Button onClick={() => setIsNewQuoteModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Yeni Teklif
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4">
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
              ...companies.map(c => ({ value: c.id, label: c.name })),
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
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Firma</th>
                <th>Proje</th>
                <th className="text-right">Tutar</th>
                <th>Durum</th>
                <th>Oluşturan</th>
                <th>Tarih</th>
                <th className="w-24">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-primary-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-primary-500">
                    Teklif bulunamadı
                  </td>
                </tr>
              ) : (
                quotes.map((quote) => (
                  <tr key={quote.id} className="cursor-pointer hover:bg-primary-50">
                    <td className="font-medium font-mono text-sm">{quote.quoteNumber}</td>
                    <td>{quote.company.name}</td>
                    <td>{quote.project?.name || '-'}</td>
                    <td className="text-right tabular-nums">
                      {formatPrice(quote.grandTotal, quote.currency)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariants[quote.status] || 'default'}>
                          {quoteStatusLabels[quote.status] || quote.status}
                        </Badge>
                        {quote.validUntil && isExpired(quote.validUntil) && (
                          <span title="Geçerlilik süresi doldu">
                            <Clock className="w-4 h-4 text-red-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{quote.createdBy.fullName}</td>
                    <td>{formatDate(quote.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/quotes/${quote.id}`)}
                          className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                          title="Görüntüle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/quotes/${quote.id}/edit`)}
                          className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                          title="Düzenle"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
            <div className="flex gap-2">
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
              disabled={!newQuoteData.companyId}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Firma *"
            value={newQuoteData.companyId}
            onChange={(e) => setNewQuoteData({ ...newQuoteData, companyId: e.target.value })}
            options={[
              { value: '', label: 'Firma Seçin' },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
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
    </div>
  );
}
