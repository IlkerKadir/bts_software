'use client';

import { use } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Building2,
  FileText,
  Folder,
  AlertCircle,
  Calendar,
  MessageSquare,
  Upload,
  File,
  Image,
  Trash2,
  Download,
  Send,
  X,
  BarChart3,
  CheckCircle,
  XCircle,
  Hourglass,
} from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Badge, Spinner, Modal, Input, Select } from '@/components/ui';
import { AddReminderButton } from '@/components/reminders/AddReminderButton';
import { formatCurrency, formatDate, formatFileSize, formatDateTime } from '@/lib/utils/format';
import { quoteStatusLabels } from '@/lib/validations/quote';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface ProjectQuote {
  id: string;
  quoteNumber: string;
  status: string;
  grandTotal: number | null;
  currency: string;
  createdAt: string;
}

interface ProjectDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

interface ProjectActivity {
  id: string;
  userId: string;
  userName: string;
  action: string;
  note: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  client?: { id: string; name: string } | null;
  status: string;
  estimatedStart?: string | null;
  estimatedEnd?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  quotes: ProjectQuote[];
  _count: {
    quotes: number;
    documents: number;
    activities: number;
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Status Labels & Variants
// ---------------------------------------------------------------------------

const projectStatusLabels: Record<string, string> = {
  TEKLIF_ASAMASINDA: 'Teklif Asamasinda',
  ONAYLANDI: 'Onaylandi',
  DEVAM_EDIYOR: 'Devam Ediyor',
  TAMAMLANDI: 'Tamamlandi',
  IPTAL: 'Iptal',
};

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TEKLIF_ASAMASINDA: 'default',
  ONAYLANDI: 'info',
  DEVAM_EDIYOR: 'warning',
  TAMAMLANDI: 'success',
  IPTAL: 'error',
};

const statusOptions = [
  { value: 'TEKLIF_ASAMASINDA', label: 'Teklif Asamasinda' },
  { value: 'ONAYLANDI', label: 'Onaylandi' },
  { value: 'DEVAM_EDIYOR', label: 'Devam Ediyor' },
  { value: 'TAMAMLANDI', label: 'Tamamlandi' },
  { value: 'IPTAL', label: 'Iptal' },
];

const actionLabels: Record<string, string> = {
  NOT: 'Not',
  DURUM_DEGISIKLIGI: 'Durum Degisikligi',
  DOKUMAN_YUKLEME: 'Dokuman Yukleme',
  TEKLIF_EKLEME: 'Teklif Ekleme',
  GUNCELLEME: 'Guncelleme',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return Image;
  if (fileType.includes('pdf')) return FileText;
  return File;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Core state
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activities state
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    estimatedStart: '',
    estimatedEnd: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Proje yuklenemedi');
      }

      setProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  }, [id]);

  const fetchActivities = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/activities`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchDocuments();
    fetchActivities();
  }, [fetchProject, fetchDocuments, fetchActivities]);

  // ---------------------------------------------------------------------------
  // Edit Handlers
  // ---------------------------------------------------------------------------

  const openEditModal = () => {
    if (!project) return;
    setEditForm({
      name: project.name,
      status: project.status,
      estimatedStart: project.estimatedStart
        ? new Date(project.estimatedStart).toISOString().split('T')[0]
        : '',
      estimatedEnd: project.estimatedEnd
        ? new Date(project.estimatedEnd).toISOString().split('T')[0]
        : '',
      notes: project.notes || '',
    });
    setEditError('');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setIsSaving(true);
    setEditError('');

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          clientId: project.client?.id || null,
          status: editForm.status,
          estimatedStart: editForm.estimatedStart || null,
          estimatedEnd: editForm.estimatedEnd || null,
          notes: editForm.notes || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setEditError(data.error || 'Guncelleme basarisiz');
        return;
      }

      setIsEditOpen(false);
      fetchProject();
    } catch {
      setEditError('Bir hata olustu. Lutfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Document Handlers
  // ---------------------------------------------------------------------------

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploadingDoc(true);
    setDocError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/projects/${id}/documents`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Yukleme hatasi');
        }
      }

      fetchDocuments();
      fetchProject();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Yukleme hatasi');
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [id, fetchDocuments, fetchProject]);

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Bu dokumani silmek istediginize emin misiniz?')) return;

    try {
      const response = await fetch(`/api/projects/${id}/documents/${docId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Silme hatasi');
      }

      fetchDocuments();
      fetchProject();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Silme hatasi');
    }
  };

  const handleDownloadDoc = (docId: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = `/api/projects/${id}/documents/${docId}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  // ---------------------------------------------------------------------------
  // Activity Handlers
  // ---------------------------------------------------------------------------

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsSavingNote(true);
    try {
      const response = await fetch(`/api/projects/${id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'NOT',
          note: newNote.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Not eklenemedi');
      }

      setNewNote('');
      fetchActivities();
      fetchProject();
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const quoteStats = project
    ? {
        total: project.quotes.length,
        won: project.quotes.filter((q) => q.status === 'KAZANILDI').length,
        pending: project.quotes.filter(
          (q) =>
            q.status === 'TASLAK' ||
            q.status === 'ONAY_BEKLIYOR' ||
            q.status === 'GONDERILDI' ||
            q.status === 'TAKIPTE'
        ).length,
        lost: project.quotes.filter((q) => q.status === 'KAYBEDILDI' || q.status === 'IPTAL').length,
      }
    : { total: 0, won: 0, pending: 0, lost: 0 };

  const formatDateLong = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return formatDate(dateString, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (price == null) return '-';
    return formatCurrency(price, currency);
  };

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error}</p>
        <Button variant="secondary" onClick={() => router.push('/projects')}>
          <ArrowLeft className="w-4 h-4" />
          Projelere Don
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">Proje bulunamadi</p>
        <Button variant="secondary" onClick={() => router.push('/projects')}>
          <ArrowLeft className="w-4 h-4" />
          Projelere Don
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-primary-900">{project.name}</h1>
              <Badge variant={statusVariants[project.status] || 'default'}>
                {projectStatusLabels[project.status] || project.status}
              </Badge>
            </div>
            {project.client ? (
              <p className="text-sm text-primary-500 mt-0.5">
                <span
                  className="text-accent-600 hover:underline cursor-pointer"
                  onClick={() => router.push(`/companies/${project.client!.id}`)}
                >
                  {project.client.name}
                </span>
              </p>
            ) : (
              <p className="text-sm text-primary-400 mt-0.5">Firma atanmamis</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openEditModal}>
            <Edit className="w-4 h-4" />
            Duzenle
          </Button>
          <AddReminderButton projectId={id} />
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* INFO CARDS                                                          */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Project Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <Folder className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Proje Bilgileri</h3>
                <p className="text-xs text-primary-500">Genel bilgiler</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary-400 shrink-0" />
                <span className="text-primary-500">Firma:</span>
                {project.client ? (
                  <span
                    className="font-medium text-accent-600 hover:underline cursor-pointer"
                    onClick={() => router.push(`/companies/${project.client!.id}`)}
                  >
                    {project.client.name}
                  </span>
                ) : (
                  <span className="font-medium text-primary-400">Firma atanmamis</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-400 shrink-0" />
                <span className="text-primary-500">Tahmini Baslangic:</span>
                <span className="font-medium text-primary-800">
                  {formatDateLong(project.estimatedStart)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-400 shrink-0" />
                <span className="text-primary-500">Tahmini Bitis:</span>
                <span className="font-medium text-primary-800">
                  {formatDateLong(project.estimatedEnd)}
                </span>
              </div>

              {project.notes && (
                <div className="pt-2 border-t border-primary-100">
                  <p className="text-xs font-medium text-primary-500 mb-1">Notlar</p>
                  <p className="text-sm text-primary-700 whitespace-pre-wrap">{project.notes}</p>
                </div>
              )}

              <div className="pt-2 border-t border-primary-100 text-xs text-primary-400">
                <p>Olusturulma: {formatDateLong(project.createdAt)}</p>
                <p>Son Guncelleme: {formatDateLong(project.updatedAt)}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Stats Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Teklif Istatistikleri</h3>
                <p className="text-xs text-primary-500">Proje teklif ozeti</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-primary-50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <FileText className="w-4 h-4 text-primary-500" />
                </div>
                <p className="text-2xl font-bold text-primary-900">{quoteStats.total}</p>
                <p className="text-xs text-primary-500 mt-1">Toplam Teklif</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-700">{quoteStats.won}</p>
                <p className="text-xs text-green-600 mt-1">Kazanilan</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Hourglass className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-amber-700">{quoteStats.pending}</p>
                <p className="text-xs text-amber-600 mt-1">Bekleyen</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <XCircle className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-red-700">{quoteStats.lost}</p>
                <p className="text-xs text-red-600 mt-1">Kaybedilen</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* QUOTES TABLE                                                        */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Bagli Teklifler</h3>
              <p className="text-xs text-primary-500">
                {project.quotes.length} teklif
              </p>
            </div>
          </div>
        </CardHeader>
        {project.quotes.length === 0 ? (
          <CardBody>
            <p className="text-sm text-primary-400 text-center py-4">
              Bu projeye ait teklif bulunmuyor.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-accent-50 border-b border-accent-200 text-xs uppercase tracking-wider text-accent-600">
                  <th className="px-4 py-2.5 text-left">Teklif No</th>
                  <th className="px-4 py-2.5 text-left">Durum</th>
                  <th className="px-4 py-2.5 text-right">Genel Toplam</th>
                  <th className="px-4 py-2.5 text-left">Tarih</th>
                  <th className="px-4 py-2.5 text-right w-24">Islem</th>
                </tr>
              </thead>
              <tbody>
                {project.quotes.map((quote) => (
                  <tr
                    key={quote.id}
                    className="border-b border-accent-100 hover:bg-accent-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-primary-900">
                      {quote.quoteNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge status={quote.status as any}>
                        {quoteStatusLabels[quote.status] || quote.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-primary-800">
                      {formatPrice(quote.grandTotal, quote.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-primary-600">
                      {formatDate(quote.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/quotes/${quote.id}`)}
                      >
                        Goruntule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ================================================================== */}
      {/* DOCUMENTS                                                           */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Dokumanlar</h3>
              <p className="text-xs text-primary-500">{documents.length} dosya</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${
                  isDragging
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-primary-200 hover:border-primary-300'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
              />

              {isUploadingDoc ? (
                <div className="flex items-center justify-center gap-2">
                  <Spinner />
                  <span className="text-primary-600">Yukleniyor...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-primary-400 mx-auto mb-2" />
                  <p className="text-primary-700 font-medium">
                    Dosyalari surukleyip birakin
                  </p>
                  <p className="text-sm text-primary-500 mt-1">
                    veya{' '}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-accent-600 hover:underline cursor-pointer"
                    >
                      dosya secin
                    </button>
                  </p>
                  <p className="text-xs text-primary-400 mt-2">
                    PDF, DOC, DOCX, XLS, XLSX, PNG, JPG (max 10MB)
                  </p>
                </>
              )}
            </div>

            {/* Error Message */}
            {docError && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
                <span className="text-sm text-red-700">{docError}</span>
                <button onClick={() => setDocError(null)} className="cursor-pointer">
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </div>
            )}

            {/* Documents List */}
            {documents.length > 0 ? (
              <div className="divide-y divide-primary-100 border border-primary-200 rounded-lg overflow-hidden">
                {documents.map((doc) => {
                  const FileIcon = getFileIcon(doc.fileType);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 hover:bg-primary-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileIcon className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-primary-900 truncate">
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-primary-500">
                            {formatFileSize(doc.fileSize)} &bull; {doc.uploadedBy} &bull;{' '}
                            {formatDateTime(doc.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadDoc(doc.id, doc.fileName)}
                          title="Indir"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="text-red-600 hover:bg-red-50"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-primary-500 py-4">
                Henuz dokuman yuklenmemis
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* ACTIVITIES / NOTES LOG                                              */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Aktiviteler ve Notlar</h3>
              <p className="text-xs text-primary-500">{activities.length} kayit</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Add Note */}
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Yeni not ekleyin..."
                rows={2}
                className="flex-1 px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAddNote();
                  }
                }}
              />
              <Button
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSavingNote}
                isLoading={isSavingNote}
                className="self-end"
              >
                <Send className="w-4 h-4" />
                Ekle
              </Button>
            </div>

            {/* Activities List */}
            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex gap-3 p-3 bg-primary-50 rounded-lg"
                  >
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0 border border-primary-200">
                      <MessageSquare className="w-4 h-4 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-primary-900">
                          {activity.userName}
                        </span>
                        <Badge variant="default">
                          {actionLabels[activity.action] || activity.action}
                        </Badge>
                        <span className="text-xs text-primary-400">
                          {formatDateTime(activity.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-primary-700 mt-1 whitespace-pre-wrap">
                        {activity.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-primary-500 py-4">
                Henuz aktivite veya not bulunmuyor
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* EDIT MODAL                                                          */}
      {/* ================================================================== */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Proje Duzenle"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditOpen(false)} disabled={isSaving}>
              Iptal
            </Button>
            <Button onClick={handleEditSubmit} isLoading={isSaving}>
              Guncelle
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {editError}
            </div>
          )}

          <Input
            label="Proje Adi *"
            value={editForm.name}
            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Proje adi"
            required
          />

          <Select
            label="Durum"
            value={editForm.status}
            onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
            options={statusOptions}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Tahmini Baslangic"
              type="date"
              value={editForm.estimatedStart}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, estimatedStart: e.target.value }))
              }
            />
            <Input
              label="Tahmini Bitis"
              type="date"
              value={editForm.estimatedEnd}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, estimatedEnd: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-primary-700">Notlar</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Proje notlari..."
              rows={3}
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
