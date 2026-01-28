'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Shield, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import { Button, Card, Badge, Modal } from '@/components/ui';
import { RoleForm } from './RoleForm';

interface Role {
  id: string;
  name: string;
  canViewCosts: boolean;
  canApprove: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canEditProducts: boolean;
  canDelete: boolean;
  userCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const fetchRoles = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', page.toString());

      const response = await fetch(`/api/roles?${params}`);
      const data = await response.json();

      if (response.ok) {
        setRoles(data.roles);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchRoles();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchRoles]);

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingRole) return;

    try {
      const response = await fetch(`/api/roles/${deletingRole.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setDeleteError(data.error || 'Silme işlemi başarısız');
        return;
      }

      setDeletingRole(null);
      fetchRoles();
    } catch {
      setDeleteError('Bir hata oluştu');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingRole(null);
  };

  const handleFormSuccess = () => {
    fetchRoles();
  };

  const PermissionBadge = ({ enabled, label }: { enabled: boolean; label: string }) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
        enabled
          ? 'bg-green-50 text-green-700'
          : 'bg-primary-100 text-primary-500'
      }`}
    >
      {enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Roller</h1>
          <p className="text-primary-500">Kullanıcı rollerini ve izinlerini yönetin</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4" />
          Yeni Rol
        </Button>
      </div>

      {/* Search */}
      <Card>
        <div className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Rol ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>
      </Card>

      {/* Roles Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-primary-500">Yükleniyor...</div>
      ) : roles.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-primary-500">
            Rol bulunamadı
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-50 rounded-lg">
                      <Shield className="w-5 h-5 text-accent-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary-900">{role.name}</h3>
                      <div className="flex items-center gap-1 text-sm text-primary-500">
                        <Users className="w-3 h-3" />
                        {role.userCount} kullanıcı
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(role)}
                      className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                      title="Düzenle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingRole(role)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                      title="Sil"
                      disabled={role.userCount > 0}
                    >
                      <Trash2 className={`w-4 h-4 ${role.userCount > 0 ? 'opacity-30' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <PermissionBadge enabled={role.canViewCosts} label="Maliyet Görme" />
                  <PermissionBadge enabled={role.canApprove} label="Onaylama" />
                  <PermissionBadge enabled={role.canExport} label="Dışa Aktarma" />
                  <PermissionBadge enabled={role.canManageUsers} label="Kullanıcı Yönetimi" />
                  <PermissionBadge enabled={role.canEditProducts} label="Ürün Düzenleme" />
                  <PermissionBadge enabled={role.canDelete} label="Silme" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-primary-500">
            Toplam {pagination.total} rol
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => fetchRoles(pagination.page - 1)}
            >
              Önceki
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => fetchRoles(pagination.page + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      )}

      {/* Form Modal */}
      <RoleForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        initialData={editingRole}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingRole}
        onClose={() => {
          setDeletingRole(null);
          setDeleteError('');
        }}
        title="Rolü Sil"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeletingRole(null);
                setDeleteError('');
              }}
            >
              İptal
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Sil
            </Button>
          </>
        }
      >
        {deleteError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {deleteError}
          </div>
        ) : (
          <p className="text-primary-700">
            <strong>{deletingRole?.name}</strong> rolünü silmek istediğinize emin misiniz?
            Bu işlem geri alınamaz.
          </p>
        )}
      </Modal>
    </div>
  );
}
