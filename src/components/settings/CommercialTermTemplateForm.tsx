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

// "Üretici Firmalar" stores its data as a brand × system matrix. Each
// template row is either a brand (regular name) or a system column
// (name prefixed with "Sistem: "). The form surfaces this with a radio
// so admins don't have to know the prefix convention by heart.
const MATRIX_CATEGORY = 'uretici_firmalar';
const SYSTEM_PREFIX = 'Sistem:';

function splitMatrixName(name: string): { type: 'marka' | 'sistem'; base: string } {
  if (name.startsWith(SYSTEM_PREFIX)) {
    return { type: 'sistem', base: name.replace(SYSTEM_PREFIX, '').trim() };
  }
  return { type: 'marka', base: name };
}

function joinMatrixName(type: 'marka' | 'sistem', base: string): string {
  return type === 'sistem' ? `${SYSTEM_PREFIX} ${base.trim()}` : base.trim();
}

export function CommercialTermTemplateForm({
  initialData,
  defaultCategory,
  categories,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = !!initialData;
  const initialMatrixSplit = initialData ? splitMatrixName(initialData.name) : null;
  const [category, setCategory] = useState(initialData?.category ?? defaultCategory);
  const [name, setName] = useState(initialMatrixSplit?.base ?? initialData?.name ?? '');
  const [matrixType, setMatrixType] = useState<'marka' | 'sistem'>(initialMatrixSplit?.type ?? 'marka');
  const [value, setValue] = useState(initialData?.value ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initialData?.sortOrder ?? 0);
  const [isDefault, setIsDefault] = useState(initialData?.isDefault ?? false);
  const [highlight, setHighlight] = useState(initialData?.highlight ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMatrix = category === MATRIX_CATEGORY;

  // If the parent switches the selected template while the modal is open,
  // reset the local state to match.
  useEffect(() => {
    const split = initialData ? splitMatrixName(initialData.name) : null;
    setCategory(initialData?.category ?? defaultCategory);
    setName(split?.base ?? initialData?.name ?? '');
    setMatrixType(split?.type ?? 'marka');
    setValue(initialData?.value ?? '');
    setSortOrder(initialData?.sortOrder ?? 0);
    setIsDefault(initialData?.isDefault ?? false);
    setHighlight(initialData?.highlight ?? false);
    setError(null);
  }, [initialData, defaultCategory]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const matrix = category === MATRIX_CATEGORY;
    if (!name.trim()) {
      setError('Ad zorunludur');
      return;
    }
    if (!matrix && !value.trim()) {
      setError('Metin zorunludur');
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
          name: matrix ? joinMatrixName(matrixType, name) : name.trim(),
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

          {isMatrix && (
            <div>
              <label className="block text-xs font-medium text-accent-700 mb-1">Tür</label>
              <div className="flex gap-3 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="matrixType"
                    checked={matrixType === 'marka'}
                    onChange={() => setMatrixType('marka')}
                  />
                  <span>Marka</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="matrixType"
                    checked={matrixType === 'sistem'}
                    onChange={() => setMatrixType('sistem')}
                  />
                  <span>Sistem (matriste sütun)</span>
                </label>
              </div>
              <p className="mt-1 text-[11px] text-accent-500">
                Marka satır olarak, Sistem ise sütun olarak gösterilir. Marka × Sistem
                kesişimleri teklif hazırlanırken işaretlenir.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-accent-700 mb-1">
              {isMatrix ? (matrixType === 'sistem' ? 'Sistem Adı' : 'Marka Adı') : 'Şablon Adı'}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isMatrix
                  ? matrixType === 'sistem'
                    ? 'Örn: Aspirasyonlu Algılama Sistemi'
                    : 'Örn: DSPA'
                  : 'Örn: 2 yıl garanti'
              }
              required
            />
          </div>

          {!isMatrix && (
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
          )}

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
