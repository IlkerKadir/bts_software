'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Building2, Users, Pencil, Trash2, Download, Upload } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { CompanyForm } from './CompanyForm';
import type { Pagination } from '@/lib/types/pagination';

interface Company {
  id: string;
  name: string;
  type: 'CLIENT' | 'PARTNER';
  address?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
}

export function CompanyList() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCompanies = useCallback(async (page = 1) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/companies?${params}`);
      const data = await response.json();

      if (response.ok) {
        setCompanies(data.companies);
        setPagination(data.pagination);
      } else {
        setFetchError(data.error || 'Firmalar yüklenirken bir hata oluştu');
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      setFetchError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setIsLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCompanies();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchCompanies]);

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;

    try {
      const response = await fetch(`/api/companies/${deletingCompany.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setDeleteError(data.error || 'Silme işlemi başarısız');
        return;
      }

      setDeletingCompany(null);
      fetchCompanies();
    } catch {
      setDeleteError('Bir hata oluştu');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingCompany(null);
  };

  const handleFormSuccess = () => {
    fetchCompanies();
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/companies/export');
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Dışarı aktarma başarısız oldu');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="(.+)"/);
      a.download = match?.[1] || 'BTS_Firmalar.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Dışarı aktarma sırasında bir hata oluştu');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/companies/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setImportMessage({ type: 'error', text: data.error || 'İçeri aktarma başarısız oldu' });
        return;
      }

      setImportMessage({
        type: 'success',
        text: `${data.total} firma başarıyla içeri aktarıldı (${data.created} yeni, ${data.updated} güncellendi)`,
      });
      fetchCompanies();
    } catch (error) {
      console.error('Import error:', error);
      setImportMessage({ type: 'error', text: 'İçeri aktarma sırasında bir hata oluştu' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setImportMessage({ type: 'error', text: 'Yalnızca .xlsx dosyaları kabul edilmektedir.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    handleImportFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Firmalar</h1>
          <p className="text-primary-500">Müşteri ve iş ortaklarını yönetin</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Aktarılıyor...' : "Excel\u0027e Aktar"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Yükleniyor...' : "Excel\u0027den Yükle"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Firma
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Firma ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Tipler' },
              { value: 'CLIENT', label: 'Müşteri' },
              { value: 'PARTNER', label: 'İş Ortağı' },
            ]}
            className="w-full sm:w-48"
          />
        </div>
      </Card>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 font-medium">{fetchError}</p>
          <button
            onClick={() => fetchCompanies()}
            className="text-sm text-red-600 underline ml-4"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Import Message Banner */}
      {importMessage && (
        <div
          className={`rounded-lg px-4 py-3 flex items-center justify-between ${
            importMessage.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`text-sm font-medium ${
              importMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {importMessage.text}
          </p>
          <button
            onClick={() => setImportMessage(null)}
            className={`text-sm underline ml-4 ${
              importMessage.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            Kapat
          </button>
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Firma Adı</th>
                <th>Tip</th>
                <th>Vergi No</th>
                <th>Telefon</th>
                <th>E-posta</th>
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
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-primary-500">
                    Firma bulunamadı
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id}>
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        {company.type === 'CLIENT' ? (
                          <Building2 className="w-4 h-4 text-primary-400" />
                        ) : (
                          <Users className="w-4 h-4 text-primary-400" />
                        )}
                        {company.name}
                      </div>
                    </td>
                    <td>
                      <Badge variant={company.type === 'CLIENT' ? 'info' : 'default'}>
                        {company.type === 'CLIENT' ? 'Müşteri' : 'İş Ortağı'}
                      </Badge>
                    </td>
                    <td>{company.taxNumber || '-'}</td>
                    <td>{company.phone || '-'}</td>
                    <td>{company.email || '-'}</td>
                    <td>
                      <Badge variant={company.isActive ? 'success' : 'default'}>
                        {company.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(company)}
                          className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                          title="Düzenle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCompany(company)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
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
              Toplam {pagination.total} firma
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchCompanies(pagination.page - 1)}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchCompanies(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <CompanyForm
        isOpen={isFormOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        initialData={editingCompany}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingCompany}
        onClose={() => {
          setDeletingCompany(null);
          setDeleteError('');
        }}
        title="Firmayı Sil"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeletingCompany(null);
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
            <strong>{deletingCompany?.name}</strong> firmasını silmek istediğinize emin misiniz?
            Bu işlem geri alınamaz.
          </p>
        )}
      </Modal>
    </div>
  );
}
