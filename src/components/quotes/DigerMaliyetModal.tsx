'use client';

import { useState, useMemo } from 'react';
import { X, Calculator } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatPrice } from './QuoteItemRow';
import type { QuoteItemData } from './QuoteItemRow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: QuoteItemData[];
  currency: string;
  exchangeRate: number;
  korumaYuzdesi: number;
  onApply: (updates: { itemId: string; costPrice: number }[]) => void;
}

// ---------------------------------------------------------------------------
// DigerMaliyetModal
// ---------------------------------------------------------------------------

export function DigerMaliyetModal({
  isOpen,
  onClose,
  items,
  currency,
  exchangeRate,
  korumaYuzdesi,
  onApply,
}: Props) {
  const [konaklama, setKonaklama] = useState(0);
  const [yemek, setYemek] = useState(0);
  const [ulasim, setUlasim] = useState(0);
  const [diger, setDiger] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter to only CUSTOM items (montaj/installation items) - top-level only
  const montajItems = useMemo(
    () => items.filter((item) => item.itemType === 'CUSTOM' && !item.parentItemId),
    [items],
  );

  const totalOverheadTRY = konaklama + yemek + ulasim + diger;

  const effectiveRate = exchangeRate * (1 + korumaYuzdesi / 100);
  const totalOverheadCurrency = effectiveRate > 0 ? totalOverheadTRY / effectiveRate : 0;

  const selectedItems = montajItems.filter((item) => selectedIds.has(item.id));
  const totalBirim = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const perBirimOverhead = totalBirim > 0 ? totalOverheadCurrency / totalBirim : 0;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(montajItems.map((i) => i.id)));
  };

  const handleApply = () => {
    if (selectedItems.length === 0 || totalBirim === 0) return;

    const updates = selectedItems.map((item) => ({
      itemId: item.id,
      costPrice: (Number(item.costPrice) || 0) + perBirimOverhead,
    }));

    onApply(updates);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary-900">
            Diger Maliyet Dagitimi
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-primary-100 rounded"
          >
            <X className="h-5 w-5 text-primary-600" />
          </button>
        </div>

        {/* Cost inputs */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-primary-700 mb-1">
              Konaklama (TL)
            </label>
            <input
              type="number"
              value={konaklama || ''}
              onChange={(e) => setKonaklama(Number(e.target.value) || 0)}
              className="w-full px-3 py-1.5 border border-primary-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-700 mb-1">
              Yemek (TL)
            </label>
            <input
              type="number"
              value={yemek || ''}
              onChange={(e) => setYemek(Number(e.target.value) || 0)}
              className="w-full px-3 py-1.5 border border-primary-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-700 mb-1">
              Yol/Ulasim (TL)
            </label>
            <input
              type="number"
              value={ulasim || ''}
              onChange={(e) => setUlasim(Number(e.target.value) || 0)}
              className="w-full px-3 py-1.5 border border-primary-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-700 mb-1">
              Diger (TL)
            </label>
            <input
              type="number"
              value={diger || ''}
              onChange={(e) => setDiger(Number(e.target.value) || 0)}
              className="w-full px-3 py-1.5 border border-primary-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              placeholder="0"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="bg-primary-50 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-primary-600">Toplam Maliyet (TL):</span>
            <span className="font-medium">
              {totalOverheadTRY.toLocaleString('tr-TR')} TL
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-primary-600">
              Kur ({currency}/TL + %{korumaYuzdesi} koruma):
            </span>
            <span className="font-medium">{effectiveRate.toFixed(4)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-primary-600">
              Toplam Maliyet ({currency}):
            </span>
            <span className="font-medium">
              {formatPrice(totalOverheadCurrency, currency)}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-primary-600">Toplam Birim:</span>
            <span className="font-medium">
              {totalBirim.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex justify-between font-bold text-primary-900 border-t border-primary-200 pt-1 mt-1">
            <span>Birim Basi Maliyet ({currency}):</span>
            <span>{formatPrice(perBirimOverhead, currency)}</span>
          </div>
        </div>

        {/* Item selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-primary-800">
              Dagitilacak Kalemler
            </h3>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Tumunu Sec
            </button>
          </div>
          {montajItems.length === 0 ? (
            <p className="text-sm text-primary-500 italic">
              Montaj kalemi bulunamadi (Serbest Kalem ekleyin)
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-primary-200 rounded-lg divide-y divide-primary-100">
              {montajItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-primary-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="rounded border-primary-300"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary-800 truncate">
                      {item.description}
                    </p>
                    <p className="text-xs text-primary-500">
                      {item.quantity} {item.unit} &times; maliyet:{' '}
                      {formatPrice(Number(item.costPrice) || 0, currency)}
                    </p>
                  </div>
                  {selectedIds.has(item.id) && perBirimOverhead > 0 && (
                    <span className="text-xs text-green-600 whitespace-nowrap">
                      +{formatPrice(perBirimOverhead, currency)}/birim
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Iptal
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={
              selectedItems.length === 0 ||
              totalBirim === 0 ||
              totalOverheadTRY === 0
            }
          >
            <Calculator className="h-4 w-4" />
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
