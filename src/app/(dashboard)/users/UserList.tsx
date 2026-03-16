'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, User, Shield, Pencil, UserX, UserCheck } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { UserForm } from './UserForm';
import type { Pagination } from '@/lib/types/pagination';

interface Role {
  id: string;
  name: string;
  canViewCosts: boolean;
  canApprove: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canEditProducts: boolean;
  canDelete: boolean;
}

interface UserItem {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  roleId: string;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export function UserList() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [togglingUser, setTogglingUser] = useState<UserItem | null>(null);
  const [toggleError, setToggleError] = useState('');

  const fetchUsers = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('roleId', roleFilter);
      if (statusFilter) params.set('isActive', statusFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/users?${params}`);
      const data = await response.json();

      if (response.ok) {
        setUsers(data.users);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch('/api/roles?limit=100');
      const data = await response.json();
      if (response.ok) {
        setRoles(data.roles);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchUsers]);

  const handleEdit = (user: UserItem) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleToggleActive = async () => {
    if (!togglingUser) return;

    try {
      const response = await fetch(`/api/users/${togglingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !togglingUser.isActive }),
      });

      const data = await response.json();

      if (!response.ok) {
        setToggleError(data.error || 'İşlem başarısız');
        return;
      }

      setTogglingUser(null);
      fetchUsers();
    } catch {
      setToggleError('Bir hata oluştu');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingUser(null);
  };

  const handleFormSuccess = () => {
    fetchUsers();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Kullanıcılar</h1>
          <p className="text-primary-500">Sistem kullanıcılarını yönetin</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4" />
          Yeni Kullanıcı
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Roller' },
              ...roles.map(role => ({ value: role.id, label: role.name })),
            ]}
            className="w-full sm:w-48"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Durumlar' },
              { value: 'true', label: 'Aktif' },
              { value: 'false', label: 'Pasif' },
            ]}
            className="w-full sm:w-36"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Kullanıcı Adı</th>
                <th>E-posta</th>
                <th>Rol</th>
                <th>Son Giriş</th>
                <th>Durum</th>
                <th className="w-24">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-primary-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-primary-500">
                    Kullanıcı bulunamadı
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary-400" />
                        {user.fullName}
                      </div>
                    </td>
                    <td className="text-sm font-mono text-primary-600">
                      {user.username}
                    </td>
                    <td>{user.email || '-'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-primary-400" />
                        <span className="text-sm">{user.role.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-primary-500">
                      {formatDate(user.lastLogin)}
                    </td>
                    <td>
                      <Badge variant={user.isActive ? 'success' : 'default'}>
                        {user.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTogglingUser(user)}
                          className={`p-1.5 rounded cursor-pointer ${
                            user.isActive
                              ? 'hover:bg-red-50 text-red-600'
                              : 'hover:bg-green-50 text-green-600'
                          }`}
                          title={user.isActive ? 'Devre Dışı Bırak' : 'Aktifleştir'}
                        >
                          {user.isActive ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-primary-200 flex items-center justify-between">
            <p className="text-sm text-primary-500">
              Toplam {pagination.total} kullanıcı
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchUsers(pagination.page - 1)}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchUsers(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <UserForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        initialData={editingUser}
        roles={roles}
      />

      {/* Toggle Active Confirmation Modal */}
      <Modal
        isOpen={!!togglingUser}
        onClose={() => {
          setTogglingUser(null);
          setToggleError('');
        }}
        title={togglingUser?.isActive ? 'Kullanıcıyı Devre Dışı Bırak' : 'Kullanıcıyı Aktifleştir'}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTogglingUser(null);
                setToggleError('');
              }}
            >
              İptal
            </Button>
            <Button
              variant={togglingUser?.isActive ? 'danger' : 'primary'}
              onClick={handleToggleActive}
            >
              {togglingUser?.isActive ? 'Devre Dışı Bırak' : 'Aktifleştir'}
            </Button>
          </>
        }
      >
        {toggleError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {toggleError}
          </div>
        ) : (
          <p className="text-primary-700">
            <strong>{togglingUser?.fullName}</strong> kullanıcısını{' '}
            {togglingUser?.isActive ? 'devre dışı bırakmak' : 'aktifleştirmek'}{' '}
            istediğinize emin misiniz?
          </p>
        )}
      </Modal>
    </div>
  );
}
