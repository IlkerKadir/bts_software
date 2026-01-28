'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface PreviewProduct {
  code: string;
  brand: string;
  name: string;
  listPrice: number;
  currency: string;
  status: 'new' | 'price_change' | 'unchanged';
  oldPrice?: number;
}

interface PreviewData {
  totalProducts: number;
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  products: PreviewProduct[];
}

interface ImportResult {
  message: string;
  created: number;
  updated: number;
  total: number;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';
type FilterTab = 'all' | 'new' | 'price_change' | 'unchanged';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    TRY: '₺',
    GBP: '£',
  };
  const symbol = symbols[currency] ?? currency;
  return `${symbol}${price.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  count,
  colorClass,
}: {
  label: string;
  count: number;
  colorClass: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-primary-200 p-4 flex flex-col items-center gap-1">
      <span
        className={cn(
          'inline-flex items-center justify-center text-lg font-bold rounded-full w-10 h-10',
          colorClass,
        )}
      >
        {count}
      </span>
      <span className="text-xs text-accent-600 font-medium">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs config
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'new', label: 'Yeni' },
  { key: 'price_change', label: 'Fiyat Değişikliği' },
  { key: 'unchanged', label: 'Değişmemiş' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: ProductImportModalProps) {
  // State
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Reset state when modal closes ----
  const handleClose = useCallback(() => {
    setStep('upload');
    setFile(null);
    setIsDragOver(false);
    setPreview(null);
    setResult(null);
    setError(null);
    setIsLoading(false);
    setActiveFilter('all');
    onClose();
  }, [onClose]);

  // ---- File handling ----
  const acceptFile = useCallback((f: File) => {
    setError(null);
    if (
      f.type !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      !f.name.endsWith('.xlsx')
    ) {
      setError('Yalnızca .xlsx dosyaları kabul edilmektedir.');
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) acceptFile(droppedFile);
    },
    [acceptFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) acceptFile(selectedFile);
    },
    [acceptFile],
  );

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---- API calls ----
  const handlePreview = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'preview');

      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Önizleme başarısız oldu.');
      }

      setPreview(data.preview);
      setStep('preview');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Dosya işlenirken bir hata oluştu.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    setStep('importing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'confirm');

      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || 'İçeri aktarma başarısız oldu.',
        );
      }

      setResult(data);
      setStep('result');
      onImportComplete?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'İçeri aktarma sırasında bir hata oluştu.',
      );
      setStep('preview');
    }
  };

  const handleRetry = () => {
    setError(null);
    if (step === 'upload') {
      handlePreview();
    } else if (step === 'preview') {
      handleConfirmImport();
    }
  };

  // ---- Filtered products ----
  const filteredProducts =
    preview?.products.filter((p) => {
      if (activeFilter === 'all') return true;
      return p.status === activeFilter;
    }) ?? [];

  // ---- Footer ----
  const renderFooter = () => {
    switch (step) {
      case 'upload':
        return (
          <>
            <Button variant="secondary" onClick={handleClose}>
              İptal
            </Button>
            <Button
              onClick={handlePreview}
              disabled={!file || isLoading}
              isLoading={isLoading}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Önizleme
            </Button>
          </>
        );
      case 'preview':
        return (
          <>
            <Button variant="secondary" onClick={handleClose}>
              İptal
            </Button>
            <Button onClick={handleConfirmImport}>
              <Check className="w-4 h-4" />
              Onayla ve İçeri Aktar
            </Button>
          </>
        );
      case 'importing':
        return null;
      case 'result':
        return (
          <Button onClick={handleClose}>
            Kapat
          </Button>
        );
      default:
        return null;
    }
  };

  // ---- Body ----
  const renderBody = () => {
    switch (step) {
      // ============================================================
      // STEP 1: Upload
      // ============================================================
      case 'upload':
        return (
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={handleBrowse}
              className={cn(
                'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors',
                isDragOver
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-primary-300 hover:border-primary-400 hover:bg-primary-50/50',
              )}
            >
              <Upload
                className={cn(
                  'w-10 h-10',
                  isDragOver ? 'text-primary-600' : 'text-accent-400',
                )}
              />
              <div className="text-center">
                <p className="text-sm font-medium text-primary-800">
                  Dosyayı sürükleyip bırakın veya{' '}
                  <span className="text-primary-600 underline">dosya seçin</span>
                </p>
                <p className="text-xs text-accent-500 mt-1">
                  Yalnızca .xlsx dosyaları kabul edilir
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Selected file info */}
            {file && (
              <div className="flex items-center gap-3 bg-primary-50 rounded-lg px-4 py-3 border border-primary-200">
                <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-accent-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-accent-400 hover:text-accent-600 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-100 px-2 py-1"
                  >
                    Tekrar Dene
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      // ============================================================
      // STEP 2: Preview
      // ============================================================
      case 'preview':
        return (
          <div className="space-y-4">
            {/* Summary cards */}
            {preview && (
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard
                  label="Toplam Ürün"
                  count={preview.totalProducts}
                  colorClass="bg-blue-100 text-blue-700"
                />
                <SummaryCard
                  label="Yeni Ürün"
                  count={preview.newProducts}
                  colorClass="bg-green-100 text-green-700"
                />
                <SummaryCard
                  label="Fiyat Değişikliği"
                  count={preview.priceChanges}
                  colorClass="bg-amber-100 text-amber-700"
                />
                <SummaryCard
                  label="Değişmemiş"
                  count={preview.unchanged}
                  colorClass="bg-gray-100 text-gray-600"
                />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 border-b border-primary-200">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer',
                    activeFilter === tab.key
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-accent-500 hover:text-accent-700 hover:border-accent-300',
                  )}
                >
                  {tab.label}
                  {preview && (
                    <span className="ml-1.5 text-xs text-accent-400">
                      (
                      {tab.key === 'all'
                        ? preview.totalProducts
                        : tab.key === 'new'
                          ? preview.newProducts
                          : tab.key === 'price_change'
                            ? preview.priceChanges
                            : preview.unchanged}
                      )
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Products table */}
            <div className="border border-primary-200 rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-primary-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Ürün Kodu
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Marka
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Ürün Adı
                      </th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Liste Fiyat
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Para Birimi
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-primary-700 uppercase tracking-wider">
                        Durum
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center py-8 text-accent-400 text-sm"
                        >
                          Bu filtreye uygun ürün bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((product, idx) => (
                        <tr
                          key={`${product.code}-${idx}`}
                          className={cn(
                            idx % 2 === 0 ? 'bg-white' : 'bg-primary-50/40',
                            'hover:bg-primary-50 transition-colors',
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-primary-600">
                            {product.code}
                          </td>
                          <td className="px-3 py-2 text-primary-800">
                            {product.brand}
                          </td>
                          <td className="px-3 py-2 text-primary-800 truncate max-w-[200px]">
                            {product.name}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {product.status === 'price_change' &&
                            product.oldPrice != null ? (
                              <span className="flex items-center justify-end gap-1.5">
                                <span className="text-accent-400 line-through text-xs">
                                  {formatPrice(product.oldPrice, product.currency)}
                                </span>
                                <ArrowRight className="w-3 h-3 text-accent-400 flex-shrink-0" />
                                <span className="text-green-600 font-medium">
                                  {formatPrice(product.listPrice, product.currency)}
                                </span>
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  product.status === 'new'
                                    ? 'text-green-600 font-medium'
                                    : 'text-primary-800',
                                )}
                              >
                                {formatPrice(product.listPrice, product.currency)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-medium text-accent-600">
                            {product.currency}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {product.status === 'new' && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-300">
                                Yeni
                              </span>
                            )}
                            {product.status === 'price_change' && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-300">
                                Fiyat Değişti
                              </span>
                            )}
                            {product.status === 'unchanged' && (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500 border border-gray-300">
                                Değişmedi
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-100 px-2 py-1"
                  >
                    Tekrar Dene
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      // ============================================================
      // STEP 3: Importing
      // ============================================================
      case 'importing':
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner size="lg" />
            <p className="text-sm font-medium text-primary-700">
              İçeri aktarılıyor...
            </p>
            <p className="text-xs text-accent-500">
              Lütfen bekleyin, bu işlem biraz zaman alabilir.
            </p>
          </div>
        );

      // ============================================================
      // STEP 4: Result
      // ============================================================
      case 'result':
        return (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-primary-900 mb-1">
                İçeri Aktarma Tamamlandı
              </h3>
              {result && (
                <p className="text-sm text-accent-600">
                  {result.total} ürün başarıyla içeri aktarıldı ({result.created} yeni, {result.updated} güncellendi)
                </p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ---- Render ----
  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 'importing' ? () => {} : handleClose}
      title="Ürün İçeri Aktar"
      size="xl"
      footer={renderFooter()}
    >
      {renderBody()}
    </Modal>
  );
}
