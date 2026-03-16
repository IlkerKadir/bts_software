'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';

interface Role {
  id: string;
  name: string;
}

interface UserFormData {
  id?: string;
  username: string;
  fullName: string;
  email: string | null;
  roleId: string;
  password?: string;
  isActive?: boolean;
}

interface UserFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: UserFormData | null;
  roles: Role[];
}

export function UserForm({ isOpen, onClose, onSuccess, initialData, roles }: UserFormProps) {
  const isEditing = !!initialData?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    fullName: '',
    email: '',
    roleId: '',
    password: '',
    isActive: true,
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        username: initialData?.username || '',
        fullName: initialData?.fullName || '',
        email: initialData?.email || '',
        roleId: initialData?.roleId || (roles.length > 0 ? roles[0].id : ''),
        password: '',
        isActive: initialData?.isActive ?? true,
      });
      setError('');
    }
  }, [isOpen, initialData, roles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const url = isEditing ? `/api/users/${initialData?.id}` : '/api/users';
      const method = isEditing ? 'PUT' : 'POST';

      // For editing, only include password if it's set
      const payload: Partial<UserFormData> = {
        username: formData.username,
        fullName: formData.fullName,
        email: formData.email || null,
        roleId: formData.roleId,
        isActive: formData.isActive,
      };

      if (!isEditing || formData.password) {
        payload.password = formData.password;
      }

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

  const handleChange = (field: keyof UserFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
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
            label="Ad Soyad *"
            value={formData.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            placeholder="Ad ve soyadı giriniz"
            required
          />

          <Input
            label="Kullanıcı Adı *"
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            placeholder="Kullanıcı adı"
            required
            disabled={isEditing}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="E-posta"
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="E-posta adresi"
          />

          <Select
            label="Rol *"
            value={formData.roleId}
            onChange={(e) => handleChange('roleId', e.target.value)}
            options={roles.map(role => ({ value: role.id, label: role.name }))}
          />
        </div>

        <Input
          label={isEditing ? 'Yeni Şifre (Değiştirmek için doldurun)' : 'Şifre *'}
          type="password"
          value={formData.password || ''}
          onChange={(e) => handleChange('password', e.target.value)}
          placeholder={isEditing ? 'Şifreyi değiştirmek için girin' : 'Şifre giriniz'}
          required={!isEditing}
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
              Aktif kullanıcı
            </label>
          </div>
        )}

        <div className="p-3 bg-primary-50 rounded-lg text-sm text-primary-600">
          <p className="font-medium mb-1">Şifre Gereksinimleri:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>En az 8 karakter</li>
            <li>En az bir büyük harf (A-Z)</li>
            <li>En az bir küçük harf (a-z)</li>
            <li>En az bir rakam (0-9)</li>
          </ul>
        </div>
      </form>
    </Modal>
  );
}
