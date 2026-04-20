'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, Loader2, Save, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';

type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'TRY';
const ALL_CURRENCIES: Array<{ code: CurrencyCode; symbol: string; label: string }> = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dolar' },
  { code: 'GBP', symbol: '£', label: 'Sterlin' },
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
];

interface QuoteDefaults {
  units: string[];
  defaultVatRate: number;
  currencies: Array<{ code: CurrencyCode; symbol: string; label: string }>;
}

export function QuoteDefaultsForm() {
  const [defaults, setDefaults] = useState<QuoteDefaults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newUnit, setNewUnit] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/quote-defaults')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then((data: { defaults: QuoteDefaults }) => {
        if (!cancelled) {
          setDefaults(data.defaults);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Varsayılanlar yüklenemedi');
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [success]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }
  if (!defaults) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || 'Varsayılanlar yüklenemedi'}
        </div>
      </div>
    );
  }

  const addUnit = () => {
    const trimmed = newUnit.trim();
    if (!trimmed) return;
    if (defaults.units.includes(trimmed)) {
      setError('Bu birim zaten listede');
      return;
    }
    setDefaults({ ...defaults, units: [...defaults.units, trimmed] });
    setNewUnit('');
    setError(null);
  };

  const removeUnit = (u: string) => {
    setDefaults({ ...defaults, units: defaults.units.filter(x => x !== u) });
  };

  const toggleCurrency = (c: (typeof ALL_CURRENCIES)[number]) => {
    const has = defaults.currencies.some(x => x.code === c.code);
    if (has) {
      if (defaults.currencies.length === 1) {
        setError('En az bir para birimi seçili olmalı');
        return;
      }
      setDefaults({ ...defaults, currencies: defaults.currencies.filter(x => x.code !== c.code) });
    } else {
      setDefaults({ ...defaults, currencies: [...defaults.currencies, c] });
    }
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (defaults.units.length === 0) {
      setError('En az bir birim gerekli');
      return;
    }
    if (defaults.currencies.length === 0) {
      setError('En az bir para birimi gerekli');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/quote-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Kaydedilemedi');
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-accent-900">Teklif Varsayılanları</h1>
        <p className="text-sm text-accent-600 mt-1">
          Yeni teklif kalemlerinde kullanılan birim listesi ve seçilebilir para birimleri.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
          <Check className="h-4 w-4" /> Değişiklikler kaydedildi
        </div>
      )}

      {/* Unit list */}
      <section className="rounded-lg border border-accent-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-accent-900 mb-3">Birim Listesi</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {defaults.units.map(u => (
            <span
              key={u}
              className="inline-flex items-center gap-2 rounded-full bg-primary-50 text-primary-700 px-3 py-1 text-xs font-medium"
            >
              {u}
              <button
                type="button"
                onClick={() => removeUnit(u)}
                className="hover:text-red-600"
                title="Kaldır"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 max-w-sm">
          <Input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="Yeni birim (örn: kg, m², Saat)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUnit();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addUnit}>
            <Plus className="h-4 w-4" /> Ekle
          </Button>
        </div>
      </section>

      {/* Currency list */}
      <section className="rounded-lg border border-accent-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-accent-900 mb-1">Kullanılabilir Para Birimleri</h2>
        <p className="text-xs text-accent-500 mb-3">
          Teklif editöründe seçilebilen para birimlerini işaretleyin. Geçmiş teklifler
          buradaki seçimden bağımsızdır; her zaman kendi kayıtlı para birimi ile gösterilir.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_CURRENCIES.map(c => {
            const active = defaults.currencies.some(x => x.code === c.code);
            return (
              <label
                key={c.code}
                className="flex items-center gap-3 rounded border border-accent-200 px-3 py-2 cursor-pointer hover:bg-accent-50"
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCurrency(c)}
                />
                <span className="text-lg font-bold text-accent-700 w-6">{c.symbol}</span>
                <span className="text-sm text-accent-900">{c.label}</span>
                <span className="text-xs text-accent-400 ml-auto">{c.code}</span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
      </div>
    </form>
  );
}
