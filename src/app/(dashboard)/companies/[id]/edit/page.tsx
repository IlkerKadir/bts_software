'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, Spinner } from '@/components/ui';

interface Contact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

interface CompanyData {
  id: string;
  name: string;
  type: 'CLIENT' | 'PARTNER';
  address: string | null;
  taxNumber: string | null;
  phone: string | null;
  email: string | null;
  contacts: Contact[] | null;
  notes: string | null;
  isActive: boolean;
}

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<CompanyData>({
    id: '',
    name: '',
    type: 'CLIENT',
    address: null,
    taxNumber: null,
    phone: null,
    email: null,
    contacts: [],
    notes: null,
    isActive: true,
  });

  const contacts = formData.contacts || [];

  // Fetch company data
  const fetchCompany = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (!res.ok) throw new Error('Firma bilgisi yüklenemedi');
      const data = await res.json();
      const c = data.company;
      setFormData({
        id: c.id,
        name: c.name,
        type: c.type,
        address: c.address || null,
        taxNumber: c.taxNumber || null,
        phone: c.phone || null,
        email: c.email || null,
        contacts: c.contacts && Array.isArray(c.contacts) ? c.contacts : [],
        notes: c.notes || null,
        isActive: c.isActive ?? true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  // Success auto-dismiss
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Form handlers
  const handleChange = (field: keyof CompanyData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddContact = () => {
    setFormData(prev => ({
      ...prev,
      contacts: [...(prev.contacts || []), { name: '', title: '', email: '', phone: '' }],
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

  // Save
  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const filteredContacts = contacts.filter(c => c.name.trim() !== '');
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          address: formData.address || null,
          taxNumber: formData.taxNumber || null,
          phone: formData.phone || null,
          email: formData.email || null,
          contacts: filteredContacts.length > 0 ? filteredContacts : null,
          notes: formData.notes || null,
          isActive: formData.isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Kaydetme başarısız');
        return;
      }
      setSuccessMessage('Firma başarıyla güncellendi');
    } catch {
      setError('Kaydetme sırasında bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-primary-500">Firma bilgisi yükleniyor...</p>
      </div>
    );
  }

  // Error on load
  if (error && !formData.id) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 max-w-md text-center">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            type="button"
            onClick={fetchCompany}
            className="mt-3 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Firma Düzenle</h1>
          <p className="text-sm text-primary-500 mt-1">{formData.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            <Save className="w-4 h-4" />
            Kaydet
          </Button>
        </div>
      </div>

      {/* Success */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3">
          <p className="text-sm text-green-700 font-medium">{successMessage}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border border-primary-200 shadow-sm p-6 space-y-6">
        {/* Basic Info */}
        <div>
          <h2 className="text-base font-semibold text-primary-900 mb-4">Temel Bilgiler</h2>
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
            <Input
              label="E-posta"
              type="email"
              value={formData.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="E-posta adresi"
            />
            <div className="flex items-center gap-2 self-end pb-2">
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
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-primary-700">Adres</label>
            <textarea
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Firma adresi"
              rows={2}
              className="mt-1.5 w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Contacts */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-primary-900">
              İletişim Kişileri
              {contacts.length > 0 && (
                <span className="ml-2 text-sm font-normal text-primary-400">({contacts.length})</span>
              )}
            </h2>
            <Button variant="secondary" onClick={handleAddContact}>
              <Plus className="w-4 h-4" />
              Kişi Ekle
            </Button>
          </div>

          {contacts.length === 0 ? (
            <p className="text-sm text-primary-400 italic py-4 text-center">Henüz kişi eklenmedi.</p>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="border border-primary-200 rounded-lg p-4 bg-primary-50/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-primary-500 uppercase tracking-wider">
                      Kişi {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(index)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 cursor-pointer transition-colors"
                      title="Kişiyi Kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
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

        {/* Notes */}
        <div>
          <h2 className="text-base font-semibold text-primary-900 mb-4">Notlar</h2>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Firma hakkında notlar"
            rows={3}
            className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
