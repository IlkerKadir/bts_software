'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Clock, AlertCircle, Check } from 'lucide-react';
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
}

const CURRENCIES = ['EUR', 'USD', 'GBP'];

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
    toCurrency: 'TRY',
    rate: '',
  });
  const [isAdding, setIsAdding] = useState(false);

  const fetchRates = useCallback(async () => {
    try {
      const response = await fetch('/api/exchange-rates/sync');
      if (response.ok) {
        const data: SyncStatus = await response.json();
        setRates(data.rates);
        setLastSyncAt(data.lastSyncAt);
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

      setSuccessMessage('Döviz kuru eklendi');
      setShowAddForm(false);
      setNewRate({ fromCurrency: 'EUR', toCurrency: 'TRY', rate: '' });
      fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsAdding(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
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
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-700">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Last Sync Info */}
      {lastSyncAt && (
        <div className="flex items-center gap-2 text-sm text-primary-500">
          <Clock className="w-4 h-4" />
          Son güncelleme: {formatDate(lastSyncAt)}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-primary-900 mb-4">Manuel Döviz Kuru Ekle</h3>
            <form onSubmit={handleAddRate} className="flex items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Para Birimi
                </label>
                <select
                  value={newRate.fromCurrency}
                  onChange={(e) => setNewRate({ ...newRate, fromCurrency: e.target.value })}
                  className="input w-32"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="text-primary-500 pb-2">→</div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Hedef
                </label>
                <input
                  type="text"
                  value={newRate.toCurrency}
                  disabled
                  className="input w-20 bg-primary-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-1">
                  Kur
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  placeholder="36.8500"
                  className="input w-32"
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
          </div>
        </Card>
      )}

      {/* Rates Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Para Birimi</th>
                <th className="text-right">Kur (TRY)</th>
                <th>Kaynak</th>
                <th>Güncelleme</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-primary-500 py-8">
                    Henüz döviz kuru bulunmuyor. TCMB'den güncelleyebilir veya manuel ekleyebilirsiniz.
                  </td>
                </tr>
              ) : (
                rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <span className="font-mono font-medium">{rate.fromCurrency}</span>
                      <span className="text-primary-400 mx-2">→</span>
                      <span className="font-mono text-primary-500">{rate.toCurrency}</span>
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {rate.rate.toLocaleString('tr-TR', {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
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
                      <button
                        onClick={() => handleDelete(rate.id)}
                        className="p-1 text-primary-400 hover:text-red-500 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
