'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Minus,
  Edit3,
  ArrowRight,
} from 'lucide-react';
import { Modal, Badge, Spinner } from '@/components/ui';

interface QuoteCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  compareId: string;
}

interface QuoteSummary {
  id: string;
  quoteNumber: string;
  version: number;
  status: string;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  grandTotal: number;
  currency: string;
}

interface HeaderChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface ItemDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldItem?: {
    id: string;
    code: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  };
  newItem?: {
    id: string;
    code: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  };
  changes?: HeaderChange[];
}

interface CompareData {
  oldQuote: QuoteSummary;
  newQuote: QuoteSummary;
  headerChanges: HeaderChange[];
  itemDiffs: ItemDiff[];
  summary: {
    addedItems: number;
    removedItems: number;
    modifiedItems: number;
    unchangedItems: number;
    totalChanges: number;
  };
}

export function QuoteCompareModal({
  isOpen,
  onClose,
  quoteId,
  compareId,
}: QuoteCompareModalProps) {
  const [data, setData] = useState<CompareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchComparison = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/quotes/${quoteId}/compare/${compareId}`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        } else {
          const err = await response.json();
          setError(err.error || 'Karşılaştırma yapılamadı');
        }
      } catch (err) {
        setError('Karşılaştırma yapılırken bir hata oluştu');
      } finally {
        setIsLoading(false);
      }
    };

    fetchComparison();
  }, [isOpen, quoteId, compareId]);

  const formatCurrency = (value: number | unknown, currency = 'EUR') => {
    const numValue = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getDiffIcon = (type: string) => {
    switch (type) {
      case 'added':
        return <Plus className="w-4 h-4 text-success-600" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-error-600" />;
      case 'modified':
        return <Edit3 className="w-4 h-4 text-warning-600" />;
      default:
        return null;
    }
  };

  const getDiffBgClass = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-success-50 border-success-200';
      case 'removed':
        return 'bg-error-50 border-error-200';
      case 'modified':
        return 'bg-warning-50 border-warning-200';
      default:
        return 'bg-white border-primary-200';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Versiyon Karşılaştırması"
      size="xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-error-600">
          <p>{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Header comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-primary-50 border border-primary-200">
              <div className="text-sm text-primary-500 mb-1">Eski Versiyon</div>
              <div className="font-semibold text-lg text-primary-900">
                v{data.oldQuote.version}
              </div>
              <div className="text-sm text-primary-600">
                {formatDate(data.oldQuote.createdAt)}
              </div>
              <div className="mt-2 text-lg font-medium text-primary-900">
                {formatCurrency(data.oldQuote.grandTotal, data.oldQuote.currency)}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-accent-50 border border-accent-200">
              <div className="text-sm text-accent-600 mb-1">Yeni Versiyon</div>
              <div className="font-semibold text-lg text-primary-900">
                v{data.newQuote.version}
              </div>
              <div className="text-sm text-primary-600">
                {formatDate(data.newQuote.createdAt)}
              </div>
              <div className="mt-2 text-lg font-medium text-primary-900">
                {formatCurrency(data.newQuote.grandTotal, data.newQuote.currency)}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-center gap-4 py-2">
            {data.summary.addedItems > 0 && (
              <Badge variant="success">
                <Plus className="w-3 h-3 mr-1" />
                {data.summary.addedItems} eklenen
              </Badge>
            )}
            {data.summary.removedItems > 0 && (
              <Badge variant="error">
                <Minus className="w-3 h-3 mr-1" />
                {data.summary.removedItems} silinen
              </Badge>
            )}
            {data.summary.modifiedItems > 0 && (
              <Badge variant="warning">
                <Edit3 className="w-3 h-3 mr-1" />
                {data.summary.modifiedItems} değişen
              </Badge>
            )}
            {data.summary.totalChanges === 0 && (
              <span className="text-sm text-primary-500">Değişiklik yok</span>
            )}
          </div>

          {/* Header changes */}
          {data.headerChanges.length > 0 && (
            <div>
              <h4 className="font-medium text-primary-900 mb-3">
                Genel Değişiklikler
              </h4>
              <div className="space-y-2">
                {data.headerChanges.map((change, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 rounded bg-warning-50 border border-warning-200"
                  >
                    <Edit3 className="w-4 h-4 text-warning-600" />
                    <span className="text-sm font-medium text-primary-700">
                      {change.field}:
                    </span>
                    <span className="text-sm text-primary-500 line-through">
                      {typeof change.oldValue === 'number'
                        ? formatCurrency(change.oldValue)
                        : String(change.oldValue)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-primary-400" />
                    <span className="text-sm text-primary-900 font-medium">
                      {typeof change.newValue === 'number'
                        ? formatCurrency(change.newValue)
                        : String(change.newValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Item diffs */}
          {data.itemDiffs.filter((d) => d.type !== 'unchanged').length > 0 && (
            <div>
              <h4 className="font-medium text-primary-900 mb-3">
                Kalem Değişiklikleri
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.itemDiffs
                  .filter((d) => d.type !== 'unchanged')
                  .map((diff, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${getDiffBgClass(diff.type)}`}
                    >
                      <div className="flex items-start gap-2">
                        {getDiffIcon(diff.type)}
                        <div className="flex-1">
                          <div className="font-medium text-primary-900">
                            {diff.newItem?.code || diff.oldItem?.code || '-'}
                          </div>
                          <div className="text-sm text-primary-600">
                            {diff.newItem?.description || diff.oldItem?.description}
                          </div>
                          {diff.changes && diff.changes.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {diff.changes.map((change, cidx) => (
                                <div key={cidx} className="text-xs text-primary-500 flex items-center gap-1">
                                  <span>{change.field}:</span>
                                  <span className="line-through">{String(change.oldValue)}</span>
                                  <ArrowRight className="w-2 h-2" />
                                  <span className="font-medium text-primary-700">
                                    {String(change.newValue)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {diff.type !== 'removed' && diff.newItem && (
                          <div className="text-right">
                            <div className="text-sm font-medium text-primary-900">
                              {formatCurrency(diff.newItem.totalPrice)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
