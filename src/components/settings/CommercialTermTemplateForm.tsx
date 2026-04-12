'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { TermTemplate } from './CommercialTermTemplatesList';

interface Props {
  initialData: TermTemplate | null;
  defaultCategory: string;
  categories: readonly { readonly key: string; readonly label: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export function CommercialTermTemplateForm({
  initialData,
  defaultCategory,
  categories,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = !!initialData;
  const [category, setCategory] = useState(initialData?.category ?? defaultCategory);
  const [name, setName] = useState(initialData?.name ?? '');
  const [value, setValue] = useState(initialData?.value ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initialData?.sortOrder ?? 0);
  const [isDefault, setIsDefault] = useState(initialData?.isDefault ?? false);
  const [highlight, setHighlight] = useState(initialData?.highlight ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the parent switches the selected template while the modal is open,
  // reset the local state to match.
  useEffect(() => {
    setCategory(initialData?.category ?? defaultCategory);
    setName(initialData?.name ?? '');
    setValue(initialData?.value ?? '');
    setSortOrder(initialData?.sortOrder ?? 0);
    setIsDefault(initialData?.isDefault ?? false);
    setHighlight(initialData?.highlight ?? false);
    setError(null);
  }, [initialData, defaultCategory]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) {
      setError('Ad ve metin zorunludur');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/settings/commercial-terms/${initialData!.id}`
        : '/api/settings/commercial-terms';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          name: name.trim(),
          value: value.trim(),
          sortOrder,
          isDefault,
          highlight,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Kaydedilemedi');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-semibold text-accent-900">
            {isEdit ? 'Şablonu Düzenle' : 'Yeni Ticari Şart Şablonu'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-accent-400 hover:bg-accent-100 hover:text-accent-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-accent-700 mb-1">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded border border-accent-300 bg-white px-2 py-1.5 text-sm"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-accent-700 mb-1">Şablon Adı</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: 2 yıl garanti"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-accent-700 mb-1">Şablon Metni</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={5}
              className="w-full rounded border border-accent-300 bg-white px-2 py-1.5 text-sm font-mono"
              placeholder="Teklife eklenecek tam metin…"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-accent-700 mb-1">Sıra</label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-accent-700">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Varsayılan
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-accent-700">
                <input
                  type="checkbox"
                  checked={highlight}
                  onChange={(e) => setHighlight(e.target.checked)}
                />
                Vurgulu
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
