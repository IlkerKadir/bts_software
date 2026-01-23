'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';

interface Company {
  id: string;
  name: string;
}

interface ProjectFormData {
  id?: string;
  name: string;
  clientId: string;
  status: string;
  estimatedStart?: string | null;
  estimatedEnd?: string | null;
  notes?: string | null;
}

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: ProjectFormData | null;
}

const statusOptions = [
  { value: 'TEKLIF_ASAMASINDA', label: 'Teklif Aşamasında' },
  { value: 'ONAYLANDI', label: 'Onaylandı' },
  { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
  { value: 'TAMAMLANDI', label: 'Tamamlandı' },
  { value: 'IPTAL', label: 'İptal' },
];

export function ProjectForm({ isOpen, onClose, onSuccess, initialData }: ProjectFormProps) {
  const isEditing = !!initialData?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);

  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialData?.name || '',
    clientId: initialData?.clientId || '',
    status: initialData?.status || 'TEKLIF_ASAMASINDA',
    estimatedStart: initialData?.estimatedStart || '',
    estimatedEnd: initialData?.estimatedEnd || '',
    notes: initialData?.notes || '',
  });

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies?limit=100');
        const data = await response.json();
        setCompanies(data.companies || []);
      } catch (err) {
        console.error('Error fetching companies:', err);
      }
    };

    if (isOpen) {
      fetchCompanies();
    }
  }, [isOpen]);

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        clientId: initialData.clientId || '',
        status: initialData.status || 'TEKLIF_ASAMASINDA',
        estimatedStart: initialData.estimatedStart ? initialData.estimatedStart.split('T')[0] : '',
        estimatedEnd: initialData.estimatedEnd ? initialData.estimatedEnd.split('T')[0] : '',
        notes: initialData.notes || '',
      });
    } else {
      setFormData({
        name: '',
        clientId: '',
        status: 'TEKLIF_ASAMASINDA',
        estimatedStart: '',
        estimatedEnd: '',
        notes: '',
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/projects/${initialData.id}` : '/api/projects';
      const method = isEditing ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        estimatedStart: formData.estimatedStart || null,
        estimatedEnd: formData.estimatedEnd || null,
        notes: formData.notes || null,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Bir hata oluştu');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof ProjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Proje Düzenle' : 'Yeni Proje'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            İptal
          </Button>
          <Button onClick={handleSubmit} isLoading={isLoading}>
            {isEditing ? 'Güncelle' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          label="Proje Adı *"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Proje adı"
          required
        />

        <Select
          label="Firma *"
          value={formData.clientId}
          onChange={(e) => handleChange('clientId', e.target.value)}
          options={[
            { value: '', label: 'Firma Seçin' },
            ...companies.map(c => ({ value: c.id, label: c.name })),
          ]}
          required
        />

        <Select
          label="Durum"
          value={formData.status}
          onChange={(e) => handleChange('status', e.target.value)}
          options={statusOptions}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Tahmini Başlangıç"
            type="date"
            value={formData.estimatedStart || ''}
            onChange={(e) => handleChange('estimatedStart', e.target.value)}
          />

          <Input
            label="Tahmini Bitiş"
            type="date"
            value={formData.estimatedEnd || ''}
            onChange={(e) => handleChange('estimatedEnd', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-primary-700">Notlar</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Proje notları..."
            rows={3}
            className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>
      </form>
    </Modal>
  );
}
