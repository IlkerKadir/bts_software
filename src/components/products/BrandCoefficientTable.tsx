'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Edit2, Save, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

interface BrandWithDiscount {
  id: string;
  name: string;
  brandDiscount?: {
    coefficient: number;
  } | null;
  updatedAt?: string | null;
}

interface BrandCoefficientTableProps {
  canEdit: boolean;
}

export function BrandCoefficientTable({ canEdit }: BrandCoefficientTableProps) {
  const [brands, setBrands] = useState<BrandWithDiscount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/products/brands');
      const data = await response.json();

      if (response.ok) {
        setBrands(data.brands || []);
      } else {
        setMessage({ type: 'error', text: 'Markalar yüklenirken bir hata oluştu.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Markalar yüklenirken bir hata oluştu.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({ type, text });
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(null);
    }, 3000);
  };

  const formatCoefficient = (brand: BrandWithDiscount): string => {
    const value = brand.brandDiscount?.coefficient ?? 1;
    return Number(value).toFixed(3);
  };

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '-';
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateStr));
    } catch {
      return '-';
    }
  };

  const startEditing = (brand: BrandWithDiscount) => {
    setEditingId(brand.id);
    setEditValue(formatCoefficient(brand));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue('');
  };

  const validateCoefficient = (value: string): boolean => {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (num < 0.001 || num > 9.999) return false;
    return true;
  };

  const handleSave = async (brandId: string) => {
    if (!validateCoefficient(editValue)) {
      showMessage('error', 'Katsayı 0.001 ile 9.999 arasında olmalıdır.');
      return;
    }

    const coefficient = parseFloat(parseFloat(editValue).toFixed(3));

    setSavingId(brandId);
    try {
      const response = await fetch(`/api/brands/${brandId}/discount`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coefficient }),
      });

      const data = await response.json();

      if (response.ok) {
        setBrands((prev) =>
          prev.map((b) =>
            b.id === brandId
              ? {
                  ...b,
                  brandDiscount: { coefficient },
                  updatedAt: new Date().toISOString(),
                }
              : b
          )
        );
        const brand = brands.find((b) => b.id === brandId);
        showMessage('success', `${brand?.name ?? 'Marka'} markası katsayısı güncellendi`);
        setEditingId(null);
        setEditValue('');
      } else {
        showMessage('error', data.error || 'Katsayı güncellenirken bir hata oluştu.');
      }
    } catch {
      showMessage('error', 'Katsayı güncellenirken bir hata oluştu.');
    } finally {
      setSavingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, brandId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(brandId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const handleRefresh = () => {
    cancelEditing();
    fetchBrands();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Marka Katsayıları</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Yenile
        </Button>
      </CardHeader>

      <CardBody className="p-0">
        {/* Message */}
        {message && (
          <div
            className={cn(
              'mx-5 mt-4 px-4 py-3 rounded-lg text-sm font-medium border',
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-300'
                : 'bg-red-50 text-red-700 border-red-300'
            )}
          >
            {message.text}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>MARKA</th>
                <th>VARSAYILAN KATSAYI</th>
                <th>SON GÜNCELLEME</th>
                {canEdit && <th className="w-28">İŞLEM</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="text-center py-12">
                    <div className="flex items-center justify-center gap-3">
                      <Spinner size="sm" />
                      <span className="text-primary-500">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : brands.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="text-center py-12 text-primary-500">
                    Marka bulunamadı
                  </td>
                </tr>
              ) : (
                brands.map((brand) => {
                  const isEditing = editingId === brand.id;
                  const isSaving = savingId === brand.id;

                  return (
                    <tr key={brand.id}>
                      <td className="font-medium">{brand.name}</td>
                      <td>
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number"
                            step="0.001"
                            min="0.001"
                            max="9.999"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, brand.id)}
                            disabled={isSaving}
                            className={cn(
                              'w-28 px-2 py-1 border rounded-lg text-sm tabular-nums',
                              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                              'border-primary-300',
                              'disabled:opacity-50'
                            )}
                          />
                        ) : (
                          <span className="tabular-nums font-mono text-sm">
                            {formatCoefficient(brand)}
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-primary-500">
                        {formatDate(brand.updatedAt)}
                      </td>
                      {canEdit && (
                        <td>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSave(brand.id)}
                                  disabled={isSaving}
                                  className="p-1.5 rounded hover:bg-green-50 text-green-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Kaydet"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  disabled={isSaving}
                                  className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="İptal"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => startEditing(brand)}
                                disabled={savingId !== null}
                                className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Düzenle"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
