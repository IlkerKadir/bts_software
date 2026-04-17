'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Plus, Trash2, Loader2, Save, X, Pencil, EyeOff, Eye } from 'lucide-react';
import { Button, Input } from '@/components/ui';

interface PriceLabelOption {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Admin UI for the PriceLabelOption catalog. These options appear in
 * the quote editor's right-click menu where users mark an item as
 * "TARAFINIZCA SAĞLANACAKTIR" / "FİYATA DAHİLDİR" / etc.
 *
 * Note: QuoteItem.priceLabel stores the literal label text, not an FK.
 * Deleting or renaming a row here does not break existing quotes — they
 * keep rendering whatever was stored when the label was picked.
 */
export function PriceLabelOptionsList() {
  const [options, setOptions] = useState<PriceLabelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PriceLabelOption | null>(null);
  const [deleting, setDeleting] = useState<PriceLabelOption | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/price-labels');
      if (!res.ok) throw new Error('Etiketler yüklenemedi');
      const data = await res.json();
      setOptions(data.options || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/settings/price-labels/${deleting.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Silinemedi');
      }
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggleActive = async (opt: PriceLabelOption) => {
    try {
      const res = await fetch(`/api/settings/price-labels/${opt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !opt.isActive }),
      });
      if (!res.ok) throw new Error('Güncellenemedi');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent-900">Fiyat Etiketleri</h1>
          <p className="text-sm text-accent-600 mt-1">
            Teklif kalemlerinde fiyat yerine kullanılabilen etiket seçenekleri.
            Buradaki değişiklikler geçmiş tekliflerdeki etiketleri etkilemez.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Yeni Etiket
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-lg border border-dashed border-accent-300 bg-accent-50 p-8 text-center text-sm text-accent-500">
          Henüz etiket yok. Yeni Etiket butonu ile ilk etiketi ekleyin.
        </div>
      ) : (
        <div className="rounded-lg border border-accent-200 bg-white divide-y divide-accent-200">
          {options.map(o => (
            <div key={o.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-accent-900">
                    {o.label}
                  </span>
                  {!o.isActive && (
                    <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] text-accent-500">
                      Pasif
                    </span>
                  )}
                </div>
                <p className="text-xs text-accent-500 mt-0.5">Sıra: {o.sortOrder}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleActive(o)}
                  className="rounded p-1.5 text-accent-500 hover:bg-accent-100 hover:text-accent-900"
                  title={o.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                >
                  {o.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(o); setFormOpen(true); }}
                  className="rounded p-1.5 text-accent-500 hover:bg-accent-100 hover:text-accent-900"
                  title="Düzenle"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(o)}
                  className="rounded p-1.5 text-accent-500 hover:bg-red-50 hover:text-red-600"
                  title="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <PriceLabelForm
          initialData={editing}
          onClose={() => setFormOpen(false)}
          onSuccess={() => { setFormOpen(false); load(); }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-accent-900">Etiketi sil</h3>
            <p className="mt-2 text-xs text-accent-600">
              <span className="font-semibold">{deleting.label}</span> etiketi silinecek.
              Daha önce bu etiketi seçmiş teklifler etkilenmez.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleting(null)} disabled={deleteBusy}>
                İptal
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FormProps {
  initialData: PriceLabelOption | null;
  onClose: () => void;
  onSuccess: () => void;
}

function PriceLabelForm({ initialData, onClose, onSuccess }: FormProps) {
  const isEdit = !!initialData;
  const [label, setLabel] = useState(initialData?.label ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initialData?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setError('Etiket metni zorunludur');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/settings/price-labels/${initialData!.id}`
        : '/api/settings/price-labels';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), sortOrder, isActive }),
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
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-semibold text-accent-900">
            {isEdit ? 'Etiketi Düzenle' : 'Yeni Fiyat Etiketi'}
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
            <label className="block text-xs font-medium text-accent-700 mb-1">Etiket Metni</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Örnek: Sevkiyata Dahil"
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
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-accent-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Aktif
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
