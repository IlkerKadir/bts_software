'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Target,
  Download,
  Filter,
  Calendar,
  Building2,
  User,
} from 'lucide-react';
import { Button, Select, Card, Badge, Spinner } from '@/components/ui';
import { QuoteStatus } from '@prisma/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { quoteStatusLabels } from '@/lib/validations/quote';

interface Company {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  fullName: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  company: { id: string; name: string };
  project: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string };
  currency: string;
  grandTotal: number;
  status: QuoteStatus;
  createdAt: string;
}

interface ReportData {
  summary: {
    totalQuotes: number;
    totalValue: number;
    avgValue: number;
    winRate: number;
    wonValue: number;
    lostValue: number;
  };
  statusBreakdown: Record<QuoteStatus, { count: number; value: number }>;
  topCompanies: { name: string; count: number; value: number }[];
  topUsers: { name: string; count: number; value: number }[];
  quotes: Quote[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      if (userFilter) params.set('createdById', userFilter);
      params.set('page', String(currentPage));
      params.set('limit', '50');

      const response = await fetch(`/api/reports/quotes?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Rapor verisi yuklenirken bir hata olustu');
        return;
      }

      setReportData(data);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError('Rapor verisi yuklenirken bir hata olustu');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, statusFilter, companyFilter, userFilter, currentPage]);

  const fetchFilters = useCallback(async () => {
    try {
      const [companiesRes, usersRes] = await Promise.all([
        fetch('/api/companies?limit=100'),
        fetch('/api/users?limit=100'),
      ]);

      if (companiesRes.ok) {
        const data = await companiesRes.json();
        setCompanies(data.companies || []);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  }, []);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, statusFilter, companyFilter, userFilter]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      if (userFilter) params.set('createdById', userFilter);

      const response = await fetch(`/api/reports/quotes/export?${params}`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teklif-raporu-${startDate}-${endDate}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  if (isLoading && !reportData) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            onClick={() => fetchReportData()}
            className="text-sm text-red-600 underline ml-4"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Raporlar</h1>
          <p className="text-primary-500">Teklif istatistiklerini ve performansı görüntüleyin</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
            Filtreler
          </Button>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4" />
            Excel İndir
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Başlangıç Tarihi
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Bitiş Tarihi
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
              <Select
                label="Durum"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tüm Durumlar' },
                  ...Object.entries(quoteStatusLabels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
              <Select
                label="Firma"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tüm Firmalar' },
                  ...companies.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <Select
                label="Kullanıcı"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tüm Kullanıcılar' },
                  ...users.map((u) => ({ value: u.id, label: u.fullName })),
                ]}
              />
            </div>
          </div>
        </Card>
      )}

      {reportData && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <div className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-50">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-primary-500">Toplam Teklif</p>
                  <p className="text-2xl font-bold text-primary-900">
                    {reportData.summary.totalQuotes}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-50">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-primary-500">Toplam Değer</p>
                  <p className="text-2xl font-bold text-primary-900">
                    {formatCurrency(reportData.summary.totalValue)}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-50">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-primary-500">Kazanım Oranı</p>
                  <p className="text-2xl font-bold text-primary-900">
                    %{reportData.summary.winRate.toFixed(1)}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-50">
                  <TrendingDown className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-primary-500">Ortalama Değer</p>
                  <p className="text-2xl font-bold text-primary-900">
                    {formatCurrency(reportData.summary.avgValue)}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Status Breakdown and Top Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Breakdown */}
            <Card>
              <div className="p-4 border-b border-primary-200">
                <h3 className="font-semibold text-primary-900">Durum Dağılımı</h3>
              </div>
              <div className="p-4 space-y-3">
                {Object.entries(reportData.statusBreakdown)
                  .filter(([_, data]) => data.count > 0)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([status, data]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge status={status as QuoteStatus} />
                        <span className="text-sm text-primary-600">({data.count})</span>
                      </div>
                      <span className="text-sm font-medium text-primary-900">
                        {formatCurrency(data.value)}
                      </span>
                    </div>
                  ))}
                {Object.values(reportData.statusBreakdown).every((d) => d.count === 0) && (
                  <p className="text-sm text-primary-500 text-center py-4">
                    Veri bulunamadı
                  </p>
                )}
              </div>
            </Card>

            {/* Top Companies */}
            <Card>
              <div className="p-4 border-b border-primary-200">
                <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  En Çok Teklif Verilen Firmalar
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {reportData.topCompanies.map((company, index) => (
                  <div key={company.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-primary-400 w-4">
                        {index + 1}.
                      </span>
                      <span className="text-sm text-primary-700 truncate max-w-[150px]">
                        {company.name}
                      </span>
                      <span className="text-xs text-primary-400">({company.count})</span>
                    </div>
                    <span className="text-sm font-medium text-primary-900">
                      {formatCurrency(company.value)}
                    </span>
                  </div>
                ))}
                {reportData.topCompanies.length === 0 && (
                  <p className="text-sm text-primary-500 text-center py-4">
                    Veri bulunamadı
                  </p>
                )}
              </div>
            </Card>

            {/* Top Users */}
            <Card>
              <div className="p-4 border-b border-primary-200">
                <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Kullanıcı Performansı
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {reportData.topUsers.map((user, index) => (
                  <div key={user.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-primary-400 w-4">
                        {index + 1}.
                      </span>
                      <span className="text-sm text-primary-700">{user.name}</span>
                      <span className="text-xs text-primary-400">({user.count})</span>
                    </div>
                    <span className="text-sm font-medium text-primary-900">
                      {formatCurrency(user.value)}
                    </span>
                  </div>
                ))}
                {reportData.topUsers.length === 0 && (
                  <p className="text-sm text-primary-500 text-center py-4">
                    Veri bulunamadı
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Quotes Table */}
          <Card>
            <div className="p-4 border-b border-primary-200 flex items-center justify-between">
              <h3 className="font-semibold text-primary-900">Teklif Listesi</h3>
              <span className="text-sm text-primary-500">
                {reportData.pagination ? reportData.pagination.total : reportData.quotes.length} teklif
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Teklif No</th>
                    <th>Firma</th>
                    <th>Proje</th>
                    <th>Hazırlayan</th>
                    <th className="text-right">Tutar</th>
                    <th>Durum</th>
                    <th>Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td className="font-medium">{quote.quoteNumber}</td>
                      <td>{quote.company.name}</td>
                      <td>{quote.project?.name || '-'}</td>
                      <td>{quote.createdBy.fullName}</td>
                      <td className="text-right tabular-nums">
                        {formatCurrency(quote.grandTotal, quote.currency)}
                      </td>
                      <td>
                        <Badge status={quote.status} />
                      </td>
                      <td className="text-sm text-primary-500">
                        {formatDate(quote.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {reportData.quotes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-primary-500">
                        Seçili kriterlere uygun teklif bulunamadı
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {reportData.pagination && reportData.pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-primary-200 flex items-center justify-between">
                <p className="text-sm text-primary-500">
                  Sayfa {reportData.pagination.page} / {reportData.pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Önceki
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === reportData.pagination.totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
