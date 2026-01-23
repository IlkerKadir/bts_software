'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { ProjectForm } from './ProjectForm';

interface Company {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  client: { id: string; name: string };
  status: string;
  estimatedStart?: string | null;
  estimatedEnd?: string | null;
  notes?: string | null;
  _count?: { quotes: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ProjectListProps {
  canDelete: boolean;
}

const statusOptions = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'TEKLIF_ASAMASINDA', label: 'Teklif Aşamasında' },
  { value: 'ONAYLANDI', label: 'Onaylandı' },
  { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
  { value: 'TAMAMLANDI', label: 'Tamamlandı' },
  { value: 'IPTAL', label: 'İptal' },
];

const statusLabels: Record<string, string> = {
  TEKLIF_ASAMASINDA: 'Teklif Aşamasında',
  ONAYLANDI: 'Onaylandı',
  DEVAM_EDIYOR: 'Devam Ediyor',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TEKLIF_ASAMASINDA: 'default',
  ONAYLANDI: 'info',
  DEVAM_EDIYOR: 'warning',
  TAMAMLANDI: 'success',
  IPTAL: 'error',
};

export function ProjectList({ canDelete }: ProjectListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const fetchProjects = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (clientFilter) params.set('clientId', clientFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/projects?${params}`);
      const data = await response.json();

      if (response.ok) {
        setProjects(data.projects);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, clientFilter]);

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

    fetchCompanies();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchProjects();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchProjects]);

  const handleEdit = (project: Project) => {
    setEditingProject({
      ...project,
      clientId: project.client.id,
    } as Project & { clientId: string });
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

    try {
      const response = await fetch(`/api/projects/${deletingProject.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setDeleteError(data.error || 'Silme işlemi başarısız');
        return;
      }

      setDeletingProject(null);
      fetchProjects();
    } catch {
      setDeleteError('Bir hata oluştu');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingProject(null);
  };

  const handleFormSuccess = () => {
    fetchProjects();
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Projeler</h1>
          <p className="text-primary-500">Proje takibini yönetin</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4" />
          Yeni Proje
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Proje veya firma ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <Select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Firmalar' },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
            className="w-full sm:w-48"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
            className="w-full sm:w-48"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Proje Adı</th>
                <th>Firma</th>
                <th>Durum</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Teklifler</th>
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
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-primary-500">
                    Proje bulunamadı
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id}>
                    <td className="font-medium">{project.name}</td>
                    <td>{project.client.name}</td>
                    <td>
                      <Badge variant={statusVariants[project.status] || 'default'}>
                        {statusLabels[project.status] || project.status}
                      </Badge>
                    </td>
                    <td>{formatDate(project.estimatedStart)}</td>
                    <td>{formatDate(project.estimatedEnd)}</td>
                    <td className="tabular-nums">{project._count?.quotes || 0}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(project)}
                          className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeletingProject(project)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
              Toplam {pagination.total} proje
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchProjects(pagination.page - 1)}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchProjects(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <ProjectForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        initialData={editingProject as (Project & { clientId: string }) | null}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingProject}
        onClose={() => {
          setDeletingProject(null);
          setDeleteError('');
        }}
        title="Projeyi Sil"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeletingProject(null);
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
            <strong>{deletingProject?.name}</strong> projesini silmek istediğinize emin misiniz?
            Bu işlem geri alınamaz.
          </p>
        )}
      </Modal>
    </div>
  );
}
