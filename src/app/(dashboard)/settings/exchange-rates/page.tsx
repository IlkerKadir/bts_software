'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Clock, AlertCircle, Check, Edit2, Save, X } from 'lucide-react';
import { Button, Card, Spinner } from '@/components/ui';

interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: string;
  isManual: boolean;
  fetchedAt: string;
}

interface SyncStatus {
  lastSyncAt: string | null;
  rates: ExchangeRate[];
  rateMatrix?: Record<string, Record<string, number>>;
}

const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Form state for adding manual rate
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRate, setNewRate] = useState({
    fromCurrency: 'EUR',
    toCurrency: 'USD',
    rate: '',
  });
  const [isAdding, setIsAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchRates = useCallback(async () => {
    try {
      const response = await fetch('/api/exchange-rates?latestOnly=true');
      if (response.ok) {
        const data = await response.json();
        setRates(data.rates || []);
      }

      // Also get last sync time
      const syncResponse = await fetch('/api/exchange-rates/sync');
      if (syncResponse.ok) {
        const syncData: SyncStatus = await syncResponse.json();
        setLastSyncAt(syncData.lastSyncAt);
      }
    } catch (err) {
      console.error('Failed to fetch rates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage || error) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, error]);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/exchange-rates/sync', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Senkronizasyon başarısız');
      }

      setSuccessMessage(data.message);
      fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newRate.fromCurrency === newRate.toCurrency) {
      setError('Kaynak ve hedef para birimi aynı olamaz');
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const response = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCurrency: newRate.fromCurrency,
          toCurrency: newRate.toCurrency,
          rate: parseFloat(newRate.rate),
          source: 'MANUAL',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ekleme başarısız');
      }

      setSuccessMessage(`${newRate.fromCurrency}/${newRate.toCurrency} kuru eklendi`);
      setShowAddForm(false);
      setNewRate({ fromCurrency: 'EUR', toCurrency: 'USD', rate: '' });
      fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsAdding(false);
    }
  };

  const handleEdit = (rate: ExchangeRate) => {
    setEditingId(rate.id);
    setEditValue(rate.rate.toString());
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSaveEdit = async (rate: ExchangeRate) => {
    const newRateValue = parseFloat(editValue);
    if (isNaN(newRateValue) || newRateValue <= 0) {
      setError('Geçerli bir kur değeri girin');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Create a new rate entry (rates are immutable, we add new ones)
      const response = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCurrency: rate.fromCurrency,
          toCurrency: rate.toCurrency,
          rate: newRateValue,
          source: 'MANUAL',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Güncelleme başarısız');
      }

      setSuccessMessage(`${rate.fromCurrency}/${rate.toCurrency} kuru güncellendi`);
      setEditingId(null);
      setEditValue('');
      fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu döviz kurunu silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/exchange-rates/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Silme başarısız');
      }

      setSuccessMessage('Döviz kuru silindi');
      fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRate = (rate: number) => {
    // Use more decimals for small rates (like TRY/USD)
    const decimals = rate < 1 ? 6 : 4;
    return rate.toLocaleString('tr-TR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // Group rates by base currency for better display
  const groupedRates = rates.reduce((acc, rate) => {
    const key = rate.fromCurrency;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rate);
    return acc;
  }, {} as Record<string, ExchangeRate[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Döviz Kurları</h1>
          <p className="text-primary-600 mt-1">
            Döviz kurlarını yönetin ve TCMB'den güncelleyin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="w-4 h-4" />
            Manuel Ekle
          </Button>
          <Button onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            TCMB'den Güncelle
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-700">
          <Check className="w-5 h-5 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Last Sync Info */}
      {lastSyncAt && (
        <div className="flex items-center gap-2 text-sm text-primary-500">
          <Clock className="w-4 h-4" />
          Son TCMB güncellemesi: {formatDate(lastSyncAt)}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-primary-900 mb-4">Manuel Döviz Kuru Ekle</h3>
            <form onSubmit={handleAddRate} className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Kaynak
                </label>
                <select
                  value={newRate.fromCurrency}
                  onChange={(e) => setNewRate({ ...newRate, fromCurrency: e.target.value })}
                  className="input w-28"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="text-primary-500 pb-2 text-xl">→</div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Hedef
                </label>
                <select
                  value={newRate.toCurrency}
                  onChange={(e) => setNewRate({ ...newRate, toCurrency: e.target.value })}
                  className="input w-28"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Kur
                </label>
                <input
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  placeholder="1.1878"
                  className="input w-36"
                  required
                />
              </div>
              <Button type="submit" disabled={isAdding}>
                {isAdding ? <Spinner size="sm" /> : 'Ekle'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAddForm(false)}
              >
                İptal
              </Button>
            </form>
            <p className="text-xs text-primary-500 mt-3">
              Örnek: EUR → USD = 1.1878 (1 EUR = 1.1878 USD)
            </p>
          </div>
        </Card>
      )}

      {/* Rates Table - Grouped by base currency */}
      {Object.keys(groupedRates).length === 0 ? (
        <Card>
          <div className="p-8 text-center text-primary-500">
            Henüz döviz kuru bulunmuyor. TCMB'den güncelleyebilir veya manuel ekleyebilirsiniz.
          </div>
        </Card>
      ) : (
        Object.entries(groupedRates)
          .sort(([a], [b]) => {
            // Sort order: TRY, USD, EUR, GBP
            const order = ['TRY', 'USD', 'EUR', 'GBP'];
            return order.indexOf(a) - order.indexOf(b);
          })
          .map(([baseCurrency, currencyRates]) => (
            <Card key={baseCurrency}>
              <div className="p-4 border-b border-primary-100 bg-primary-50">
                <h3 className="font-semibold text-primary-900">
                  {baseCurrency} Kurları
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-32">Çeviri</th>
                      <th className="text-right">Kur</th>
                      <th className="w-24">Kaynak</th>
                      <th>Güncelleme</th>
                      <th className="w-24 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currencyRates
                      .sort((a, b) => {
                        const order = ['TRY', 'USD', 'EUR', 'GBP'];
                        return order.indexOf(a.toCurrency) - order.indexOf(b.toCurrency);
                      })
                      .map((rate) => (
                        <tr key={rate.id}>
                          <td>
                            <span className="font-mono font-medium text-primary-900">
                              {rate.fromCurrency}
                            </span>
                            <span className="text-primary-400 mx-2">→</span>
                            <span className="font-mono font-medium text-primary-700">
                              {rate.toCurrency}
                            </span>
                          </td>
                          <td className="text-right">
                            {editingId === rate.id ? (
                              <input
                                type="number"
                                step="0.000001"
                                min="0.000001"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="input w-36 text-right font-mono"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(rate);
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                              />
                            ) : (
                              <span className="font-mono tabular-nums text-primary-900">
                                {formatRate(rate.rate)}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                                rate.source === 'TCMB'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {rate.source === 'TCMB' ? 'TCMB' : 'Manuel'}
                            </span>
                          </td>
                          <td className="text-sm text-primary-500">
                            {formatDate(rate.fetchedAt)}
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              {editingId === rate.id ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEdit(rate)}
                                    disabled={isSaving}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                                    title="Kaydet"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={isSaving}
                                    className="p-1.5 text-primary-400 hover:bg-primary-100 rounded transition-colors disabled:opacity-50"
                                    title="İptal"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleEdit(rate)}
                                    className="p-1.5 text-primary-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Düzenle"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(rate.id)}
                                    className="p-1.5 text-primary-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    title="Sil"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
      )}

      {/* Quick Reference */}
      <Card>
        <div className="p-4">
          <h3 className="font-semibold text-primary-900 mb-3">Kur Kullanım Rehberi</h3>
          <div className="text-sm text-primary-600 space-y-2">
            <p>
              <strong>EUR → USD = 1.1878</strong> demek: 1 EUR = 1.1878 USD
            </p>
            <p>
              <strong>USD → TRY = 43.35</strong> demek: 1 USD = 43.35 TRY
            </p>
            <p>
              Teklifte USD ürün EUR'a çevrilecekse: USD tutarı × (USD → EUR kuru) = EUR tutarı
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
