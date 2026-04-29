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
  const isMatrixCategory = activeCategory === 'uretici_firmalar';

  // Quick-add input state for the matrix editor — one input per side
  // (markalar / sistemler) so the user can hammer through 10 brands and
  // 5 systems without opening the modal each time.
  const [quickBrand, setQuickBrand] = useState('');
  const [quickSystem, setQuickSystem] = useState('');
  const [quickAddBusy, setQuickAddBusy] = useState(false);

  // Drag-and-drop reordering for the matrix panels. The dragged id and
  // the current drop target id are kept in state so the row under the
  // pointer can show a top-border cue without re-rendering all rows.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  const SYSTEM_PREFIX = 'Sistem:';

  const matrixBrands = filtered.filter((t) => !t.name.startsWith(SYSTEM_PREFIX));
  const matrixSystems = filtered.filter((t) => t.name.startsWith(SYSTEM_PREFIX));

  // Persist a new ordering by renumbering with gaps (10, 20, 30...) so
  // future single-row sortOrder edits via the modal still slot in
  // cleanly. Optimistic local update; PATCHes go out in parallel.
  const persistReorder = async (kind: 'marka' | 'sistem', orderedIds: string[]) => {
    const updates = orderedIds.map((id, i) => ({ id, sortOrder: (i + 1) * 10 }));
    setTemplates((prev) =>
      prev.map((t) => {
        const u = updates.find((x) => x.id === t.id);
        return u ? { ...t, sortOrder: u.sortOrder } : t;
      })
    );
    setReorderBusy(true);
    try {
      await Promise.all(
        updates.map((u) =>
          fetch(`/api/settings/commercial-terms/${u.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: u.sortOrder }),
          })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sıralama kaydedilemedi');
      // Reload to restore server-side truth on failure
      await load();
    } finally {
      setReorderBusy(false);
      void kind; // documented kind for clarity even though no per-kind branch needed
    }
  };

  const handleDrop = (targetId: string, kind: 'marka' | 'sistem') => {
    const id = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    if (!id || id === targetId) return;
    const list = (kind === 'marka' ? matrixBrands : matrixSystems)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'));
    const fromIdx = list.findIndex((t) => t.id === id);
    const toIdx = list.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    void persistReorder(kind, list.map((t) => t.id));
  };

  const handleQuickAdd = async (kind: 'marka' | 'sistem') => {
    const raw = (kind === 'marka' ? quickBrand : quickSystem).trim();
    if (!raw) return;
    setQuickAddBusy(true);
    try {
      const finalName = kind === 'sistem' ? `${SYSTEM_PREFIX} ${raw}` : raw;
      const res = await fetch('/api/settings/commercial-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'uretici_firmalar',
          name: finalName,
          value: '',
          sortOrder: 0,
          isDefault: false,
          highlight: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Eklenemedi');
        return;
      }
      if (kind === 'marka') setQuickBrand('');
      else setQuickSystem('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setQuickAddBusy(false);
    }
  };

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
      ) : isMatrixCategory ? (
        // Matrix-style editor for Üretici Firmalar: two side-by-side
        // panels with inline quick-add inputs. Avoids opening the modal
        // for every single brand or system addition.
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { kind: 'marka' as const, title: 'Markalar (Satırlar)', items: matrixBrands, value: quickBrand, setValue: setQuickBrand, placeholder: 'Örn: DSPA' },
            { kind: 'sistem' as const, title: 'Sistemler (Sütunlar)', items: matrixSystems, value: quickSystem, setValue: setQuickSystem, placeholder: 'Örn: Aerosol Söndürme' },
          ].map((panel) => (
            <div key={panel.kind} className="rounded-lg border border-accent-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-accent-900">
                  {panel.title}
                </h3>
                <span className="text-xs text-accent-500">{panel.items.length} adet</span>
              </div>

              {/* Quick-add input */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={panel.value}
                  onChange={(e) => panel.setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleQuickAdd(panel.kind);
                    }
                  }}
                  placeholder={panel.placeholder}
                  disabled={quickAddBusy}
                  className="flex-1 rounded border border-accent-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleQuickAdd(panel.kind)}
                  disabled={quickAddBusy || !panel.value.trim()}
                >
                  <Plus className="h-3.5 w-3.5" /> Ekle
                </Button>
              </div>

              {/* Existing items */}
              {panel.items.length === 0 ? (
                <div className="rounded border border-dashed border-accent-200 bg-accent-50 p-4 text-center text-xs text-accent-500">
                  Henüz {panel.kind === 'marka' ? 'marka' : 'sistem'} eklenmemiş.
                </div>
              ) : (
                <ul className="space-y-1">
                  {panel.items
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'))
                    .map((t) => {
                      const displayName = panel.kind === 'sistem'
                        ? t.name.replace(SYSTEM_PREFIX, '').trim()
                        : t.name;
                      const isDragged = draggedId === t.id;
                      const isDragOver = dragOverId === t.id && draggedId && draggedId !== t.id;
                      return (
                        <li
                          key={t.id}
                          draggable={!reorderBusy}
                          onDragStart={(e) => {
                            setDraggedId(t.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDragOverId(null);
                          }}
                          onDragOver={(e) => {
                            if (!draggedId || draggedId === t.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverId !== t.id) setDragOverId(t.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverId === t.id) setDragOverId(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDrop(t.id, panel.kind);
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded border bg-white px-3 py-1.5 text-sm group transition-colors',
                            isDragged ? 'border-primary-400 opacity-50' : 'border-accent-200',
                            isDragOver && 'border-t-2 border-t-primary-500',
                            !reorderBusy && 'cursor-grab active:cursor-grabbing'
                          )}
                          title="Sürükleyerek sırasını değiştirin"
                        >
                          <span className="flex-1 truncate text-accent-800 select-none">{displayName}</span>
                          <button
                            type="button"
                            onClick={() => { setEditing(t); setFormOpen(true); }}
                            className="rounded p-1 text-accent-400 hover:bg-accent-100 hover:text-accent-900 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Düzenle"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(t)}
                            className="rounded p-1 text-accent-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          ))}
          <div className="md:col-span-2 text-xs text-accent-500 italic">
            Marka × Sistem kesişimleri teklif hazırlanırken Üretici Firmalar matrisinden işaretlenir.
            Sıralama, varsayılan ve vurgulu ayarları için kalemin yanındaki kalem ikonuna tıklayın.
          </div>
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
