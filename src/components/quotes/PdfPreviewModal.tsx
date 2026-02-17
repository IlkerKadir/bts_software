'use client';

import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
}

export function PdfPreviewModal({ isOpen, onClose, quoteId }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let revoked = false;

    setIsLoading(true);
    setError(null);

    fetch(`/api/quotes/${quoteId}/export/pdf`)
      .then((res) => {
        if (!res.ok) throw new Error('PDF oluşturulamadı');
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((err) => {
        if (!revoked) setError(err.message);
      })
      .finally(() => {
        if (!revoked) setIsLoading(false);
      });

    return () => {
      revoked = true;
    };
  }, [isOpen, quoteId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <h2 className="text-sm font-semibold text-primary-900">Teklif Ön İzleme</h2>
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a href={pdfUrl} download={`teklif-${quoteId}.pdf`}>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4" /> İndir
              </Button>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-primary-100 rounded cursor-pointer"
          >
            <X className="h-5 w-5 text-primary-600" />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-gray-100">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            <span className="ml-2 text-sm text-primary-600">PDF oluşturuluyor...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {pdfUrl && <iframe src={pdfUrl} className="w-full h-full" title="PDF Preview" />}
      </div>
    </div>
  );
}
