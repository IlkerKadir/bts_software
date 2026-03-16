'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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

const emptyContact: Contact = { name: '', title: '', email: '', phone: '' };

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
    contacts: initialData?.contacts && Array.isArray(initialData.contacts) && initialData.contacts.length > 0
      ? initialData.contacts
      : [],
    notes: initialData?.notes || '',
    isActive: initialData?.isActive ?? true,
  });

  const contacts = formData.contacts || [];

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        type: initialData.type || 'CLIENT',
        address: initialData.address || '',
        taxNumber: initialData.taxNumber || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        contacts: initialData.contacts && Array.isArray(initialData.contacts) && initialData.contacts.length > 0
          ? initialData.contacts
          : [],
        notes: initialData.notes || '',
        isActive: initialData.isActive ?? true,
      });
    } else {
      setFormData({
        name: '',
        type: 'CLIENT',
        address: '',
        taxNumber: '',
        phone: '',
        email: '',
        contacts: [],
        notes: '',
        isActive: true,
      });
    }
    setError('');
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/companies/${initialData.id}` : '/api/companies';
      const method = isEditing ? 'PUT' : 'POST';

      // Filter out empty contacts (no name)
      const filteredContacts = contacts.filter(c => c.name.trim() !== '');

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          contacts: filteredContacts.length > 0 ? filteredContacts : null,
        }),
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

  const handleAddContact = () => {
    setFormData(prev => ({
      ...prev,
      contacts: [...(prev.contacts || []), { ...emptyContact }],
    }));
  };

  const handleRemoveContact = (index: number) => {
    setFormData(prev => ({
      ...prev,
      contacts: (prev.contacts || []).filter((_, i) => i !== index),
    }));
  };

  const handleContactChange = (index: number, field: keyof Contact, value: string) => {
    setFormData(prev => {
      const updated = [...(prev.contacts || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, contacts: updated };
    });
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

        {/* Contacts Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-primary-700">İletişim Kişileri</label>
            <button
              type="button"
              onClick={handleAddContact}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Kişi Ekle
            </button>
          </div>

          {contacts.length === 0 ? (
            <p className="text-xs text-primary-400 italic">Henüz kişi eklenmedi.</p>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="border border-primary-200 rounded-lg p-3 bg-primary-50/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-primary-500">
                      Kişi {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(index)}
                      className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-600 cursor-pointer"
                      title="Kişiyi Kaldır"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Ad Soyad *"
                      value={contact.name}
                      onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                      placeholder="Ad soyad"
                    />
                    <Input
                      label="Ünvan"
                      value={contact.title || ''}
                      onChange={(e) => handleContactChange(index, 'title', e.target.value)}
                      placeholder="Ünvan / Pozisyon"
                    />
                    <Input
                      label="E-posta"
                      type="email"
                      value={contact.email || ''}
                      onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                      placeholder="E-posta adresi"
                    />
                    <Input
                      label="Telefon"
                      value={contact.phone || ''}
                      onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                      placeholder="Telefon numarası"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
