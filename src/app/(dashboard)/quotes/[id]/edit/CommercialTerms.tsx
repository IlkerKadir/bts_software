'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Card, Modal } from '@/components/ui';

interface CommercialTerm {
  id: string;
  sortOrder: number;
  category: string;
  value: string;
}

interface CommercialTermsProps {
  quoteId: string;
  onUpdate?: () => void;
}

// Default commercial terms templates
const defaultTerms = [
  {
    category: 'Teslimat Süresi',
    value: 'Sipariş onayından itibaren 4-6 hafta içinde teslim edilecektir.',
  },
  {
    category: 'Ödeme Koşulları',
    value: 'Sipariş onayında %50, teslimatta %50 ödeme.',
  },
  {
    category: 'Garanti',
    value: 'Ürünler 2 yıl üretici garantisi kapsamındadır.',
  },
  {
    category: 'Teslimat Şekli',
    value: 'Teslimat, belirtilen adrese yapılacaktır. Nakliye ücreti fiyata dahildir.',
  },
  {
    category: 'Geçerlilik Süresi',
    value: 'Bu teklif, belirtilen geçerlilik süresi boyunca geçerlidir.',
  },
];

export function CommercialTerms({ quoteId, onUpdate }: CommercialTermsProps) {
  const [terms, setTerms] = useState<CommercialTerm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingTerm, setEditingTerm] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ category: '', value: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Fetch terms
  const fetchTerms = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms`);
      const data = await response.json();
      if (response.ok) {
        setTerms(data.terms || []);
      }
    } catch (err) {
      console.error('Error fetching terms:', err);
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  // Add term from template
  const handleAddFromTemplate = async (template: { category: string; value: string }) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });

      if (response.ok) {
        await fetchTerms();
        setShowTemplates(false);
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error adding term:', err);
    }
  };

  // Add custom term
  const handleAddCustom = async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Yeni Şart',
          value: 'İçerik ekleyin...',
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setTerms(prev => [...prev, data.term]);
        setEditingTerm(data.term.id);
        setEditValues({ category: data.term.category, value: data.term.value });
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error adding term:', err);
    }
  };

  // Start editing
  const startEditing = (term: CommercialTerm) => {
    setEditingTerm(term.id);
    setEditValues({ category: term.category, value: term.value });
  };

  // Save edit
  const saveEdit = async () => {
    if (!editingTerm) return;

    try {
      await fetch(`/api/quotes/${quoteId}/terms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: [{ id: editingTerm, ...editValues }],
        }),
      });

      setTerms(prev => prev.map(t =>
        t.id === editingTerm ? { ...t, ...editValues } : t
      ));
      setEditingTerm(null);
      onUpdate?.();
    } catch (err) {
      console.error('Error updating term:', err);
    }
  };

  // Delete term
  const handleDelete = async (termId: string) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms/${termId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTerms(prev => prev.filter(t => t.id !== termId));
        setShowDeleteConfirm(null);
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error deleting term:', err);
    }
  };

  return (
    <Card>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 font-semibold text-primary-900 cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Ticari Şartlar
            <span className="text-sm font-normal text-primary-500">({terms.length})</span>
          </button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowTemplates(true)}>
              Şablon Ekle
            </Button>
            <Button size="sm" variant="secondary" onClick={handleAddCustom}>
              <Plus className="w-3 h-3" />
              Ekle
            </Button>
          </div>
        </div>

        {/* Terms List */}
        {isExpanded && (
          <div className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-primary-500">Yükleniyor...</p>
            ) : terms.length === 0 ? (
              <p className="text-sm text-primary-500 text-center py-4">
                Henüz ticari şart eklenmedi.
                <button
                  onClick={() => setShowTemplates(true)}
                  className="text-accent-600 hover:underline ml-1 cursor-pointer"
                >
                  Şablon ekle
                </button>
              </p>
            ) : (
              terms.map((term) => (
                <div
                  key={term.id}
                  className="border border-primary-200 rounded-lg p-3 hover:border-primary-300 transition-colors"
                >
                  {editingTerm === term.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editValues.category}
                        onChange={(e) => setEditValues(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-500"
                        autoFocus
                      />
                      <textarea
                        value={editValues.value}
                        onChange={(e) => setEditValues(prev => ({ ...prev, value: e.target.value }))}
                        className="w-full px-2 py-1 border border-primary-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-500"
                        rows={3}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditingTerm(null)}>
                          İptal
                        </Button>
                        <Button size="sm" onClick={saveEdit}>
                          Kaydet
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="text-primary-400 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4
                          className="font-medium text-primary-800 text-sm cursor-pointer hover:text-accent-700"
                          onClick={() => startEditing(term)}
                        >
                          {term.category}
                        </h4>
                        <p
                          className="text-sm text-primary-600 mt-1 whitespace-pre-wrap cursor-pointer hover:text-primary-800"
                          onClick={() => startEditing(term)}
                        >
                          {term.value}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirm(term.id)}
                        className="p-1 text-primary-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Templates Modal */}
      <Modal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        title="Şablon Seç"
        size="md"
      >
        <div className="space-y-2">
          {defaultTerms.map((template, index) => (
            <button
              key={index}
              onClick={() => handleAddFromTemplate(template)}
              className="w-full text-left p-3 border border-primary-200 rounded-lg hover:border-accent-500 hover:bg-accent-50 transition-colors cursor-pointer"
            >
              <h4 className="font-medium text-primary-800">{template.category}</h4>
              <p className="text-sm text-primary-600 mt-1">{template.value}</p>
            </button>
          ))}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Ticari Şartı Sil"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
              İptal
            </Button>
            <Button
              variant="danger"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            >
              Sil
            </Button>
          </>
        }
      >
        <p className="text-primary-600">
          Bu ticari şartı silmek istediğinize emin misiniz?
        </p>
      </Modal>
    </Card>
  );
}
