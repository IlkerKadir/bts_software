'use client';

import { useState } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';

interface Contact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

interface CompanyFormData {
  id?: string;
  name: string;
  type: 'CLIENT' | 'PARTNER';
  address?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  contacts?: Contact[] | null;
  notes?: string | null;
  isActive?: boolean;
}

interface CompanyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: CompanyFormData | null;
}

export function CompanyForm({ isOpen, onClose, onSuccess, initialData }: CompanyFormProps) {
  const isEditing = !!initialData?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<CompanyFormData>({
    name: initialData?.name || '',
    type: initialData?.type || 'CLIENT',
    address: initialData?.address || '',
    taxNumber: initialData?.taxNumber || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    notes: initialData?.notes || '',
    isActive: initialData?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/companies/${initialData.id}` : '/api/companies';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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

  const handleChange = (field: keyof CompanyFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Firma Düzenle' : 'Yeni Firma'}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Firma Adı *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Firma adını giriniz"
            required
          />

          <Select
            label="Firma Tipi *"
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value as 'CLIENT' | 'PARTNER')}
            options={[
              { value: 'CLIENT', label: 'Müşteri' },
              { value: 'PARTNER', label: 'İş Ortağı' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Vergi No"
            value={formData.taxNumber || ''}
            onChange={(e) => handleChange('taxNumber', e.target.value)}
            placeholder="Vergi numarası"
          />

          <Input
            label="Telefon"
            value={formData.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="Telefon numarası"
          />
        </div>

        <Input
          label="E-posta"
          type="email"
          value={formData.email || ''}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="E-posta adresi"
        />

        <div>
          <label className="text-sm font-medium text-primary-700">Adres</label>
          <textarea
            value={formData.address || ''}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Firma adresi"
            rows={2}
            className="mt-1.5 w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-primary-700">Notlar</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Firma hakkında notlar"
            rows={2}
            className="mt-1.5 w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>

        {isEditing && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => handleChange('isActive', e.target.checked)}
              className="w-4 h-4 rounded border-primary-300 text-accent-600 focus:ring-accent-500"
            />
            <label htmlFor="isActive" className="text-sm text-primary-700">
              Aktif firma
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
