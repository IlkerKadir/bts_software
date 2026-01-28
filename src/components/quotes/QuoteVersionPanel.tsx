'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Clock,
  ArrowLeftRight,
  RotateCcw,
  Check,
  Eye,
} from 'lucide-react';
import { Button, Badge, Spinner, Modal } from '@/components/ui';
import { QuoteCompareModal } from './QuoteCompareModal';

interface Revision {
  id: string;
  quoteNumber: string;
  version: number;
  status: string;
  grandTotal: number;
  currency: string;
  parentQuoteId: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
  };
}

interface QuoteVersionPanelProps {
  quoteId: string;
  currentVersion: number;
  onRevert?: (newQuoteId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
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

export function QuoteVersionPanel({
  quoteId,
  currentVersion,
  onRevert,
}: QuoteVersionPanelProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedForCompare, setSelectedForCompare] = useState<string | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const fetchRevisions = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/revisions`);
      if (response.ok) {
        const data = await response.json();
        setRevisions(data.revisions || []);
      }
    } catch (error) {
      console.error('Failed to fetch revisions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchRevisions();
  }, [fetchRevisions]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleRevert = async (sourceQuoteId: string) => {
    if (!confirm('Bu versiyona geri dönmek istediğinize emin misiniz? Yeni bir revizyon oluşturulacak.')) {
      return;
    }

    setRevertingId(sourceQuoteId);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceQuoteId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (onRevert && data.quote?.id) {
          onRevert(data.quote.id);
        }
        fetchRevisions();
      }
    } catch (error) {
      console.error('Revert error:', error);
    } finally {
      setRevertingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (revisions.length <= 1) {
    return (
      <div className="text-center py-8 text-primary-500">
        <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Bu teklifin tek versiyonu var</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary-900 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Versiyon Geçmişi
        </h3>
        <span className="text-sm text-primary-500">
          {revisions.length} versiyon
        </span>
      </div>

      <div className="space-y-3">
        {revisions.map((revision) => {
          const isCurrent = revision.id === quoteId;

          return (
            <div
              key={revision.id}
              className={`
                p-4 rounded-lg border transition-colors
                ${isCurrent
                  ? 'bg-accent-50 border-accent-200'
                  : 'bg-white border-primary-200 hover:border-primary-300'
                }
              `}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-primary-900">
                      v{revision.version}
                    </span>
                    {isCurrent && (
                      <Badge variant="info" className="text-xs">
                        <Check className="w-3 h-3 mr-1" />
                        Mevcut
                      </Badge>
                    )}
                    <Badge status={revision.status as any} />
                  </div>

                  <div className="flex items-center gap-4 text-sm text-primary-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(revision.createdAt)}
                    </span>
                    <span>{revision.createdBy.fullName}</span>
                  </div>

                  <div className="mt-2 font-medium text-primary-900">
                    {formatCurrency(revision.grandTotal, revision.currency)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isCurrent && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedForCompare(revision.id);
                          setCompareModalOpen(true);
                        }}
                        title="Karşılaştır"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`/quotes/${revision.id}`, '_blank')}
                        title="Görüntüle"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevert(revision.id)}
                        disabled={revertingId === revision.id}
                        title="Bu versiyona geri dön"
                      >
                        {revertingId === revision.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {compareModalOpen && selectedForCompare && (
        <QuoteCompareModal
          isOpen={compareModalOpen}
          onClose={() => {
            setCompareModalOpen(false);
            setSelectedForCompare(null);
          }}
          quoteId={quoteId}
          compareId={selectedForCompare}
        />
      )}
    </div>
  );
}
