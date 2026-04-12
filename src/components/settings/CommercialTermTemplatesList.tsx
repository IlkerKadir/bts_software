'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Star, Highlighter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CommercialTermTemplateForm } from './CommercialTermTemplateForm';

const TERM_CATEGORIES = [
  { key: 'uretici_firmalar', label: 'Üretici Firmalar' },
  { key: 'onaylar', label: 'Onaylar' },
  { key: 'garanti', label: 'Garanti' },
  { key: 'teslim_yeri', label: 'Teslim Yeri' },
  { key: 'odeme', label: 'Ödeme' },
  { key: 'kdv', label: 'KDV' },
  { key: 'teslimat', label: 'Teslimat' },
  { key: 'opsiyon', label: 'Opsiyon' },
  { key: 'DAHIL_OLMAYAN', label: 'Dahil Olmayan Hizmetler' },
  { key: 'NOTLAR', label: 'Notlar' },
] as const;

export interface TermTemplate {
  id: string;
  category: string;
  name: string;
  value: string;
  isDefault: boolean;
  sortOrder: number;
  highlight: boolean;
}

export function CommercialTermTemplatesList() {
  const [templates, setTemplates] = useState<TermTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(TERM_CATEGORIES[0].key);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TermTemplate | null>(null);
  const [deleting, setDeleting] = useState<TermTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/commercial-terms');
      if (!res.ok) throw new Error('Ticari şart şablonları yüklenemedi');
      const data = await res.json();
      setTemplates(data.templates || []);
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
      const res = await fetch(`/api/settings/commercial-terms/${deleting.id}`, {
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

  const filtered = templates.filter(t => t.category === activeCategory);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-accent-900">Ticari Şart Şablonları</h1>
          <p className="text-sm text-accent-600 mt-1">
            Teklif editöründen kullanılabilen tekrar kullanılabilir şart metinlerini yönetin.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Yeni Şablon
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b border-accent-200 mb-4">
        {TERM_CATEGORIES.map(cat => {
          const count = templates.filter(t => t.category === cat.key).length;
          const active = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-accent-600 hover:text-accent-900',
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className={cn(
                  'ml-2 rounded-full px-1.5 py-0.5 text-[10px]',
                  active ? 'bg-primary-100 text-primary-700' : 'bg-accent-100 text-accent-600',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-accent-300 bg-accent-50 p-8 text-center text-sm text-accent-500">
          Bu kategoride henüz şablon yok. Yeni Şablon butonu ile ilk şablonu ekleyin.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'))
            .map(t => (
              <div
                key={t.id}
                className="flex items-start gap-3 rounded-lg border border-accent-200 bg-white p-4 shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-accent-900">{t.name}</h3>
                    {t.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <Star className="h-3 w-3" /> Varsayılan
                      </span>
                    )}
                    {t.highlight && (
                      <span className="inline-flex items-center gap-1 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800">
                        <Highlighter className="h-3 w-3" /> Vurgulu
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-accent-700">{t.value}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEditing(t); setFormOpen(true); }}
                    className="rounded p-1.5 text-accent-500 hover:bg-accent-100 hover:text-accent-900"
                    title="Düzenle"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(t)}
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
        <CommercialTermTemplateForm
          initialData={editing}
          defaultCategory={activeCategory}
          categories={TERM_CATEGORIES}
          onClose={() => setFormOpen(false)}
          onSuccess={() => { setFormOpen(false); load(); }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-accent-900">Şablonu sil</h3>
            <p className="mt-2 text-xs text-accent-600">
              <span className="font-semibold">{deleting.name}</span> şablonu kalıcı olarak silinecek.
              Daha önce bu şablonu kullanan tekliflerde metin saklanmaya devam eder.
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
