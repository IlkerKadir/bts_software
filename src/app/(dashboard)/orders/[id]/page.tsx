'use client';

import { use } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  Download,
  Loader2,
  ClipboardCopy,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button, Badge, Spinner, Select } from '@/components/ui';
import { StfEditor } from '@/components/orders/StfEditor';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  quote: {
    id: string;
    subject?: string | null;
  };
}

const orderStatusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

const orderStatusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TASLAK: 'default',
  TAMAMLANDI: 'success',
  IPTAL: 'error',
};

/**
 * Filename for a blob download. The browser uses the anchor's `download`
 * attribute (NOT the server's Content-Disposition) for blob: URLs, so we read
 * the server-built filename (STF-####-Proje-Firma.ext) off the response header
 * and fall back to a plain name if it's missing.
 */
function downloadFilename(response: Response, fallback: string): string {
  const cd = response.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : fallback;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [canDelete, setCanDelete] = useState(false); // management-only delete authority

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setCanDelete(Boolean(d.user?.role?.canDelete)))
      .catch(() => {});
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Siparis yuklenemedi');
      }

      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;

    const statusLabel = orderStatusLabels[newStatus] || newStatus;
    const confirmMessage = newStatus === 'IPTAL'
      ? `Bu siparisi iptal etmek istediginize emin misiniz? Bu islem geri alinamaz.`
      : `Siparis durumunu "${statusLabel}" olarak degistirmek istediginize emin misiniz?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Durum guncellenemedi');
      }

      await fetchOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!order) return;
    setIsCreatingRevision(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Revizyon olusturulamadi');
      }
      const newOrderId = data.order?.id || data.id;
      if (newOrderId) {
        router.push(`/orders/${newOrderId}`);
      }
    } catch (err) {
      console.error('Revision error:', err);
      setError(err instanceof Error ? err.message : 'Revizyon olusturulurken bir hata olustu');
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Siparis silinemedi');
      }
      router.push('/orders');
    } catch (err) {
      console.error('Delete error:', err);
      setError(err instanceof Error ? err.message : 'Siparis silinirken bir hata olustu');
      setConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}/export/pdf`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'PDF olusturulamadi');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename(response, order ? `${order.orderNumber}.pdf` : 'siparis-teyit.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF olusturulurken bir hata olustu');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}/export/excel`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Excel olusturulamadi');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename(response, order ? `${order.orderNumber}.xlsx` : 'siparis-teyit.xlsx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel olusturulurken bir hata olustu');
    } finally {
      setIsExportingExcel(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">{error}</p>
        <Button variant="secondary" onClick={() => router.push('/orders')}>
          <ArrowLeft className="w-4 h-4" />
          Siparislere Don
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-primary-700">Siparis bulunamadi</p>
        <Button variant="secondary" onClick={() => router.push('/orders')}>
          <ArrowLeft className="w-4 h-4" />
          Siparislere Don
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Action bar (status / PDF / quote-link). StfEditor owns the orderNumber title. */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Badge variant={orderStatusVariants[order.status] || 'default'}>
            {orderStatusLabels[order.status] || order.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            options={[
              { value: 'TASLAK', label: 'Taslak' },
              { value: 'TAMAMLANDI', label: 'Tamamlandı' },
              { value: 'IPTAL', label: 'İptal' },
              // Fallback so a (post-remap: shouldn't happen) legacy status still
              // displays its real value instead of silently showing the first option.
              ...(['TASLAK', 'TAMAMLANDI', 'IPTAL'].includes(order.status)
                ? []
                : [{ value: order.status, label: orderStatusLabels[order.status] || order.status }]),
            ]}
            disabled={isUpdating}
            className="w-48"
          />
          <Button
            variant="secondary"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            PDF Indir
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
          >
            {isExportingExcel ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Excel Indir
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/quotes/${order.quote.id}`)}
          >
            <FileText className="w-4 h-4" />
            Teklifi Gor
          </Button>

          {order.status === 'TAMAMLANDI' && (
            <Button
              variant="secondary"
              onClick={() => handleStatusChange('TASLAK')}
              disabled={isUpdating}
            >
              <Undo2 className="w-4 h-4" />
              Taslağa Geri Çek
            </Button>
          )}

          {order.status === 'IPTAL' && (
            <Button
              variant="secondary"
              onClick={() => handleStatusChange('TASLAK')}
              disabled={isUpdating}
            >
              <Undo2 className="w-4 h-4" />
              İptali Geri Al
            </Button>
          )}

          {order.status === 'TAMAMLANDI' && (
            <Button
              variant="secondary"
              onClick={handleCreateRevision}
              isLoading={isCreatingRevision}
              disabled={isCreatingRevision}
            >
              <ClipboardCopy className="w-4 h-4" />
              Revize Oluştur
            </Button>
          )}

          {canDelete && order.status === 'TASLAK' && (
            <Button
              variant={confirmDelete ? 'danger' : 'secondary'}
              onClick={handleDelete}
              isLoading={isDeleting}
              disabled={isDeleting}
              onBlur={() => setConfirmDelete(false)}
            >
              <Trash2 className="w-4 h-4" />
              {confirmDelete ? 'Emin misiniz?' : 'Sil'}
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Editable STF. Keyed on status: StfEditor only fetches on mount, so
          after "Taslağa Geri Çek" it kept rendering the stale read-only
          (disabled-fieldset) form — the client saw "+ Not Ekle" do nothing
          even after pulling back to Taslak. Remounting on status change
          reloads it with the fresh status, editable again. */}
      <StfEditor stfId={id} key={order.status} />
    </div>
  );
}
