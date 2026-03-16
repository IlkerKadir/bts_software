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
  nameEn?: string | null;
  nameTr?: string | null;
  unit: string;
  listPrice: number;
  costPrice?: number | null;
  currency: string;
  supplier?: string | null;
  minKatsayi?: number | null;
  maxKatsayi?: number | null;
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

  const buildFormData = (data?: ProductFormData | null): ProductFormData => ({
    code: data?.code || '',
    shortCode: data?.shortCode || '',
    brandId: data?.brandId || '',
    categoryId: data?.categoryId || '',
    model: data?.model || '',
    name: data?.name || '',
    nameEn: data?.nameEn || '',
    nameTr: data?.nameTr || '',
    unit: data?.unit || 'Adet',
    listPrice: data?.listPrice || 0,
    costPrice: data?.costPrice || undefined,
    currency: data?.currency || 'EUR',
    supplier: data?.supplier || '',
    minKatsayi: data?.minKatsayi ?? undefined,
    maxKatsayi: data?.maxKatsayi ?? undefined,
    isActive: data?.isActive ?? true,
  });

  const [formData, setFormData] = useState<ProductFormData>(buildFormData(initialData));

  // Reset form when initialData changes (e.g. opening edit for a different product)
  useEffect(() => {
    setFormData(buildFormData(initialData));
    setError('');
  }, [initialData]);

  const [lookupWarning, setLookupWarning] = useState('');

  useEffect(() => {
    const fetchLookups = async () => {
      setLookupWarning('');
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          fetch('/api/products/brands'),
          fetch('/api/products/categories'),
        ]);

        if (!brandsRes.ok || !categoriesRes.ok) {
          setLookupWarning('Marka veya kategori listesi yuklenemedi. Form yine de kullanilabilir.');
        }

        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          setBrands(brandsData.brands || []);
        }

        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          setCategories(categoriesData.categories || []);
        }
      } catch (err) {
        console.error('Error fetching lookups:', err);
        setLookupWarning('Marka ve kategori listesi yuklenemedi. Form yine de kullanilabilir.');
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
        minKatsayi: formData.minKatsayi ?? null,
        maxKatsayi: formData.maxKatsayi ?? null,
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

  const handleChange = (field: keyof ProductFormData, value: string | number | boolean | undefined | null) => {
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

        {lookupWarning && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            {lookupWarning}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Ürün Adı *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ürün adı"
            required
          />

          <Input
            label="Ürün Adı (EN)"
            value={formData.nameEn || ''}
            onChange={(e) => handleChange('nameEn', e.target.value)}
            placeholder="Product Name (EN)"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Min Katsayı"
            type="number"
            step="0.001"
            min="0"
            value={formData.minKatsayi ?? ''}
            onChange={(e) => handleChange('minKatsayi', e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="Ör: 0.850"
          />

          <Input
            label="Max Katsayı"
            type="number"
            step="0.001"
            min="0"
            value={formData.maxKatsayi ?? ''}
            onChange={(e) => handleChange('maxKatsayi', e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="Ör: 1.150"
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
              Aktif ürün
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
