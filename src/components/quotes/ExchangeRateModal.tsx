'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Clock,
  AlertCircle,
  Check,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Modal, Button, Spinner } from '@/components/ui';

// ── Types ──────────────────────────────────────────────────────────────────

interface ExchangeRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  currentRate: number;
  currentProtectionPct: number;
  currentProtectionMap?: Record<string, number>;
  onApply: (exchangeRate: number, protectionPct: number, protectionMap: Record<string, number>, rateMatrix: RateMatrix) => void;
}

type RateMatrix = Record<string, Record<string, number>>;
type ProtectionMap = Record<string, number>; // "EUR/TRY" → 5.0

interface TcmbDirectRate {
  currency: string;
  forexSelling: number;
  banknoteSelling: number;
}

type TcmbRateType = 'forexSelling' | 'banknoteSelling';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'TRY'] as const;

const CURRENCY_LABELS: Record<string, string> = {
  EUR: 'Euro',
  USD: 'Dolar',
  GBP: 'Sterlin',
  TRY: 'Türk Lirası',
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Canonical sorted key for a currency pair */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('/');
}

function formatRate(rate: number): string {
  const decimals = rate < 1 ? 6 : 4;
  return rate.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export function ExchangeRateModal({
  isOpen,
  onClose,
  currency,
  currentRate,
  currentProtectionPct,
  currentProtectionMap,
  onApply,
}: ExchangeRateModalProps) {
  // Data state
  const [rateMatrix, setRateMatrix] = useState<RateMatrix>({});
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Per-pair protection percentages
  const [protectionMap, setProtectionMap] = useState<ProtectionMap>({});

  // Selected pair for the quote
  const [selectedFrom, setSelectedFrom] = useState(currency);
  const [selectedTo, setSelectedTo] = useState('TRY');

  // Base rate (from TCMB or manual)
  const [baseRate, setBaseRate] = useState(currentRate);
  const [isManualRate, setIsManualRate] = useState(true);

  // TCMB direct rates (Döviz Satış / Efektif Satış)
  const [tcmbDirectRates, setTcmbDirectRates] = useState<TcmbDirectRate[]>([]);
  const [tcmbRateType, setTcmbRateType] = useState<TcmbRateType>('forexSelling');
  const [isFetchingTcmb, setIsFetchingTcmb] = useState(false);
  const [tcmbFetchedAt, setTcmbFetchedAt] = useState<string | null>(null);

  // ── Protection helpers ──────────────────────────────────────────────────

  const getProtection = useCallback(
    (from: string, to: string): number => protectionMap[pairKey(from, to)] || 0,
    [protectionMap]
  );

  const updateProtection = useCallback((from: string, to: string, pct: number) => {
    setProtectionMap((prev) => ({ ...prev, [pairKey(from, to)]: pct }));
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Use saved protection map if available, otherwise fall back to single protectionPct
      let initialMap: ProtectionMap = {};
      if (currentProtectionMap && Object.keys(currentProtectionMap).length > 0) {
        initialMap = { ...currentProtectionMap };
      } else if (currentProtectionPct > 0) {
        initialMap[pairKey(currency, 'TRY')] = currentProtectionPct;
      }

      // Set currentRate as initial placeholder; the fetch effect will override with TCMB data.
      // Reverse-engineer base rate from stored protected rate if protection was active.
      const selectedPairProt = initialMap[pairKey(currency, 'TRY')] || 0;
      if (selectedPairProt > 0 && currentRate > 0) {
        setBaseRate(currentRate / (1 + selectedPairProt / 100));
      } else {
        setBaseRate(currentRate);
      }
      setProtectionMap(initialMap);
      setSelectedFrom(currency);
      setSelectedTo('TRY');
      setIsManualRate(true);
      setError(null);
      setSuccessMessage(null);
      setTcmbDirectRates([]);
      setTcmbFetchedAt(null);
      setTcmbRateType('forexSelling');
    }
  }, [isOpen, currentRate, currentProtectionPct, currentProtectionMap, currency]);

  // Fetch rate data on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/exchange-rates/sync');
        if (!res.ok) {
          setError('Kur verileri yüklenemedi');
          return;
        }
        const data = await res.json();
        setRateMatrix(data.rateMatrix || {});
        setLastSyncAt(data.lastSyncAt);

        // Always use TCMB rate as base when available for the quote currency → TRY pair.
        // The stored exchangeRate may be from a different pair that was previously selected,
        // so we always start fresh from TCMB to avoid showing a wrong pair's rate.
        if (data.rateMatrix[currency]?.TRY && currency !== 'TRY') {
          setBaseRate(data.rateMatrix[currency].TRY);
          setIsManualRate(false);
        }
      } catch {
        setError('Kur verileri yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, currency, currentRate]);

  // TCMB sync handler
  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/exchange-rates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Senkronizasyon başarısız');
      setSuccessMessage(data.message);

      // Refetch
      const syncRes = await fetch('/api/exchange-rates/sync');
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setRateMatrix(syncData.rateMatrix || {});
        setLastSyncAt(syncData.lastSyncAt);

        // Update base rate from TCMB if available for selected pair
        if (syncData.rateMatrix[selectedFrom]?.[selectedTo]) {
          setBaseRate(syncData.rateMatrix[selectedFrom][selectedTo]);
          setIsManualRate(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch TCMB direct rates (ForexSelling / BanknoteSelling)
  const handleFetchTcmbDirect = async () => {
    setIsFetchingTcmb(true);
    setError(null);
    try {
      const res = await fetch('/api/exchange-rates/tcmb');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TCMB kur bilgisi alınamadı');

      setTcmbDirectRates(data.rates || []);
      setTcmbFetchedAt(data.fetchedAt || null);

      // Auto-apply the rate for the currently selected currency
      const match = (data.rates as TcmbDirectRate[]).find(
        (r) => r.currency === selectedFrom
      );
      if (match) {
        const rate = tcmbRateType === 'forexSelling' ? match.forexSelling : match.banknoteSelling;
        if (rate > 0) {
          setBaseRate(rate);
          setIsManualRate(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TCMB kur bilgisi alınamadı');
    } finally {
      setIsFetchingTcmb(false);
    }
  };

  // When rate type changes, apply the new rate if TCMB data is loaded
  const handleTcmbRateTypeChange = (type: TcmbRateType) => {
    setTcmbRateType(type);
    const match = tcmbDirectRates.find((r) => r.currency === selectedFrom);
    if (match) {
      const rate = type === 'forexSelling' ? match.forexSelling : match.banknoteSelling;
      if (rate > 0) {
        setBaseRate(rate);
        setIsManualRate(false);
      }
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────

  // Selected pair's protection
  const selectedProtection = getProtection(selectedFrom, selectedTo);

  // Protected rate for the selected pair
  const protectedRate = useMemo(
    () => baseRate * (1 + selectedProtection / 100),
    [baseRate, selectedProtection]
  );

  // Count how many pairs have protection set
  const protectionCount = useMemo(
    () => Object.values(protectionMap).filter((v) => v > 0).length,
    [protectionMap]
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  // Select a rate from the matrix
  const handleSelectRate = (from: string, to: string) => {
    if (from === to) return;
    const rate = rateMatrix[from]?.[to];
    if (rate) {
      setBaseRate(rate);
      setSelectedFrom(from);
      setSelectedTo(to);
      setIsManualRate(false);
    }
  };

  // Apply the selected pair's protected rate + full protection map to the quote
  const handleApply = () => {
    // Filter out zero values from the map
    const cleanMap: Record<string, number> = {};
    for (const [key, val] of Object.entries(protectionMap)) {
      if (val > 0) cleanMap[key] = val;
    }
    onApply(protectedRate, selectedProtection, cleanMap, rateMatrix);
    onClose();
  };

  const hasRates = Object.keys(rateMatrix).length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Döviz Kuru Yönetimi"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" onClick={handleApply}>
            <Check className="h-4 w-4" />
            Uygula
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Messages ─────────────────────────────────────────── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-700">{successMessage}</span>
            </div>
          )}

          {/* ── Sync Status ──────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-primary-500 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {lastSyncAt
                ? `Son güncelleme: ${formatDateTime(lastSyncAt)}`
                : 'Henüz senkronize edilmedi'}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
              TCMB Güncelle
            </Button>
          </div>

          {/* ── TCMB Direct Rate Fetch ───────────────────────────── */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blue-900">
                TCMB Kur Seçimi
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFetchTcmbDirect}
                disabled={isFetchingTcmb}
              >
                <Download className={cn('w-4 h-4', isFetchingTcmb && 'animate-pulse')} />
                TCMB Kuru Getir
              </Button>
            </div>

            {tcmbDirectRates.length > 0 && (
              <>
                {/* Rate type selector */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-blue-700">Kur tipi:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="tcmbRateType"
                      checked={tcmbRateType === 'forexSelling'}
                      onChange={() => handleTcmbRateTypeChange('forexSelling')}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-blue-800">Döviz Satış</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="tcmbRateType"
                      checked={tcmbRateType === 'banknoteSelling'}
                      onChange={() => handleTcmbRateTypeChange('banknoteSelling')}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-blue-800">Efektif Satış</span>
                  </label>
                </div>

                {/* Rate values */}
                <div className="grid grid-cols-3 gap-2">
                  {tcmbDirectRates.map((r) => {
                    const isActive = r.currency === selectedFrom;
                    const displayRate =
                      tcmbRateType === 'forexSelling' ? r.forexSelling : r.banknoteSelling;
                    return (
                      <button
                        key={r.currency}
                        type="button"
                        onClick={() => {
                          if (displayRate > 0) {
                            setBaseRate(displayRate);
                            setSelectedFrom(r.currency);
                            setSelectedTo('TRY');
                            setIsManualRate(false);
                          }
                        }}
                        className={cn(
                          'flex flex-col items-center rounded-lg border px-3 py-2 transition-colors cursor-pointer',
                          isActive
                            ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-400'
                            : 'bg-white border-blue-200 hover:bg-blue-50'
                        )}
                      >
                        <span className="text-xs font-medium text-blue-700">
                          {r.currency}/TRY
                        </span>
                        <span className="text-sm font-mono tabular-nums font-semibold text-blue-900">
                          {displayRate.toLocaleString('tr-TR', {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {tcmbFetchedAt && (
                  <p className="text-[11px] text-blue-500">
                    TCMB verisi: {formatDateTime(tcmbFetchedAt)} ·{' '}
                    {tcmbRateType === 'forexSelling' ? 'Döviz Satış' : 'Efektif Satış'} kuru
                    seçili
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Rate Matrix with per-pair protection ────────────── */}
          {hasRates ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-primary-900">
                  Kur Matrisi
                </h3>
                {protectionCount > 0 && (
                  <span className="text-xs text-accent-600 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {protectionCount} çiftte koruma uygulanmış
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-primary-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-primary-500 w-20">
                        1 Birim
                      </th>
                      {CURRENCIES.map((c) => (
                        <th
                          key={c}
                          className="px-2 py-2 text-center text-xs font-medium text-primary-500"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CURRENCIES.map((from) => (
                      <tr
                        key={from}
                        className={cn(
                          'border-t border-primary-100',
                          from === currency && 'bg-accent-50/50'
                        )}
                      >
                        <td className="px-3 py-2 font-medium text-primary-800">
                          <div className="flex flex-col">
                            <span className="font-mono">{from}</span>
                            <span className="text-[10px] text-primary-400 font-normal">
                              {CURRENCY_LABELS[from]}
                            </span>
                          </div>
                        </td>
                        {CURRENCIES.map((to) => {
                          const isSelf = from === to;
                          if (isSelf) {
                            return (
                              <td key={to} className="px-2 py-2 text-center text-primary-300">
                                —
                              </td>
                            );
                          }

                          const baseVal = rateMatrix[from]?.[to];
                          if (!baseVal) {
                            return (
                              <td key={to} className="px-2 py-2 text-center text-primary-300">
                                —
                              </td>
                            );
                          }

                          const prot = getProtection(from, to);
                          const protectedVal = baseVal * (1 + prot / 100);
                          const isSelected = from === selectedFrom && to === selectedTo;

                          return (
                            <td
                              key={to}
                              className={cn(
                                'px-2 py-2 align-top',
                                isSelected && 'bg-accent-100 ring-2 ring-inset ring-accent-400 rounded'
                              )}
                            >
                              <div className="flex flex-col items-end gap-1">
                                {/* Clickable rate value */}
                                <button
                                  type="button"
                                  onClick={() => handleSelectRate(from, to)}
                                  className={cn(
                                    'text-right font-mono tabular-nums text-sm transition-colors rounded px-1 -mx-1 cursor-pointer',
                                    isSelected
                                      ? 'font-semibold text-accent-900'
                                      : 'text-primary-700 hover:text-accent-700 hover:bg-primary-50'
                                  )}
                                  title={`${from}/${to} kurunu seç`}
                                >
                                  {formatRate(prot > 0 ? protectedVal : baseVal)}
                                </button>

                                {/* Base rate (strikethrough when protection active) */}
                                {prot > 0 && (
                                  <span className="text-[10px] text-primary-400 line-through font-mono tabular-nums">
                                    {formatRate(baseVal)}
                                  </span>
                                )}

                                {/* Per-cell protection input */}
                                <div className="flex items-center gap-0.5">
                                  <ShieldCheck className={cn(
                                    'w-3 h-3 shrink-0',
                                    prot > 0 ? 'text-accent-500' : 'text-primary-300'
                                  )} />
                                  <input
                                    type="number"
                                    step="0.5"
                                    min={0}
                                    max={100}
                                    value={prot || ''}
                                    placeholder="0"
                                    onChange={(e) =>
                                      updateProtection(from, to, parseFloat(e.target.value) || 0)
                                    }
                                    className={cn(
                                      'w-11 text-[11px] text-right font-mono tabular-nums border rounded px-1 py-0.5',
                                      'focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-transparent transition-shadow',
                                      prot > 0
                                        ? 'border-accent-300 bg-accent-50 text-accent-700'
                                        : 'border-primary-200 bg-white text-primary-500'
                                    )}
                                  />
                                  <span className="text-[10px] text-primary-400">%</span>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-primary-400 mt-1.5">
                Kur seçmek için değere tıklayın · Her çift için ayrı koruma % belirleyebilirsiniz
              </p>
            </div>
          ) : (
            <div className="bg-primary-50 rounded-lg px-4 py-6 text-center">
              <TrendingUp className="w-8 h-8 text-primary-300 mx-auto mb-2" />
              <p className="text-sm text-primary-500">
                Henüz kur verisi bulunmuyor.
              </p>
              <p className="text-xs text-primary-400 mt-1">
                &ldquo;TCMB Güncelle&rdquo; butonunu kullanarak güncel kurları çekin.
              </p>
            </div>
          )}

          {/* ── Selected Pair Calculation ───────────────────────── */}
          <div className="bg-primary-50 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary-900">
                Kur Hesaplama
              </h3>
              <span className="text-xs font-medium text-accent-700 bg-accent-100 px-2 py-0.5 rounded">
                {selectedFrom} → {selectedTo}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              {/* Base Rate */}
              <div>
                <label className="block text-xs font-medium text-primary-600 mb-1">
                  {selectedFrom}/{selectedTo} Baz Kur
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={baseRate || ''}
                  onChange={(e) => {
                    setBaseRate(parseFloat(e.target.value) || 0);
                    setIsManualRate(true);
                  }}
                  className="w-full px-3 py-2.5 border border-primary-300 rounded-lg text-right font-mono tabular-nums text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow"
                />
                <span className="text-[11px] text-primary-400 mt-1 block">
                  {isManualRate ? 'Manuel giriş' : 'TCMB\'den alındı'}
                </span>
              </div>

              {/* Protection % for selected pair */}
              <div>
                <label className="block text-xs font-medium text-primary-600 mb-1">
                  {selectedFrom}/{selectedTo} Koruma %
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    value={selectedProtection || ''}
                    onChange={(e) =>
                      updateProtection(selectedFrom, selectedTo, parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2.5 border border-primary-300 rounded-lg text-right font-mono tabular-nums text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow"
                  />
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-400 pointer-events-none" />
                </div>
                {/* Quick % buttons */}
                <div className="flex gap-1 mt-1.5">
                  {[0, 2, 3, 5, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => updateProtection(selectedFrom, selectedTo, pct)}
                      className={cn(
                        'px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer',
                        selectedProtection === pct
                          ? 'bg-accent-100 border-accent-300 text-accent-700 font-medium'
                          : 'bg-white border-primary-200 text-primary-500 hover:bg-primary-50'
                      )}
                    >
                      %{pct}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protected Rate (prominent) */}
              <div>
                <label className="block text-xs font-medium text-primary-600 mb-1">
                  Korumalı Kur
                </label>
                <div className="w-full px-3 py-2 bg-accent-50 border-2 border-accent-400 rounded-lg text-right font-mono tabular-nums font-bold text-accent-900 text-lg">
                  {formatRate(protectedRate)}
                </div>
                <span className="text-[11px] text-primary-400 mt-1 flex items-center gap-1 justify-end">
                  {formatRate(baseRate)}
                  <ArrowRight className="w-3 h-3" />
                  <span className="font-medium text-primary-600">
                    x (1 + %{selectedProtection.toFixed(1)})
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
