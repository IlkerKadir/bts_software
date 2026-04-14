'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, DollarSign, Trash2 } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EkMaliyetLine {
  title: string;
  amount: number;
}

/**
 * Currencies the user can pick for ek maliyet entry. TRY is the
 * common case (subcontractor costs quoted in Turkish Lira and
 * translated into the quote currency at distribution time), but the
 * user can pick any of the four supported currencies per modal open.
 */
type SourceCurrency = 'TRY' | 'EUR' | 'USD' | 'GBP';

export interface EkMaliyetModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  /** Quote's current currency — determines how the source total is
   *  converted for display. */
  currency: string;
  /** Full exchange rate matrix from the editor's `exchangeRates`
   *  state. Used to convert the source total into the quote currency
   *  regardless of which `sourceCurrency` the user picks. */
  rateMatrix: Record<string, Record<string, number>>;
  /** Legacy fallback: direct currency → TRY scalar. Only used when
   *  the matrix is empty for some reason (first render, network
   *  failure, etc.). */
  exchangeRate: number;
  onApply: (totalAmountInCurrency: number) => void;
}

// ---------------------------------------------------------------------------
// EkMaliyetModal
// ---------------------------------------------------------------------------

export function EkMaliyetModal({
  isOpen,
  onClose,
  quoteId,
  currency,
  rateMatrix,
  exchangeRate,
  onApply,
}: EkMaliyetModalProps) {
  const [lines, setLines] = useState<EkMaliyetLine[]>([{ title: '', amount: 0 }]);
  const [sourceCurrency, setSourceCurrency] = useState<SourceCurrency>('TRY');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing entries from API when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchEntries = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/quotes/${quoteId}/ek-maliyet`);
        if (!res.ok) throw new Error('Yüklenirken hata oluştu');
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setLines(data.items.map((item: { title: string; amount: number }) => ({
            title: item.title,
            amount: Number(item.amount),
          })));
          // Restore the stamped source currency from the first entry.
          // Legacy rows have sourceCurrency = null → treat as TRY
          // (matches the old modal's hardcoded assumption).
          //
          // PUT writes a uniform sourceCurrency across every line in a
          // single modal open, so in practice all rows share the same
          // value. If a hand-edited DB row ever produced a mismatch,
          // warn loudly — the picker would otherwise silently display
          // one currency while ignoring that others exist.
          const sources = data.items.map(
            (item: { sourceCurrency?: string | null }) => item.sourceCurrency ?? 'TRY'
          );
          const firstSource = sources[0];
          const hasMixedSources = sources.some((s: string) => s !== firstSource);
          if (hasMixedSources) {
            console.warn(
              '[EkMaliyetModal] mixed sourceCurrency across entries — picker will show the first one:',
              sources
            );
          }
          if (firstSource === 'EUR' || firstSource === 'USD' || firstSource === 'GBP' || firstSource === 'TRY') {
            setSourceCurrency(firstSource);
          } else {
            setSourceCurrency('TRY');
          }
        } else {
          setLines([{ title: '', amount: 0 }]);
          setSourceCurrency('TRY');
        }
      } catch (err: unknown) {
        console.error('Ek maliyet load error:', err);
        setError(err instanceof Error ? err.message : 'Yüklenirken hata oluştu');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEntries();
  }, [isOpen, quoteId]);

  const addLine = useCallback(() => {
    setLines(prev => [...prev, { title: '', amount: 0 }]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateLine = useCallback((index: number, field: keyof EkMaliyetLine, value: string | number) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      return { ...line, [field]: value };
    }));
  }, []);

  // Sum of all line amounts in the chosen source currency.
  const totalSource = lines.reduce((sum, line) => sum + (line.amount || 0), 0);

  // Convert the source total into the quote currency using the rate
  // matrix. Three routes, most specific first:
  //   1. Source === quote currency → no conversion.
  //   2. Matrix lookup `rateMatrix[sourceCurrency][currency]` → the
  //      normal case, works for all 4 supported currencies.
  //   3. Legacy scalar fallback: divide TRY amounts by
  //      `exchangeRate`. Only reachable when the matrix hasn't
  //      loaded yet (very early in the component lifecycle) and
  //      sourceCurrency === 'TRY'.
  const totalInCurrency = useMemo(() => {
    if (sourceCurrency === currency) return totalSource;

    const rate = rateMatrix[sourceCurrency]?.[currency];
    if (rate != null && rate > 0) return totalSource * rate;

    if (sourceCurrency === 'TRY' && currency !== 'TRY' && exchangeRate > 0) {
      return totalSource / exchangeRate;
    }
    return totalSource;
  }, [totalSource, sourceCurrency, currency, rateMatrix, exchangeRate]);

  const handleApply = async () => {
    // Filter out empty lines
    const validLines = lines.filter(l => l.title.trim() && l.amount > 0);

    setIsSaving(true);
    setError(null);

    try {
      // Save to API (empty array clears all entries). `sourceCurrency`
      // stamps every line with the user's current picker value so
      // Phase 4's Kurları Güncelle flow can redistribute this line
      // when rates move.
      const res = await fetch(`/api/quotes/${quoteId}/ek-maliyet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validLines, sourceCurrency }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Kaydetme hatası');
      }

      // Apply distribution (0 when no entries → reverts TAŞERON items to base price)
      onApply(totalInCurrency);
      onClose();
    } catch (err: unknown) {
      console.error('Ek maliyet save error:', err);
      setError(err instanceof Error ? err.message : 'Kaydedilirken hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-200">
          <h2 className="text-lg font-semibold text-primary-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary-600" />
            Ek Maliyet Ekle
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-primary-100 text-primary-500 hover:text-primary-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : (
            <>
              {/* Source currency picker — applies to all lines */}
              <div className="flex items-center gap-3 border border-primary-200 rounded-lg px-3 py-2 bg-primary-50">
                <span className="text-xs font-medium text-primary-600">Para Birimi:</span>
                <select
                  value={sourceCurrency}
                  onChange={(e) => setSourceCurrency(e.target.value as SourceCurrency)}
                  className={cn(
                    'text-sm font-medium px-2 py-1 border rounded-md text-primary-900 bg-white',
                    'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                    'cursor-pointer'
                  )}
                >
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
                <span className="text-xs text-primary-500">
                  Tüm satırlar bu para biriminde girilir.
                </span>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-primary-500 uppercase tracking-wider">
                  <span className="flex-1">Başlık</span>
                  <span className="w-32 text-right">Tutar ({sourceCurrency})</span>
                  <span className="w-8" />
                </div>

                {lines.map((line, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={line.title}
                      onChange={(e) => updateLine(index, 'title', e.target.value)}
                      placeholder="Maliyet başlığı..."
                      className={cn(
                        'flex-1 px-3 py-2 border rounded-lg text-sm text-primary-900',
                        'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                        'placeholder:text-primary-400'
                      )}
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.amount || ''}
                      onChange={(e) => updateLine(index, 'amount', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={cn(
                        'w-32 px-3 py-2 border rounded-lg text-sm text-right tabular-nums text-primary-900',
                        'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                        'placeholder:text-primary-400'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="p-1.5 rounded-md transition-colors cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Satır Ekle
                </button>
              </div>

              {/* Summary */}
              <div className="border-t border-primary-200 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-primary-600">Toplam ({sourceCurrency})</span>
                  <span className="font-semibold tabular-nums text-primary-900">
                    {new Intl.NumberFormat('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(totalSource)} {sourceCurrency}
                  </span>
                </div>

                {sourceCurrency !== currency && (
                  <>
                    {(() => {
                      const rate = rateMatrix[sourceCurrency]?.[currency];
                      if (rate == null || rate <= 0) return null;
                      return (
                        <div className="flex justify-between text-xs text-primary-500">
                          <span>Kur: 1 {sourceCurrency} = {rate.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })} {currency}</span>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between text-sm">
                      <span className="text-primary-600">Toplam ({currency})</span>
                      <span className="font-semibold tabular-nums text-primary-900">
                        {new Intl.NumberFormat('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(totalInCurrency)} {currency}
                      </span>
                    </div>
                  </>
                )}

                <p className="text-xs text-primary-500 mt-2">
                  Toplam tutar, TAŞERON markalı alt kalemlere miktar bazında dağıtılacaktır.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-primary-200">
          <Button variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            isLoading={isSaving}
            disabled={isLoading || isSaving}
          >
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
