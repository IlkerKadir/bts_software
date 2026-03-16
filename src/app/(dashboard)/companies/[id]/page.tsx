'use client';

import { use } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Users,
  Folder,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Badge, Spinner } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { quoteStatusLabels } from '@/lib/validations/quote';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface Contact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

interface CompanyQuote {
  id: string;
  quoteNumber: string;
  status: string;
  grandTotal: number | null;
}

interface CompanyProject {
  id: string;
  name: string;
  status: string;
}

interface Company {
  id: string;
  name: string;
  type: 'CLIENT' | 'PARTNER';
  address?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  contacts?: Contact[] | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  projects: CompanyProject[];
  quotes: CompanyQuote[];
  _count: {
    projects: number;
    quotes: number;
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Status Labels
// ---------------------------------------------------------------------------

const projectStatusLabels: Record<string, string> = {
  TEKLIF_ASAMASINDA: 'Teklif Aşamasında',
  ONAYLANDI: 'Onaylandı',
  DEVAM_EDIYOR: 'Devam Ediyor',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompanyDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    try {
      const response = await fetch(`/api/companies/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Firma yüklenemedi');
      }

      setCompany(data.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const formatDateLong = (dateString: string) => {
    return formatDate(dateString, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (price: number | null) => {
    if (price == null) return '-';
    return formatCurrency(price);
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

  if (error && !company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error}</p>
        <Button variant="secondary" onClick={() => router.push('/companies')}>
          <ArrowLeft className="w-4 h-4" />
          Firmalara Dön
        </Button>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">Firma bulunamadı</p>
        <Button variant="secondary" onClick={() => router.push('/companies')}>
          <ArrowLeft className="w-4 h-4" />
          Firmalara Dön
        </Button>
      </div>
    );
  }

  const contacts: Contact[] = Array.isArray(company.contacts) ? company.contacts : [];

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
            onClick={() => router.push('/companies')}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-primary-900">{company.name}</h1>
              <Badge variant={company.type === 'CLIENT' ? 'info' : 'default'}>
                {company.type === 'CLIENT' ? 'Müşteri' : 'İş Ortağı'}
              </Badge>
              <Badge variant={company.isActive ? 'success' : 'error'}>
                {company.isActive ? 'Aktif' : 'Pasif'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => router.push(`/companies/${id}/edit`)}>
            <Edit className="w-4 h-4" />
            Düzenle
          </Button>
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
        {/* Company Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Firma Bilgileri</h3>
                <p className="text-xs text-primary-500">Genel bilgiler</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm">
              {company.taxNumber && (
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-primary-500">Vergi No:</span>
                    <span className="ml-2 font-medium text-primary-800">{company.taxNumber}</span>
                  </div>
                </div>
              )}

              {company.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-primary-500">Telefon:</span>
                    <span className="ml-2 font-medium text-primary-800">{company.phone}</span>
                  </div>
                </div>
              )}

              {company.email && (
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-primary-500">E-posta:</span>
                    <span className="ml-2 font-medium text-primary-800">{company.email}</span>
                  </div>
                </div>
              )}

              {company.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-primary-500">Adres:</span>
                    <p className="font-medium text-primary-800 mt-0.5">{company.address}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-primary-100">
                {company.isActive ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-primary-500">Durum:</span>
                <span className="font-medium text-primary-800">
                  {company.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Stats Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-accent-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Özet</h3>
                <p className="text-xs text-primary-500">Teklif ve proje istatistikleri</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-primary-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary-900">{company._count.quotes}</p>
                <p className="text-xs text-primary-500 mt-1">Toplam Teklif</p>
              </div>
              <div className="bg-primary-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary-900">{company._count.projects}</p>
                <p className="text-xs text-primary-500 mt-1">Toplam Proje</p>
              </div>
            </div>

            {company.notes && (
              <div className="mt-4 pt-3 border-t border-primary-100">
                <p className="text-xs font-medium text-primary-500 mb-1">Notlar</p>
                <p className="text-sm text-primary-700 whitespace-pre-wrap">{company.notes}</p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-primary-100 text-xs text-primary-400">
              <p>Oluşturulma: {formatDateLong(company.createdAt)}</p>
              <p>Son Güncelleme: {formatDateLong(company.updatedAt)}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* CONTACTS                                                            */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">İletişim Kişileri</h3>
              <p className="text-xs text-primary-500">{contacts.length} kişi</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {contacts.length === 0 ? (
            <p className="text-sm text-primary-400 text-center py-4">
              Henüz kişi eklenmemiş.
            </p>
          ) : (
            <div className="divide-y divide-primary-100">
              {contacts.map((contact, index) => (
                <div key={index} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary-900">{contact.name}</p>
                      {contact.title && (
                        <p className="text-xs text-primary-500 mt-0.5">{contact.title}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1.5">
                    {contact.email && (
                      <div className="flex items-center gap-1.5 text-xs text-primary-600">
                        <Mail className="w-3.5 h-3.5 text-primary-400" />
                        {contact.email}
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-primary-600">
                        <Phone className="w-3.5 h-3.5 text-primary-400" />
                        {contact.phone}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* QUOTES                                                              */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Son Teklifler</h3>
              <p className="text-xs text-primary-500">
                Son {company.quotes.length} teklif (toplam {company._count.quotes})
              </p>
            </div>
          </div>
        </CardHeader>
        {company.quotes.length === 0 ? (
          <CardBody>
            <p className="text-sm text-primary-400 text-center py-4">
              Bu firmaya ait teklif bulunmuyor.
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
                  <th className="px-4 py-2.5 text-right w-24">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {company.quotes.map((quote) => (
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
                      {formatPrice(quote.grandTotal)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/quotes/${quote.id}`)}
                      >
                        Görüntüle
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
      {/* PROJECTS                                                            */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900">Son Projeler</h3>
              <p className="text-xs text-primary-500">
                Son {company.projects.length} proje (toplam {company._count.projects})
              </p>
            </div>
          </div>
        </CardHeader>
        {company.projects.length === 0 ? (
          <CardBody>
            <p className="text-sm text-primary-400 text-center py-4">
              Bu firmaya ait proje bulunmuyor.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-accent-50 border-b border-accent-200 text-xs uppercase tracking-wider text-accent-600">
                  <th className="px-4 py-2.5 text-left">Proje Adı</th>
                  <th className="px-4 py-2.5 text-left">Durum</th>
                  <th className="px-4 py-2.5 text-right w-24">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {company.projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-accent-100 hover:bg-accent-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-primary-900">
                      {project.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="default">
                        {projectStatusLabels[project.status] || project.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        Görüntüle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
