'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  Clock,
  DollarSign,
  Percent,
  TrendingDown,
} from 'lucide-react';
import { Button, Card, Badge, Spinner } from '@/components/ui';

interface Quote {
  id: string;
  quoteNumber: string;
  subject?: string | null;
  currency: string;
  grandTotal: number;
  createdAt: string;
  company: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    fullName: string;
  };
}

interface ApprovalMetrics {
  totalValue: number;
  maxDiscountPct: number;
  minKatsayi: number | null;
}

interface QuoteWithApproval extends Quote {
  approvalCheck?: {
    needsApproval: boolean;
    reasons: string[];
    reasonLabels: string[];
    metrics: ApprovalMetrics;
  };
}

const currencySymbols: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  TRY: '₺',
};

const reasonIcons: Record<string, typeof AlertTriangle> = {
  HIGH_VALUE: DollarSign,
  HIGH_DISCOUNT: Percent,
  LOW_KATSAYI: TrendingDown,
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteWithApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingQuotes = useCallback(async () => {
    try {
      // Fetch quotes with ONAY_BEKLIYOR status
      const response = await fetch('/api/quotes?status=ONAY_BEKLIYOR');
      if (response.ok) {
        const data = await response.json();
        const quotesData = data.quotes || [];

        // Fetch approval check for each quote
        const quotesWithApproval = await Promise.all(
          quotesData.map(async (quote: Quote) => {
            try {
              const statusResponse = await fetch(`/api/quotes/${quote.id}/status`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                return { ...quote, approvalCheck: statusData.approvalCheck };
              }
            } catch {
              // Ignore errors
            }
            return quote;
          })
        );

        setQuotes(quotesWithApproval);
      }
    } catch (error) {
      console.error('Failed to fetch pending quotes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingQuotes();
  }, [fetchPendingQuotes]);

  const handleApprove = async (quoteId: string) => {
    setProcessingId(quoteId);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ONAYLANDI' }),
      });

      if (response.ok) {
        setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
      } else {
        const data = await response.json();
        alert(data.error || 'Onaylama işlemi başarısız');
      }
    } catch (error) {
      console.error('Approval error:', error);
      alert('Bir hata oluştu');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (quoteId: string) => {
    const note = prompt('Revizyon nedeni:');
    if (!note) return;

    setProcessingId(quoteId);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVIZYON', note }),
      });

      if (response.ok) {
        setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
      } else {
        const data = await response.json();
        alert(data.error || 'Reddetme işlemi başarısız');
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('Bir hata oluştu');
    } finally {
      setProcessingId(null);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${price.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-warning-600" />
          <h1 className="text-2xl font-bold text-primary-900">Onay Bekleyen Teklifler</h1>
          {quotes.length > 0 && (
            <Badge variant="warning">{quotes.length} teklif</Badge>
          )}
        </div>
      </div>

      {/* Quotes List */}
      {quotes.length > 0 ? (
        <div className="grid gap-4">
          {quotes.map((quote) => (
            <Card key={quote.id}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Quote Info */}
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => router.push(`/quotes/${quote.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm font-semibold text-accent-700">
                        {quote.quoteNumber}
                      </span>
                      <span className="text-lg font-bold text-primary-900">
                        {formatPrice(quote.grandTotal, quote.currency)}
                      </span>
                    </div>

                    {quote.subject && (
                      <p className="text-primary-700 mb-2">{quote.subject}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-primary-500">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        {quote.company.name}
                      </div>
                      <div>Hazırlayan: {quote.createdBy.fullName}</div>
                      <div>{formatDate(quote.createdAt)}</div>
                    </div>

                    {/* Approval Reasons */}
                    {quote.approvalCheck?.needsApproval && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {quote.approvalCheck.reasons.map((reason, idx) => {
                          const Icon = reasonIcons[reason] || AlertTriangle;
                          return (
                            <Badge key={reason} variant="warning" className="text-xs">
                              <Icon className="w-3 h-3 mr-1" />
                              {quote.approvalCheck!.reasonLabels[idx]}
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    {/* Metrics */}
                    {quote.approvalCheck?.metrics && (
                      <div className="flex gap-4 mt-3 text-xs text-primary-500">
                        <span>
                          Toplam: {formatPrice(quote.approvalCheck.metrics.totalValue, quote.currency)}
                        </span>
                        <span>
                          Maks. İskonto: %{quote.approvalCheck.metrics.maxDiscountPct.toFixed(1)}
                        </span>
                        {quote.approvalCheck.metrics.minKatsayi !== null && (
                          <span>
                            Min. Katsayı: {quote.approvalCheck.metrics.minKatsayi.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleReject(quote.id)}
                      disabled={processingId === quote.id}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Revizyon
                    </Button>
                    <Button
                      onClick={() => handleApprove(quote.id)}
                      disabled={processingId === quote.id}
                    >
                      {processingId === quote.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Onayla
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary-900 mb-2">
              Tüm teklifler onaylandı!
            </h2>
            <p className="text-primary-600">
              Şu anda onay bekleyen teklif bulunmuyor.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
