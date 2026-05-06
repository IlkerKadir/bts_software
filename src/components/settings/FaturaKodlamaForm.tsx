'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Spinner } from '@/components/ui';
import type { RefNoOption, RefNoOptionGroups } from '@/lib/refno-options';

const CATEGORY_LABELS: Record<keyof RefNoOptionGroups, string> = {
  a: 'A — Bölüm',
  b: 'B — Konu',
  c: 'C — Kişi',
  d: 'D — Üretici',
};

const CATEGORY_HINTS: Record<keyof RefNoOptionGroups, string> = {
  a: 'Tek karakter (genelde rakam). Örn: 1, 2, 3, 4',
  b: 'Tek karakter (rakam). Örn: 1, 2, 3, 4, 5, 6, 7, 8',
  c: 'Tek karakter (rakam). Örn: 1, 2, 5, 6, 7, 8, 9',
  d: 'Tek karakter (genelde harf). Örn: A, B, C, D, ...',
};

export function FaturaKodlamaForm() {
  const [options, setOptions] = useState<RefNoOptionGroups | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings/refno-options');
        if (res.ok) {
          const data = await res.json();
          setOptions(data.options);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const updateOption = (
    category: keyof RefNoOptionGroups,
    index: number,
    field: keyof RefNoOption,
    value: string,
  ) => {
    if (!options) return;
    const list = [...options[category]];
    list[index] = { ...list[index], [field]: value };
    setOptions({ ...options, [category]: list });
  };

  const addOption = (category: keyof RefNoOptionGroups) => {
    if (!options) return;
    setOptions({
      ...options,
      [category]: [...options[category], { value: '', label: '' }],
    });
  };

  const removeOption = (category: keyof RefNoOptionGroups, index: number) => {
    if (!options) return;
    const list = options[category].filter((_, i) => i !== index);
    setOptions({ ...options, [category]: list });
  };

  const handleSave = async () => {
    if (!options) return;
    setError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/refno-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kaydetme başarısız');
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !options) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Fatura Kodlama</h1>
          <p className="text-sm text-primary-500 mt-1">
            Teklif başlığında "Fatura Kodu" oluştururken kullanılan A/B/C/D listelerini düzenleyin.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4" />
          {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          Kaydedildi ✓
        </div>
      )}

      {(['a', 'b', 'c', 'd'] as const).map((cat) => (
        <Card key={cat}>
          <CardHeader>
            <div>
              <h3 className="font-semibold text-primary-900">{CATEGORY_LABELS[cat]}</h3>
              <p className="text-xs text-primary-500 mt-1">{CATEGORY_HINTS[cat]}</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {options[cat].map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.value}
                    onChange={(e) => updateOption(cat, idx, 'value', e.target.value)}
                    placeholder="Değer"
                    className="w-20 px-3 py-1.5 border border-primary-300 rounded-md text-sm"
                    maxLength={3}
                  />
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(cat, idx, 'label', e.target.value)}
                    placeholder="Etiket (örn: '1 - Yönetim')"
                    className="flex-1 px-3 py-1.5 border border-primary-300 rounded-md text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(cat, idx)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addOption(cat)}
              >
                <Plus className="w-4 h-4" />
                Seçenek Ekle
              </Button>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
