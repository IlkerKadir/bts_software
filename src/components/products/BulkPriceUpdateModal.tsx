'use client';

import { useState } from 'react';
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';

interface Product {
  id: string;
  code: string;
  name: string;
}

interface PreviewItem {
  id: string;
  code: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
}

interface BulkPriceUpdateModalProps {
  products: Product[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkPriceUpdateModal({
  products,
  onClose,
  onSuccess,
}: BulkPriceUpdateModalProps) {
  const [operation, setOperation] = useState<'increase' | 'decrease'>('increase');
  const [value, setValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);

  const handlePreview = async () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError('Geçerli bir yüzde değeri girin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/products/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: products.map((p) => p.id),
          operation,
          value: numValue,
          field: 'listPrice',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Önizleme başarısız');
      }

      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError('Geçerli bir yüzde değeri girin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/products/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: products.map((p) => p.id),
          operation,
          value: numValue,
          field: 'listPrice',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Güncelleme başarısız');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-primary-200">
          <h2 className="text-lg font-semibold text-primary-900">
            Toplu Fiyat Güncelleme
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
          {/* Selected products count */}
          <div className="bg-primary-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-primary-700">
              <span className="font-semibold">{products.length}</span> ürün seçildi
            </p>
          </div>

          {/* Operation selection */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">
                İşlem
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOperation('increase')}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border
                    ${operation === 'increase'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-primary-200 hover:bg-primary-50 cursor-pointer'
                    }
                  `}
                >
                  <TrendingUp className="w-4 h-4" />
                  Artır
                </button>
                <button
                  type="button"
                  onClick={() => setOperation('decrease')}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border
                    ${operation === 'decrease'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-primary-200 hover:bg-primary-50 cursor-pointer'
                    }
                  `}
                >
                  <TrendingDown className="w-4 h-4" />
                  Azalt
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">
                Yüzde (%)
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Örn: 10"
                className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="border border-primary-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-primary-50">
                  <tr>
                    <th className="text-left px-3 py-2">Ürün</th>
                    <th className="text-right px-3 py-2">Mevcut Fiyat</th>
                    <th className="text-right px-3 py-2">Yeni Fiyat</th>
                    <th className="text-right px-3 py-2">Değişim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100">
                  {preview.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-primary-500">
                          {item.code}
                        </span>
                        <span className="block truncate">{item.name}</span>
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">
                        {formatPrice(item.oldPrice)}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-medium">
                        {formatPrice(item.newPrice)}
                      </td>
                      <td
                        className={`text-right px-3 py-2 tabular-nums ${
                          item.change >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {item.change >= 0 ? '+' : ''}
                        {formatPrice(item.change)} ({item.changePercent}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <div className="px-3 py-2 bg-primary-50 text-sm text-primary-600">
                  +{preview.length - 10} ürün daha...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-primary-200">
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          {!preview ? (
            <Button onClick={handlePreview} disabled={isLoading || !value}>
              {isLoading ? <Spinner size="sm" /> : 'Önizle'}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setPreview(null)}
                disabled={isLoading}
              >
                Geri
              </Button>
              <Button onClick={handleApply} disabled={isLoading}>
                {isLoading ? <Spinner size="sm" /> : 'Uygula'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
