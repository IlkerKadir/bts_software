'use client';

import { useState, useEffect, useCallback } from 'react';
import { Filter, Save, Trash2, ChevronDown, Star } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';

interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
}

interface SavedFiltersDropdownProps {
  entity: string;
  currentFilters: Record<string, unknown>;
  onApplyFilter: (filters: Record<string, unknown>) => void;
}

export function SavedFiltersDropdown({
  entity,
  currentFilters,
  onApplyFilter,
}: SavedFiltersDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchFilters = useCallback(async () => {
    try {
      const response = await fetch(`/api/saved-filters?entity=${entity}`);
      if (response.ok) {
        const data = await response.json();
        setFilters(data.filters || []);

        // Auto-apply default filter on first load
        const defaultFilter = data.filters?.find((f: SavedFilter) => f.isDefault);
        if (defaultFilter && Object.keys(currentFilters).length === 0) {
          onApplyFilter(defaultFilter.filters);
        }
      }
    } catch (error) {
      console.error('Failed to fetch filters:', error);
    }
  }, [entity]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const handleSaveFilter = async () => {
    if (!newFilterName.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFilterName.trim(),
          entity,
          filters: currentFilters,
        }),
      });

      if (response.ok) {
        await fetchFilters();
        setNewFilterName('');
        setIsSaveOpen(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Kaydetme başarısız');
      }
    } catch (error) {
      console.error('Save filter error:', error);
      alert('Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFilter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Bu filtreyi silmek istediğinize emin misiniz?')) return;

    try {
      const response = await fetch(`/api/saved-filters?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchFilters();
      }
    } catch (error) {
      console.error('Delete filter error:', error);
    }
  };

  const handleApplyFilter = (filter: SavedFilter) => {
    onApplyFilter(filter.filters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(currentFilters).some(
    (v) => v !== undefined && v !== '' && v !== null
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {/* Main dropdown button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="relative"
        >
          <Filter className="w-4 h-4 mr-1" />
          Filtreler
          {filters.length > 0 && (
            <span className="ml-1 text-xs bg-primary-200 px-1.5 rounded-full">
              {filters.length}
            </span>
          )}
          <ChevronDown className="w-4 h-4 ml-1" />
        </Button>

        {/* Save current filter button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSaveOpen(!isSaveOpen)}
            title="Filtreyi Kaydet"
          >
            <Save className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-primary-200 z-20">
            {filters.length > 0 ? (
              <div className="py-1">
                {filters.map((filter) => (
                  <div
                    key={filter.id}
                    onClick={() => handleApplyFilter(filter)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-primary-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {filter.isDefault && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      )}
                      <span className="text-sm text-primary-800">
                        {filter.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteFilter(filter.id, e)}
                      className="p-1 hover:bg-red-100 rounded text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-sm text-primary-500">
                Kayıtlı filtre yok
              </div>
            )}
          </div>
        </>
      )}

      {/* Save filter modal */}
      {isSaveOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsSaveOpen(false)}
          />
          <div className="absolute left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-primary-200 z-20 p-3">
            <h4 className="text-sm font-medium text-primary-800 mb-2">
              Filtreyi Kaydet
            </h4>
            <input
              type="text"
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Filtre adı..."
              className="w-full px-2 py-1.5 text-sm border border-primary-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveFilter();
                if (e.key === 'Escape') setIsSaveOpen(false);
              }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSaveOpen(false)}
              >
                İptal
              </Button>
              <Button
                size="sm"
                onClick={handleSaveFilter}
                disabled={!newFilterName.trim() || isSaving}
              >
                {isSaving ? <Spinner size="sm" /> : 'Kaydet'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
