'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import { Badge, Spinner } from '@/components/ui';

interface PriceHistoryEntry {
  id: string;
  quoteId: string;
  quoteNumber: string;
  company: string;
  currency: string;
  status: string;
  date: string;
  listPrice: number;
  katsayi: number;
  unitPrice: number;
  quantity: number;
  discountPct: number;
}

interface PriceStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

interface PriceHistoryProps {
  productId: string;
  currentPrice?: number;
  currency?: string;
  onApplyPrice?: (unitPrice: number, katsayi: number) => void;
}

const statusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
};

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TASLAK: 'default',
  ONAY_BEKLIYOR: 'warning',
  ONAYLANDI: 'info',
  GONDERILDI: 'info',
  TAKIPTE: 'warning',
  KAZANILDI: 'success',
  KAYBEDILDI: 'error',
};

export function PriceHistory({ productId, currentPrice, currency = 'EUR', onApplyPrice }: PriceHistoryProps) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/products/${productId}/price-history?limit=10`);
        const data = await response.json();

        if (response.ok) {
          setHistory(data.history || []);
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Error fetching price history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [productId]);

  const formatPrice = (price: number | string | null | undefined, cur: string = currency) => {
    const numPrice = typeof price === 'number' ? price : (typeof price === 'string' ? parseFloat(price) || 0 : 0);
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', TRY: '₺' };
    const symbol = symbols[cur] || cur;
    return `${symbol}${numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPriceTrend = (price: number) => {
    if (!currentPrice || !stats) return null;
    const diff = ((price - stats.avg) / stats.avg) * 100;
    if (Math.abs(diff) < 2) return { icon: Minus, color: 'text-primary-500', label: 'Ortalama' };
    if (diff > 0) return { icon: TrendingUp, color: 'text-green-600', label: `+${diff.toFixed(1)}%` };
    return { icon: TrendingDown, color: 'text-red-600', label: `${diff.toFixed(1)}%` };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-primary-500">
        <p>Bu ürün için fiyat geçmişi bulunamadı.</p>
        <p className="text-sm mt-1">İlk teklif bu olacak!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-primary-50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-primary-500 uppercase tracking-wide">En Düşük</p>
            <p className="text-lg font-semibold text-green-600 tabular-nums">
              {formatPrice(stats.min)}
            </p>
          </div>
          <div className="text-center border-x border-primary-200">
            <p className="text-xs text-primary-500 uppercase tracking-wide">Ortalama</p>
            <p className="text-lg font-semibold text-primary-900 tabular-nums">
              {formatPrice(stats.avg)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-primary-500 uppercase tracking-wide">En Yüksek</p>
            <p className="text-lg font-semibold text-red-600 tabular-nums">
              {formatPrice(stats.max)}
            </p>
          </div>
        </div>
      )}

      {/* Current Price Comparison */}
      {currentPrice && stats && (
        <div className="p-3 bg-accent-50 rounded-lg border border-accent-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary-600">Mevcut Fiyat</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-accent-700 tabular-nums">
                {formatPrice(currentPrice)}
              </span>
              {(() => {
                const diff = ((currentPrice - stats.avg) / stats.avg) * 100;
                if (Math.abs(diff) < 2) return null;
                return (
                  <span className={diff > 0 ? 'text-red-600 text-sm' : 'text-green-600 text-sm'}>
                    ({diff > 0 ? '+' : ''}{diff.toFixed(1)}% ort.)
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-primary-700">Son Teklifler ({stats?.count || 0})</h4>
        <div className="divide-y divide-primary-100 border border-primary-200 rounded-lg overflow-hidden">
          {history.map((entry) => {
            const trend = getPriceTrend(entry.unitPrice);
            return (
              <div
                key={entry.id}
                className="p-3 hover:bg-primary-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-accent-700">
                        {entry.quoteNumber}
                      </span>
                      <Badge
                        variant={statusVariants[entry.status] || 'default'}
                        className="text-xs"
                      >
                        {statusLabels[entry.status] || entry.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-primary-800 truncate mt-1">
                      {entry.company}
                    </p>
                    <p className="text-xs text-primary-500 mt-0.5">
                      {formatDate(entry.date)} • {entry.quantity} adet • K: {entry.katsayi}
                      {entry.discountPct > 0 && ` • İsk: %${entry.discountPct}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-primary-900 tabular-nums">
                      {formatPrice(entry.unitPrice, entry.currency)}
                    </p>
                    {trend && (
                      <div className={`flex items-center justify-end gap-1 text-xs ${trend.color}`}>
                        <trend.icon className="w-3 h-3" />
                        <span>{trend.label}</span>
                      </div>
                    )}
                    {onApplyPrice && (
                      <button
                        type="button"
                        onClick={() => onApplyPrice(Number(entry.unitPrice), Number(entry.katsayi))}
                        className="text-xs text-accent-600 hover:text-accent-800 hover:underline cursor-pointer mt-1"
                      >
                        Uygula
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
