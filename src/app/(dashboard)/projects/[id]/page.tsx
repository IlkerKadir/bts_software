import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { Card, CardBody, Badge } from '@/components/ui';
import {
  Building2,
  Calendar,
  FileText,
  ArrowLeft,
  Plus,
  Clock,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const statusLabels: Record<string, string> = {
  TEKLIF_ASAMASINDA: 'Teklif Aşamasında',
  ONAYLANDI: 'Onaylandı',
  DEVAM_EDIYOR: 'Devam Ediyor',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

const statusColors: Record<string, string> = {
  TEKLIF_ASAMASINDA: 'bg-amber-100 text-amber-800',
  ONAYLANDI: 'bg-green-100 text-green-800',
  DEVAM_EDIYOR: 'bg-blue-100 text-blue-800',
  TAMAMLANDI: 'bg-emerald-100 text-emerald-800',
  IPTAL: 'bg-red-100 text-red-800',
};

const quoteStatusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

export default async function ProjectDetailPage({ params }: PageProps) {
  const user = await getSession();
  if (!user) return null;

  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: true,
      quotes: {
        orderBy: { createdAt: 'desc' },
        include: {
          company: true,
          createdBy: { select: { fullName: true } },
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const formatCurrency = (amount: number | any, currency: string) => {
    const num = typeof amount === 'object' ? Number(amount) : amount;
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency,
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Projelere Dön
      </Link>

      {/* Project Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">{project.name}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-primary-600">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary-400" />
              <span>{project.client.name}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                statusColors[project.status] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {statusLabels[project.status] || project.status}
            </span>
          </div>
        </div>

        <Link
          href={`/quotes/new?projectId=${project.id}&companyId=${project.clientId}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Teklif
        </Link>
      </div>

      {/* Project Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <h2 className="font-semibold text-primary-900">Proje Bilgileri</h2>

            {project.notes && (
              <div>
                <p className="text-sm text-primary-500 mb-1">Notlar</p>
                <p className="text-sm text-primary-700 whitespace-pre-wrap">
                  {project.notes}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-primary-500 mb-1">Tahmini Başlangıç</p>
                <div className="flex items-center gap-1.5 text-sm text-primary-700">
                  <Calendar className="h-4 w-4 text-primary-400" />
                  {formatDate(project.estimatedStart)}
                </div>
              </div>
              <div>
                <p className="text-sm text-primary-500 mb-1">Tahmini Bitiş</p>
                <div className="flex items-center gap-1.5 text-sm text-primary-700">
                  <Calendar className="h-4 w-4 text-primary-400" />
                  {formatDate(project.estimatedEnd)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-primary-500 mb-1">Oluşturulma Tarihi</p>
                <div className="flex items-center gap-1.5 text-sm text-primary-700">
                  <Clock className="h-4 w-4 text-primary-400" />
                  {formatDate(project.createdAt)}
                </div>
              </div>
              <div>
                <p className="text-sm text-primary-500 mb-1">Son Güncelleme</p>
                <div className="flex items-center gap-1.5 text-sm text-primary-700">
                  <Clock className="h-4 w-4 text-primary-400" />
                  {formatDate(project.updatedAt)}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Stats */}
        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-semibold text-primary-900">Özet</h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-600">Toplam Teklif</span>
                <span className="text-lg font-bold text-primary-900">
                  {project.quotes.length}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-600">Kazanılan</span>
                <span className="text-lg font-bold text-green-600">
                  {project.quotes.filter((q) => q.status === 'KAZANILDI').length}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-600">Bekleyen</span>
                <span className="text-lg font-bold text-amber-600">
                  {
                    project.quotes.filter(
                      (q) =>
                        q.status === 'GONDERILDI' ||
                        q.status === 'ONAY_BEKLIYOR' ||
                        q.status === 'TAKIPTE'
                    ).length
                  }
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-600">Kaybedilen</span>
                <span className="text-lg font-bold text-red-600">
                  {project.quotes.filter((q) => q.status === 'KAYBEDILDI').length}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Related Quotes */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-900">
              <FileText className="inline h-5 w-5 mr-2 text-primary-400" />
              İlgili Teklifler ({project.quotes.length})
            </h2>
          </div>

          {project.quotes.length === 0 ? (
            <div className="text-center py-8 text-primary-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-primary-300" />
              <p>Bu projeye ait teklif bulunmuyor.</p>
              <Link
                href={`/quotes/new?projectId=${project.id}&companyId=${project.clientId}`}
                className="inline-flex items-center gap-1.5 mt-3 text-accent-600 hover:text-accent-700 font-medium"
              >
                <Plus className="h-4 w-4" />
                İlk teklifi oluştur
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-primary-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Teklif No
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Firma
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Durum
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Tutar
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Tarih
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-primary-500 uppercase">
                      Hazırlayan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.quotes.map((quote) => (
                    <tr
                      key={quote.id}
                      className="border-b border-primary-100 hover:bg-primary-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="font-medium text-accent-600 hover:text-accent-700"
                        >
                          {quote.quoteNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-primary-700">
                        {quote.company.name}
                      </td>
                      <td className="py-3 px-4">
                        <Badge status={quote.status as any} />
                      </td>
                      <td className="py-3 px-4 text-sm text-primary-900 font-medium text-right">
                        {formatCurrency(quote.grandTotal, quote.currency)}
                      </td>
                      <td className="py-3 px-4 text-sm text-primary-600">
                        {formatDate(quote.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-sm text-primary-600">
                        {quote.createdBy.fullName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
