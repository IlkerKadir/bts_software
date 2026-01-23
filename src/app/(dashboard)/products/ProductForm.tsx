'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';

interface Brand {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductFormData {
  id?: string;
  code: string;
  shortCode?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  model?: string | null;
  name: string;
  nameTr?: string | null;
  unit: string;
  listPrice: number;
  costPrice?: number | null;
  currency: string;
  supplier?: string | null;
  isActive?: boolean;
}

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: ProductFormData | null;
  canViewCosts?: boolean;
}

export function ProductForm({ isOpen, onClose, onSuccess, initialData, canViewCosts = false }: ProductFormProps) {
  const isEditing = !!initialData?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [formData, setFormData] = useState<ProductFormData>({
    code: initialData?.code || '',
    shortCode: initialData?.shortCode || '',
    brandId: initialData?.brandId || '',
    categoryId: initialData?.categoryId || '',
    model: initialData?.model || '',
    name: initialData?.name || '',
    nameTr: initialData?.nameTr || '',
    unit: initialData?.unit || 'Adet',
    listPrice: initialData?.listPrice || 0,
    costPrice: initialData?.costPrice || undefined,
    currency: initialData?.currency || 'EUR',
    supplier: initialData?.supplier || '',
    isActive: initialData?.isActive ?? true,
  });

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          fetch('/api/products/brands'),
          fetch('/api/products/categories'),
        ]);
        const brandsData = await brandsRes.json();
        const categoriesData = await categoriesRes.json();
        setBrands(brandsData.brands || []);
        setCategories(categoriesData.categories || []);
      } catch (err) {
        console.error('Error fetching lookups:', err);
      }
    };

    if (isOpen) {
      fetchLookups();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/products/${initialData.id}` : '/api/products';
      const method = isEditing ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        brandId: formData.brandId || null,
        categoryId: formData.categoryId || null,
        costPrice: formData.costPrice || null,
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

  const handleChange = (field: keyof ProductFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Ürün Düzenle' : 'Yeni Ürün'}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Ürün Kodu *"
            value={formData.code}
            onChange={(e) => handleChange('code', e.target.value)}
            placeholder="Ürün kodu"
            required
          />

          <Input
            label="Kısa Kod"
            value={formData.shortCode || ''}
            onChange={(e) => handleChange('shortCode', e.target.value)}
            placeholder="Kısa kod"
          />

          <Input
            label="Model"
            value={formData.model || ''}
            onChange={(e) => handleChange('model', e.target.value)}
            placeholder="Model"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Ürün Adı *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ürün adı"
            required
          />

          <Input
            label="Türkçe Adı"
            value={formData.nameTr || ''}
            onChange={(e) => handleChange('nameTr', e.target.value)}
            placeholder="Türkçe ürün adı"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Marka"
            value={formData.brandId || ''}
            onChange={(e) => handleChange('brandId', e.target.value)}
            options={[
              { value: '', label: 'Marka Seçin' },
              ...brands.map(b => ({ value: b.id, label: b.name })),
            ]}
          />

          <Select
            label="Kategori"
            value={formData.categoryId || ''}
            onChange={(e) => handleChange('categoryId', e.target.value)}
            options={[
              { value: '', label: 'Kategori Seçin' },
              ...categories.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Liste Fiyatı *"
            type="number"
            step="0.01"
            min="0"
            value={formData.listPrice}
            onChange={(e) => handleChange('listPrice', parseFloat(e.target.value) || 0)}
            required
          />

          {canViewCosts && (
            <Input
              label="Maliyet Fiyatı"
              type="number"
              step="0.01"
              min="0"
              value={formData.costPrice || ''}
              onChange={(e) => handleChange('costPrice', parseFloat(e.target.value) || undefined)}
            />
          )}

          <Select
            label="Para Birimi *"
            value={formData.currency}
            onChange={(e) => handleChange('currency', e.target.value)}
            options={[
              { value: 'EUR', label: 'EUR' },
              { value: 'USD', label: 'USD' },
              { value: 'GBP', label: 'GBP' },
              { value: 'TRY', label: 'TRY' },
            ]}
          />

          <Input
            label="Birim"
            value={formData.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
            placeholder="Adet"
          />
        </div>

        <Input
          label="Tedarikçi"
          value={formData.supplier || ''}
          onChange={(e) => handleChange('supplier', e.target.value)}
          placeholder="Tedarikçi firma"
        />

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
              Aktif ürün
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
