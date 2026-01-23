'use client';

import { use } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Edit, Printer, Download, Send, CheckCircle,
  Clock, Building2, FileText, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import { Button, Card, Badge, Spinner } from '@/components/ui';
import { quoteStatusLabels } from '@/lib/validations/quote';

interface QuoteItem {
  id: string;
  itemType: 'PRODUCT' | 'HEADING' | 'NOTE';
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
  items: QuoteItem[];
  commercialTerms: CommercialTerm[];
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const currencySymbols: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  TRY: '₺',
};

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

export default function QuoteDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchQuote = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Teklif yüklenemedi');
      }

      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const formatPrice = (price: number | string | { toNumber?: () => number } | null | undefined) => {
    let numPrice = 0;
    if (typeof price === 'number') {
      numPrice = price;
    } else if (typeof price === 'string') {
      numPrice = parseFloat(price) || 0;
    } else if (price && typeof price.toNumber === 'function') {
      numPrice = price.toNumber();
    }
    const symbol = quote ? (currencySymbols[quote.currency] || quote.currency) : '€';
    return `${symbol}${numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleExportPdf = async () => {
    if (!quote) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/quotes/${id}/export/pdf`);
      if (!response.ok) {
        throw new Error('PDF olusturulamadi');
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
      setError(err instanceof Error ? err.message : 'PDF olusturulurken bir hata olustu');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!quote) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/quotes/${id}/export/excel`);
      if (!response.ok) {
        throw new Error('Excel olusturulamadi');
      }

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
      setError(err instanceof Error ? err.message : 'Excel olusturulurken bir hata olustu');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error || 'Teklif bulunamadı'}</p>
        <Button variant="secondary" onClick={() => router.push('/quotes')}>
          <ArrowLeft className="w-4 h-4" />
          Tekliflere Dön
        </Button>
      </div>
    );
  }

  const productItems = quote.items.filter(i => i.itemType === 'PRODUCT');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/quotes')}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-primary-900">{quote.quoteNumber}</h1>
              <Badge variant={statusVariants[quote.status] || 'default'}>
                {quoteStatusLabels[quote.status] || quote.status}
              </Badge>
            </div>
            {quote.subject && (
              <p className="text-primary-600 mt-1">{quote.subject}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Yazdir
          </Button>
          <Button variant="secondary" onClick={handleExportPdf} disabled={isExporting}>
            <Download className="w-4 h-4" />
            PDF
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} disabled={isExporting}>
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
          <Button onClick={() => router.push(`/quotes/${id}/edit`)}>
            <Edit className="w-4 h-4" />
            Duzenle
          </Button>
        </div>
      </div>

      {/* Company & Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-primary-500 mb-2">
              <Building2 className="w-4 h-4" />
              <span className="text-sm font-medium">Firma Bilgileri</span>
            </div>
            <h3 className="text-lg font-semibold text-primary-900">{quote.company.name}</h3>
            {quote.company.address && (
              <p className="text-sm text-primary-600 mt-1">{quote.company.address}</p>
            )}
            {quote.project && (
              <div className="mt-3 pt-3 border-t border-primary-100">
                <span className="text-sm text-primary-500">Proje:</span>
                <span className="text-sm font-medium text-primary-800 ml-2">{quote.project.name}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-primary-500 mb-2">
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">Teklif Bilgileri</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-primary-500">Tarih:</span>
                <span className="font-medium text-primary-800 ml-2">{formatDate(quote.createdAt)}</span>
              </div>
              <div>
                <span className="text-primary-500">Para Birimi:</span>
                <span className="font-medium text-primary-800 ml-2">{quote.currency}</span>
              </div>
              <div>
                <span className="text-primary-500">Geçerlilik:</span>
                <span className="font-medium text-primary-800 ml-2">{quote.validityDays} gün</span>
              </div>
              <div>
                <span className="text-primary-500">Hazırlayan:</span>
                <span className="font-medium text-primary-800 ml-2">{quote.createdBy.fullName}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">Sıra</th>
                <th className="w-24">Kod</th>
                <th>Açıklama</th>
                <th className="w-20 text-center">Miktar</th>
                <th className="w-16 text-center">Birim</th>
                <th className="w-24 text-right">Birim Fiyat</th>
                <th className="w-20 text-center">İsk. %</th>
                <th className="w-16 text-center">KDV %</th>
                <th className="w-28 text-right">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, index) => {
                if (item.itemType === 'HEADING') {
                  return (
                    <tr key={item.id} className="bg-primary-100">
                      <td></td>
                      <td colSpan={8} className="font-semibold text-primary-800">
                        {item.description}
                      </td>
                    </tr>
                  );
                }

                if (item.itemType === 'NOTE') {
                  return (
                    <tr key={item.id} className="bg-amber-50">
                      <td></td>
                      <td colSpan={8} className="text-sm text-primary-700 italic">
                        {item.description}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={item.id}>
                    <td className="text-center text-primary-500">{index + 1}</td>
                    <td className="font-mono text-xs text-primary-600">
                      {item.code || '-'}
                      {item.brand && (
                        <span className="block text-primary-400">{item.brand}</span>
                      )}
                    </td>
                    <td>
                      <span className="text-sm">{item.description}</span>
                      {item.notes && (
                        <p className="text-xs text-primary-500 mt-1 italic">{item.notes}</p>
                      )}
                    </td>
                    <td className="text-center tabular-nums">{item.quantity}</td>
                    <td className="text-center text-sm text-primary-600">{item.unit}</td>
                    <td className="text-right tabular-nums">{formatPrice(item.unitPrice)}</td>
                    <td className="text-center tabular-nums">
                      {item.discountPct > 0 ? `${item.discountPct}%` : '-'}
                    </td>
                    <td className="text-center text-sm text-primary-600">%{item.vatRate}</td>
                    <td className="text-right font-medium tabular-nums">{formatPrice(item.totalPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-primary-200 p-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-primary-600">Ara Toplam</span>
                <span className="font-medium tabular-nums">{formatPrice(quote.subtotal)}</span>
              </div>
              {Number(quote.discountPct) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-primary-600">İskonto ({quote.discountPct}%)</span>
                  <span className="font-medium tabular-nums text-red-600">
                    -{formatPrice(quote.discountTotal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-primary-600">KDV</span>
                <span className="font-medium tabular-nums">{formatPrice(quote.vatTotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-primary-200">
                <span>Genel Toplam</span>
                <span className="text-accent-700 tabular-nums">{formatPrice(quote.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Commercial Terms */}
      {quote.commercialTerms && quote.commercialTerms.length > 0 && (
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-primary-900 mb-4">Ticari Şartlar</h3>
            <div className="space-y-4">
              {quote.commercialTerms.map((term) => (
                <div key={term.id}>
                  <h4 className="font-medium text-primary-800">{term.category}</h4>
                  <p className="text-sm text-primary-600 mt-1 whitespace-pre-wrap">{term.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Notes */}
      {quote.notes && (
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-primary-900 mb-2">Notlar</h3>
            <p className="text-sm text-primary-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
