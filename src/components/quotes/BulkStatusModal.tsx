'use client';

import { useState } from 'react';
import { X, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button, Badge, Spinner } from '@/components/ui';

interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
}

interface BulkStatusModalProps {
  quotes: Quote[];
  onClose: () => void;
  onSuccess: () => void;
}

const statusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

const ALLOWED_BULK_TRANSITIONS: Record<string, string[]> = {
  TASLAK: ['IPTAL'],
  ONAY_BEKLIYOR: ['IPTAL'],
  ONAYLANDI: ['GONDERILDI', 'IPTAL'],
  GONDERILDI: ['TAKIPTE', 'KAZANILDI', 'KAYBEDILDI'],
  TAKIPTE: ['KAZANILDI', 'KAYBEDILDI'],
};

export function BulkStatusModal({
  quotes,
  onClose,
  onSuccess,
}: BulkStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    success: { id: string; quoteNumber: string }[];
    failed: { id: string; quoteNumber: string; reason: string }[];
  } | null>(null);

  // Get common available transitions
  const getAvailableStatuses = () => {
    const statusCounts: Record<string, number> = {};
    quotes.forEach((q) => {
      statusCounts[q.status] = (statusCounts[q.status] || 0) + 1;
    });

    // If all quotes have the same status, return transitions for that status
    const statuses = Object.keys(statusCounts);
    if (statuses.length === 1) {
      return ALLOWED_BULK_TRANSITIONS[statuses[0]] || [];
    }

    // Otherwise, find common transitions
    const allTransitions = statuses.map(
      (s) => new Set(ALLOWED_BULK_TRANSITIONS[s] || [])
    );
    const common = allTransitions.reduce((a, b) =>
      new Set([...a].filter((x) => b.has(x)))
    );
    return Array.from(common);
  };

  const availableStatuses = getAvailableStatuses();

  const handleApply = async () => {
    if (!selectedStatus) {
      setError('Lütfen bir durum seçin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/quotes/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteIds: quotes.map((q) => q.id),
          status: selectedStatus,
          note: note || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Güncelleme başarısız');
      }

      setResults(data.results);

      if (data.results.failed.length === 0) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-primary-200">
          <h2 className="text-lg font-semibold text-primary-900">
            Toplu Durum Değişikliği
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-primary-100 rounded cursor-pointer"
          >
            <X className="w-5 h-5 text-primary-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto">
          {results ? (
            // Results view
            <div className="space-y-4">
              {results.success.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800">
                      {results.success.length} teklif güncellendi
                    </span>
                  </div>
                  <div className="text-sm text-green-700">
                    {results.success.map((s) => s.quoteNumber).join(', ')}
                  </div>
                </div>
              )}

              {results.failed.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-800">
                      {results.failed.length} teklif güncellenemedi
                    </span>
                  </div>
                  <div className="space-y-1">
                    {results.failed.map((f) => (
                      <div key={f.id} className="text-sm text-red-700">
                        <span className="font-mono">{f.quoteNumber}</span>: {f.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Form view
            <div className="space-y-4">
              {/* Selected quotes */}
              <div className="bg-primary-50 rounded-lg p-3">
                <p className="text-sm text-primary-700">
                  <span className="font-semibold">{quotes.length}</span> teklif seçildi
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {quotes.slice(0, 5).map((q) => (
                    <Badge key={q.id} variant="default" className="text-xs">
                      {q.quoteNumber}
                    </Badge>
                  ))}
                  {quotes.length > 5 && (
                    <Badge variant="default" className="text-xs">
                      +{quotes.length - 5}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Status selection */}
              {availableStatuses.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-2">
                    Yeni Durum
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="">Seçiniz...</option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status] || status}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span className="text-sm text-amber-800">
                      Seçilen teklifler için ortak durum geçişi bulunmuyor
                    </span>
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  Not (opsiyonel)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Durum değişikliği hakkında not..."
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                  rows={3}
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-primary-200">
          {results ? (
            <Button onClick={results.failed.length > 0 ? onClose : onSuccess}>
              Kapat
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                İptal
              </Button>
              <Button
                onClick={handleApply}
                disabled={isLoading || !selectedStatus || availableStatuses.length === 0}
              >
                {isLoading ? <Spinner size="sm" /> : 'Uygula'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
