'use client';

import { use } from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  FileText,
  AlertCircle,
  ClipboardCheck,
  Calendar,
  User,
  Package,
  Folder,
} from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Badge, Spinner, Select } from '@/components/ui';

interface QuoteItem {
  id: string;
  itemType: string;
  sortOrder: number;
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  notes?: string | null;
  deliveryDate?: string | null;
  createdAt: string;
  updatedAt: string;
  quote: {
    id: string;
    quoteNumber: string;
    subject?: string | null;
    currency: string;
    grandTotal: number;
    company: { id: string; name: string; address?: string | null };
    project?: { id: string; name: string } | null;
    items: QuoteItem[];
    createdBy: { id: string; fullName: string };
  };
  company: { id: string; name: string; address?: string | null };
  createdBy: { id: string; fullName: string };
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

const currencySymbols: Record<string, string> = {
  EUR: '\u20AC',
  USD: '$',
  GBP: '\u00A3',
  TRY: '\u20BA',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Siparis yuklenemedi');
      }

      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Durum guncellenemedi');
      }

      await fetchOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatPrice = useCallback(
    (price: number | string | { toNumber?: () => number } | null | undefined) => {
      const numPrice = Number(price) || 0;
      const symbol = order ? (currencySymbols[order.quote.currency] || order.quote.currency) : '\u20AC';
      return `${symbol}${numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [order],
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Build POZ NO mapping
  const pozMap = useMemo(() => {
    if (!order) return new Map<string, number>();
    const map = new Map<string, number>();
    let counter = 1;
    for (const item of order.quote.items) {
      if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SERVICE') {
        map.set(item.id, counter);
        counter++;
      }
    }
    return map;
  }, [order]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error}</p>
        <Button variant="secondary" onClick={() => router.push('/orders')}>
          <ArrowLeft className="w-4 h-4" />
          Siparislere Don
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">Siparis bulunamadi</p>
        <Button variant="secondary" onClick={() => router.push('/orders')}>
          <ArrowLeft className="w-4 h-4" />
          Siparislere Don
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/orders')}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-primary-900">{order.orderNumber}</h1>
              <Badge variant={orderStatusVariants[order.status] || 'default'}>
                {orderStatusLabels[order.status] || order.status}
              </Badge>
            </div>
            {order.quote.subject && (
              <p className="text-primary-600 mt-1">{order.quote.subject}</p>
            )}
          </div>
        </div>

        {/* Status change */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            options={[
              { value: 'HAZIRLANIYOR', label: 'Hazirlaniyor' },
              { value: 'ONAYLANDI', label: 'Onaylandi' },
              { value: 'GONDERILDI', label: 'Gonderildi' },
              { value: 'TAMAMLANDI', label: 'Tamamlandi' },
              { value: 'IPTAL', label: 'Iptal' },
            ]}
            disabled={isUpdating}
            className="w-48"
          />
          <Button
            variant="secondary"
            onClick={() => router.push(`/quotes/${order.quote.id}`)}
          >
            <FileText className="w-4 h-4" />
            Teklifi Gor
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

      {/* Info Cards */}
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
                <p className="text-xs text-primary-500">Musteri detaylari</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <h4 className="text-lg font-semibold text-primary-900">{order.company.name}</h4>
            {order.company.address && (
              <p className="text-sm text-primary-600 mt-1">{order.company.address}</p>
            )}
            {order.quote.project && (
              <div className="mt-4 pt-3 border-t border-primary-100 flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary-400" />
                <span className="text-sm text-primary-500">Proje:</span>
                <span className="text-sm font-medium text-primary-800">{order.quote.project.name}</span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Order Meta Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Siparis Bilgileri</h3>
                <p className="text-xs text-primary-500">Tarih ve detaylar</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Teklif:</span>
                <button
                  onClick={() => router.push(`/quotes/${order.quote.id}`)}
                  className="font-medium text-accent-600 hover:underline cursor-pointer"
                >
                  {order.quote.quoteNumber}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Tutar:</span>
                <span className="font-medium text-primary-800">
                  {formatPrice(order.quote.grandTotal)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Olusturma:</span>
                <span className="font-medium text-primary-800">{formatDate(order.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Teslim:</span>
                <span className="font-medium text-primary-800">
                  {order.deliveryDate ? formatDate(order.deliveryDate) : '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-primary-400" />
                <span className="text-primary-500">Olusturan:</span>
                <span className="font-medium text-primary-800">{order.createdBy.fullName}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Notes */}
      {order.notes && (
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
            <p className="text-sm text-primary-700 whitespace-pre-wrap leading-relaxed">{order.notes}</p>
          </CardBody>
        </Card>
      )}

      {/* Quote Items Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Siparis Kalemleri</h3>
              <p className="text-xs text-primary-500">
                Bagli teklifteki kalemler ({order.quote.quoteNumber})
              </p>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-accent-800 text-white text-xs uppercase tracking-wider">
                <th className="px-3 py-2.5 text-center whitespace-nowrap w-16">Poz No</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Aciklama</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-20">Miktar</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap w-16">Birim</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Birim Fiyat</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap w-28">Toplam Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {order.quote.items.map((item) => {
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
                      {formatPrice(Number(item.totalPrice))}
                    </td>
                  </tr>
                );
              })}

              {order.quote.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-accent-500">
                    Kalem bulunamadi.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Grand total footer */}
            <tfoot className="bg-accent-50 text-sm">
              <tr className="border-t-2 border-accent-400">
                <td colSpan={5} className="px-3 py-2.5 text-right text-base font-bold text-accent-900">
                  GENEL TOPLAM
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-base font-bold text-accent-900 whitespace-nowrap">
                  {formatPrice(order.quote.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
