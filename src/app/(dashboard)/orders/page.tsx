'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Eye,
  ClipboardCheck,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button, Select, Card, Badge } from '@/components/ui';

interface Company {
  id: string;
  name: string;
}

interface Order {
  id: string;
  orderNumber: string;
  quote: {
    id: string;
    quoteNumber: string;
    subject?: string | null;
    currency: string;
    grandTotal: number | { toNumber?: () => number };
  };
  company: { id: string; name: string };
  status: string;
  notes?: string | null;
  deliveryDate?: string | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const orderStatusLabels: Record<string, string> = {
  HAZIRLANIYOR: 'Hazirlaniyor',
  ONAYLANDI: 'Onaylandi',
  GONDERILDI: 'Gonderildi',
  TAMAMLANDI: 'Tamamlandi',
  IPTAL: 'Iptal',
};

const orderStatusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  HAZIRLANIYOR: 'default',
  ONAYLANDI: 'info',
  GONDERILDI: 'warning',
  TAMAMLANDI: 'success',
  IPTAL: 'error',
};

const statusOptions = [
  { value: '', label: 'Tum Durumlar' },
  { value: 'HAZIRLANIYOR', label: 'Hazirlaniyor' },
  { value: 'ONAYLANDI', label: 'Onaylandi' },
  { value: 'GONDERILDI', label: 'Gonderildi' },
  { value: 'TAMAMLANDI', label: 'Tamamlandi' },
  { value: 'IPTAL', label: 'Iptal' },
];

type SortField = 'orderNumber' | 'company' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const fetchOrders = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyId', companyFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/orders?${params}`);
      const data = await response.json();

      if (response.ok) {
        setOrders(data.orders);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
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
      fetchOrders();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchOrders]);

  const formatPrice = (price: number | string | { toNumber?: () => number } | null | undefined, currency: string) => {
    let numPrice = 0;
    if (typeof price === 'number') {
      numPrice = price;
    } else if (typeof price === 'string') {
      numPrice = parseFloat(price) || 0;
    } else if (price && typeof price.toNumber === 'function') {
      numPrice = price.toNumber();
    }
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(numPrice);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'orderNumber':
        return dir * a.orderNumber.localeCompare(b.orderNumber, 'tr');
      case 'company':
        return dir * a.company.name.localeCompare(b.company.name, 'tr');
      case 'status':
        return dir * a.status.localeCompare(b.status, 'tr');
      case 'createdAt':
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default:
        return 0;
    }
  });

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Siparisler</h1>
          <p className="text-sm text-primary-500">Siparis teyitlerini yonetin</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input
                type="text"
                placeholder="Siparis no, firma veya teklif no ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <Select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              options={[
                { value: '', label: 'Tum Firmalar' },
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
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('orderNumber')}
                >
                  <div className="flex items-center">
                    Siparis No
                    <SortIcon field="orderNumber" />
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
                <th>Teklif No</th>
                <th className="text-right">Tutar</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Durum
                    <SortIcon field="status" />
                  </div>
                </th>
                <th>Teslim Tarihi</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center">
                    Tarih
                    <SortIcon field="createdAt" />
                  </div>
                </th>
                <th className="w-20">Islemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-primary-500">
                    Yukleniyor...
                  </td>
                </tr>
              ) : sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-primary-500">
                    Siparis bulunamadi
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer hover:bg-primary-50 transition-colors"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    <td className="font-medium font-mono text-xs tabular-nums">
                      {order.orderNumber}
                    </td>
                    <td className="text-xs">{order.company.name}</td>
                    <td className="text-xs text-primary-600">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/quotes/${order.quote.id}`);
                        }}
                        className="text-accent-600 hover:underline cursor-pointer"
                      >
                        {order.quote.quoteNumber}
                      </button>
                    </td>
                    <td className="text-right text-xs tabular-nums font-medium">
                      {formatPrice(order.quote.grandTotal, order.quote.currency)}
                    </td>
                    <td>
                      <Badge variant={orderStatusVariants[order.status] || 'default'}>
                        {orderStatusLabels[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="text-xs tabular-nums">
                      {order.deliveryDate ? formatDate(order.deliveryDate) : '-'}
                    </td>
                    <td className="text-xs tabular-nums">{formatDate(order.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                        title="Goruntule"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
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
              Toplam {pagination.total} siparis
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-500">
                Sayfa {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchOrders(pagination.page - 1)}
              >
                Onceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchOrders(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
