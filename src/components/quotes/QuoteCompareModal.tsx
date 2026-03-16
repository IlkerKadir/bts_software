'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Minus,
  Edit3,
  ArrowRight,
  Equal,
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

interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface CompareItem {
  id: string;
  productId: string | null;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: number;
  unit: string;
  katsayi: number;
  unitPrice: number;
  totalPrice: number;
  itemType: string;
  sortOrder: number;
}

interface ItemDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldItem?: CompareItem;
  newItem?: CompareItem;
  changes?: FieldChange[];
}

interface CompareData {
  oldQuote: QuoteSummary;
  newQuote: QuoteSummary;
  headerChanges: FieldChange[];
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
  const [showUnchanged, setShowUnchanged] = useState(false);

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
          setError(err.error || 'Karsilastirma yapilamadi');
        }
      } catch {
        setError('Karsilastirma yapilirken bir hata olustu');
      } finally {
        setIsLoading(false);
      }
    };

    fetchComparison();
  }, [isOpen, quoteId, compareId]);

  const fmtCurrency = (value: number | unknown, currency = 'EUR') => {
    const numValue = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue) + ' ' + currency;
  };

  const fmtNumber = (value: number, decimals = 2) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
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
        return <Plus className="w-4 h-4 text-green-600" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-red-600" />;
      case 'modified':
        return <Edit3 className="w-4 h-4 text-amber-600" />;
      default:
        return <Equal className="w-3 h-3 text-primary-400" />;
    }
  };

  const getDiffRowClass = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-green-50';
      case 'removed':
        return 'bg-red-50';
      case 'modified':
        return 'bg-amber-50';
      default:
        return '';
    }
  };

  const isFieldChanged = (diff: ItemDiff, fieldName: string): boolean => {
    if (!diff.changes) return false;
    return diff.changes.some(c => c.field === fieldName);
  };

  const changedCellClass = 'font-semibold text-amber-800';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Versiyon Karsilastirmasi"
      size="xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-600">
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
                {formatDate(data.oldQuote.createdAt)} - {data.oldQuote.createdBy.fullName}
              </div>
              <div className="mt-2 text-lg font-medium text-primary-900">
                {fmtCurrency(data.oldQuote.grandTotal, data.oldQuote.currency)}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm text-blue-600 mb-1">Yeni Versiyon</div>
              <div className="font-semibold text-lg text-primary-900">
                v{data.newQuote.version}
              </div>
              <div className="text-sm text-primary-600">
                {formatDate(data.newQuote.createdAt)} - {data.newQuote.createdBy.fullName}
              </div>
              <div className="mt-2 text-lg font-medium text-primary-900">
                {fmtCurrency(data.newQuote.grandTotal, data.newQuote.currency)}
              </div>
            </div>
          </div>

          {/* Summary badges */}
          <div className="flex items-center justify-center gap-3 py-2">
            {data.summary.modifiedItems > 0 && (
              <Badge variant="warning">
                <Edit3 className="w-3 h-3 mr-1" />
                {data.summary.modifiedItems} kalem degisti
              </Badge>
            )}
            {data.summary.addedItems > 0 && (
              <Badge variant="success">
                <Plus className="w-3 h-3 mr-1" />
                {data.summary.addedItems} kalem eklendi
              </Badge>
            )}
            {data.summary.removedItems > 0 && (
              <Badge variant="error">
                <Minus className="w-3 h-3 mr-1" />
                {data.summary.removedItems} kalem kaldirildi
              </Badge>
            )}
            {data.summary.totalChanges === 0 && (
              <span className="text-sm text-primary-500">Degisiklik yok</span>
            )}
          </div>

          {/* Header changes */}
          {data.headerChanges.length > 0 && (
            <div>
              <h4 className="font-medium text-primary-900 mb-3">
                Genel Degisiklikler
              </h4>
              <div className="space-y-2">
                {data.headerChanges.map((change, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 rounded bg-amber-50 border border-amber-200"
                  >
                    <Edit3 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-primary-700">
                      {change.field}:
                    </span>
                    <span className="text-sm text-primary-500 line-through">
                      {typeof change.oldValue === 'number'
                        ? fmtNumber(change.oldValue)
                        : String(change.oldValue ?? '-')}
                    </span>
                    <ArrowRight className="w-3 h-3 text-primary-400 flex-shrink-0" />
                    <span className="text-sm text-primary-900 font-medium">
                      {typeof change.newValue === 'number'
                        ? fmtNumber(change.newValue)
                        : String(change.newValue ?? '-')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Item diffs - side-by-side table */}
          {data.itemDiffs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-primary-900">
                  Kalem Degisiklikleri
                </h4>
                {data.summary.unchangedItems > 0 && (
                  <button
                    onClick={() => setShowUnchanged(!showUnchanged)}
                    className="text-xs text-primary-500 hover:text-primary-700 underline cursor-pointer"
                  >
                    {showUnchanged
                      ? 'Degismeyenleri gizle'
                      : `${data.summary.unchangedItems} degismeyen kalemi goster`}
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-primary-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-50 text-primary-700 text-left">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">Kod</th>
                      <th className="px-3 py-2">Aciklama</th>
                      <th className="px-3 py-2 text-right">Miktar</th>
                      <th className="px-3 py-2 text-right">Katsayi</th>
                      <th className="px-3 py-2 text-right">Birim Fiyat</th>
                      <th className="px-3 py-2 text-right">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100">
                    {data.itemDiffs
                      .filter(d => showUnchanged || d.type !== 'unchanged')
                      .map((diff, idx) => {
                        const item = diff.newItem || diff.oldItem;
                        if (!item) return null;

                        return (
                          <tr
                            key={idx}
                            className={`${getDiffRowClass(diff.type)} hover:bg-primary-50/50`}
                          >
                            <td className="px-3 py-2">
                              {getDiffIcon(diff.type)}
                            </td>
                            <td className="px-3 py-2 text-primary-700 font-mono text-xs">
                              {item.code || '-'}
                            </td>
                            <td className="px-3 py-2 text-primary-900 max-w-[200px]">
                              {diff.type === 'modified' && isFieldChanged(diff, 'Aciklama') ? (
                                <div>
                                  <div className="line-through text-primary-400 text-xs">
                                    {diff.oldItem?.description}
                                  </div>
                                  <div className={changedCellClass}>
                                    {diff.newItem?.description}
                                  </div>
                                </div>
                              ) : (
                                <span className="truncate block">{item.description}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {diff.type === 'modified' && isFieldChanged(diff, 'Miktar') ? (
                                <div>
                                  <div className="line-through text-primary-400 text-xs">
                                    {fmtNumber(diff.oldItem!.quantity, 0)}
                                  </div>
                                  <div className={changedCellClass}>
                                    {fmtNumber(diff.newItem!.quantity, 0)}
                                  </div>
                                </div>
                              ) : (
                                fmtNumber(item.quantity, 0)
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {diff.type === 'modified' && isFieldChanged(diff, 'Katsayi') ? (
                                <div>
                                  <div className="line-through text-primary-400 text-xs">
                                    {fmtNumber(diff.oldItem!.katsayi, 3)}
                                  </div>
                                  <div className={changedCellClass}>
                                    {fmtNumber(diff.newItem!.katsayi, 3)}
                                  </div>
                                </div>
                              ) : (
                                fmtNumber(item.katsayi, 3)
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {diff.type === 'modified' && isFieldChanged(diff, 'Birim Fiyat') ? (
                                <div>
                                  <div className="line-through text-primary-400 text-xs">
                                    {fmtNumber(diff.oldItem!.unitPrice)}
                                  </div>
                                  <div className={changedCellClass}>
                                    {fmtNumber(diff.newItem!.unitPrice)}
                                  </div>
                                </div>
                              ) : (
                                fmtNumber(item.unitPrice)
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {diff.type === 'modified' && isFieldChanged(diff, 'Toplam Fiyat') ? (
                                <div>
                                  <div className="line-through text-primary-400 text-xs">
                                    {fmtNumber(diff.oldItem!.totalPrice)}
                                  </div>
                                  <div className={changedCellClass}>
                                    {fmtNumber(diff.newItem!.totalPrice)}
                                  </div>
                                </div>
                              ) : (
                                fmtNumber(item.totalPrice)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 text-xs text-primary-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />
                  Eklenen
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
                  Kaldirilan
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                  Degisen
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
