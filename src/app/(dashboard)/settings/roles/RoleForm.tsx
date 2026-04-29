'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal } from '@/components/ui';

interface RoleFormData {
  id?: string;
  name: string;
  canViewCosts: boolean;
  canApprove: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canEditProducts: boolean;
  canDelete: boolean;
  canDeleteProducts: boolean;
}

interface RoleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: RoleFormData | null;
}

const PERMISSIONS = [
  { key: 'canViewCosts', label: 'Maliyet Görme', description: 'Ürün maliyet bilgilerini görüntüleyebilir' },
  { key: 'canApprove', label: 'Teklif Onaylama', description: 'Onay gerektiren teklifleri onaylayabilir' },
  { key: 'canExport', label: 'Dışa Aktarma', description: 'PDF ve Excel olarak dışa aktarabilir' },
  { key: 'canManageUsers', label: 'Kullanıcı Yönetimi', description: 'Kullanıcı ve rol yönetimi yapabilir' },
  { key: 'canManageSettings', label: 'Ayar Yönetimi', description: 'Ticari şart şablonları, fiyat etiketleri ve diğer ayarları düzenleyebilir' },
  { key: 'canEditProducts', label: 'Ürün Düzenleme', description: 'Ürün bilgilerini düzenleyebilir' },
  { key: 'canDelete', label: 'Kayıt Silme', description: 'Taslak teklif, sipariş, proje ve firma kayıtlarını silebilir (ürünler hariç)' },
  { key: 'canDeleteProducts', label: 'Ürün Silme', description: 'Veritabanından ürün kaydı silebilir — yalnızca kataloğu yönetenlerde olmalı' },
] as const;

export function RoleForm({ isOpen, onClose, onSuccess, initialData }: RoleFormProps) {
  const isEditing = !!initialData?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    canViewCosts: false,
    canApprove: false,
    canExport: true,
    canManageUsers: false,
    canManageSettings: false,
    canEditProducts: false,
    canDelete: false,
    canDeleteProducts: false,
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: initialData?.name || '',
        canViewCosts: initialData?.canViewCosts ?? false,
        canApprove: initialData?.canApprove ?? false,
        canExport: initialData?.canExport ?? true,
        canManageUsers: initialData?.canManageUsers ?? false,
        canManageSettings: initialData?.canManageSettings ?? false,
        canEditProducts: initialData?.canEditProducts ?? false,
        canDelete: initialData?.canDelete ?? false,
        canDeleteProducts: initialData?.canDeleteProducts ?? false,
      });
      setError('');
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/roles/${initialData?.id}` : '/api/roles';
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

  const handlePermissionChange = (key: keyof RoleFormData, value: boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Rol Düzenle' : 'Yeni Rol'}
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
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          label="Rol Adı *"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Rol adını giriniz"
          required
        />

        <div>
          <label className="block text-sm font-medium text-primary-700 mb-3">
            İzinler
          </label>
          <div className="space-y-3">
            {PERMISSIONS.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-start gap-3 p-3 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors"
              >
                <input
                  type="checkbox"
                  id={key}
                  checked={formData[key] as boolean}
                  onChange={(e) => handlePermissionChange(key, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-primary-300 text-accent-600 focus:ring-accent-500"
                />
                <label htmlFor={key} className="flex-1 cursor-pointer">
                  <span className="block text-sm font-medium text-primary-900">
                    {label}
                  </span>
                  <span className="block text-xs text-primary-500">
                    {description}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
