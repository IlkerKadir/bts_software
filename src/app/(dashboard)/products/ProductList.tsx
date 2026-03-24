'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Upload, Download, Settings, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { ProductForm } from './ProductForm';
import { ProductImportModal } from '@/components/products/ProductImportModal';
import { BulkPriceUpdateModal } from '@/components/products/BulkPriceUpdateModal';
import { BrandCoefficientTable } from '@/components/products/BrandCoefficientTable';
import { formatCurrency } from '@/lib/utils/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Pagination } from '@/lib/types/pagination';

interface Brand {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  shortCode?: string | null;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  model?: string | null;
  name: string;
  nameTr?: string | null;
  unit: string;
  listPrice: number;
  costPrice?: number | null;
  currency: string;
  supplier?: string | null;
  minKatsayi?: number | null;
  maxKatsayi?: number | null;
  isActive: boolean;
}

interface ProductListProps {
  canViewCosts: boolean;
  canEditProducts: boolean;
  canDelete: boolean;
}

type SortField = 'code' | 'shortCode' | 'name' | 'brand' | 'model' | 'category' | 'listPrice' | 'costPrice' | 'isActive';
type SortDirection = 'asc' | 'desc';

export function ProductList({ canViewCosts, canEditProducts, canDelete }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCoefficientModalOpen, setIsCoefficientModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchProducts = useCallback(async (page = 1) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (brandFilter) params.set('brandId', brandFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (sortField) params.set('sortField', sortField);
      if (sortDirection) params.set('sortDirection', sortDirection);
      params.set('page', page.toString());

      const response = await fetch(`/api/products?${params}`);
      const data = await response.json();

      if (response.ok) {
        setProducts(data.products);
        setPagination(data.pagination);
      } else {
        setFetchError(data.error || 'Ürünler yüklenirken bir hata oluştu');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setFetchError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, brandFilter, categoryFilter, sortField, sortDirection]);

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          fetch('/api/products/brands'),
          fetch('/api/products/categories'),
        ]);
        const brandsData = await brandsRes.json();
        const categoriesData = await categoriesRes.json();
        setBrands(brandsData.brands || []);
        setCategories(categoriesData.categories || []);
      } catch (err) {
        console.error('Error fetching lookups:', err);
      }
    };

    fetchLookups();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleEdit = (product: Product) => {
    setEditingProduct({
      ...product,
      brandId: product.brand?.id || null,
      categoryId: product.category?.id || null,
    } as Product);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;

    try {
      const response = await fetch(`/api/products/${deletingProduct.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setDeleteError(data.error || 'Silme işlemi başarısız');
        return;
      }

      setDeletingProduct(null);
      fetchProducts();
    } catch {
      setDeleteError('Bir hata oluştu');
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingProduct(null);
  };

  const handleFormSuccess = () => {
    fetchProducts();
  };

  const formatPrice = (price: number | null | undefined, currency: string) => {
    if (price === null || price === undefined) return '-';
    return formatCurrency(price, currency);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-primary-300" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-primary-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary-600" />
    );
  };

  // Sorting is now handled server-side; products are already sorted by the API
  const sortedProducts = products;

  const totalColumns =
    1 + // Checkbox
    1 + // Kod
    1 + // Kısa Kod
    1 + // Ürün Adı
    1 + // Marka
    1 + // Model
    1 + // Kategori
    1 + // Liste Fiyatı
    (canViewCosts ? 1 : 0) + // Maliyet
    1 + // Durum
    ((canEditProducts || canDelete) ? 1 : 0); // İşlemler

  const handleSelectAll = () => {
    if (selectedProducts.size === sortedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(sortedProducts.map(p => p.id)));
    }
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/products/export');
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
      a.download = match?.[1] || 'BTS_Urunler.xlsx';
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

  const selectedProductsForBulk = products.filter(p => selectedProducts.has(p.id)).map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Ürünler</h1>
          <p className="text-primary-500">Ürün kataloğunu yönetin</p>
        </div>
        <div className="flex items-center gap-2">
          {canViewCosts && (
            <Button
              variant="secondary"
              onClick={() => setIsCoefficientModalOpen(true)}
            >
              <Settings className="w-4 h-4" />
              Katsayı Yönetimi
            </Button>
          )}
          {canEditProducts && (
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Aktarılıyor...' : "Excel\u0027e Aktar"}
            </Button>
          )}
          {canEditProducts && (
            <Button
              variant="secondary"
              onClick={() => setIsImportModalOpen(true)}
            >
              <Upload className="w-4 h-4" />
              Excel&apos;den Yükle
            </Button>
          )}
          {canEditProducts && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="w-4 h-4" />
              Yeni Ürün
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Ürün ara (kod, ad, model)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <Select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Markalar' },
              ...brands.map(b => ({ value: b.id, label: b.name })),
            ]}
            className="w-full sm:w-48"
          />
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: '', label: 'Tüm Kategoriler' },
              ...categories.map(c => ({ value: c.id, label: c.name })),
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
            onClick={() => fetchProducts()}
            className="text-sm text-red-600 underline ml-4"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      {selectedProducts.size > 0 && (
        <div className="flex items-center gap-3 bg-accent-50 border border-accent-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-accent-700">
            {selectedProducts.size} ürün seçildi
          </span>
          <Button
            size="sm"
            onClick={() => setIsBulkPriceModalOpen(true)}
          >
            Toplu Fiyat Güncelle
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedProducts(new Set())}
          >
            Seçimi Temizle
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={sortedProducts.length > 0 && selectedProducts.size === sortedProducts.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-primary-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                  />
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('code')}
                >
                  <span className="inline-flex items-center gap-1">
                    Kod
                    {getSortIcon('code')}
                  </span>
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('shortCode')}
                >
                  <span className="inline-flex items-center gap-1">
                    Kısa Kod
                    {getSortIcon('shortCode')}
                  </span>
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  <span className="inline-flex items-center gap-1">
                    Ürün Adı
                    {getSortIcon('name')}
                  </span>
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('brand')}
                >
                  <span className="inline-flex items-center gap-1">
                    Marka
                    {getSortIcon('brand')}
                  </span>
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('model')}
                >
                  <span className="inline-flex items-center gap-1">
                    Model
                    {getSortIcon('model')}
                  </span>
                </th>
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('category')}
                >
                  <span className="inline-flex items-center gap-1">
                    Kategori
                    {getSortIcon('category')}
                  </span>
                </th>
                <th
                  className="text-right uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('listPrice')}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Liste Fiyatı
                    {getSortIcon('listPrice')}
                  </span>
                </th>
                {canViewCosts && (
                  <th
                    className="text-right uppercase tracking-wider text-xs cursor-pointer select-none"
                    onClick={() => handleSort('costPrice')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Maliyet
                      {getSortIcon('costPrice')}
                    </span>
                  </th>
                )}
                <th
                  className="uppercase tracking-wider text-xs cursor-pointer select-none"
                  onClick={() => handleSort('isActive')}
                >
                  <span className="inline-flex items-center gap-1">
                    Durum
                    {getSortIcon('isActive')}
                  </span>
                </th>
                {(canEditProducts || canDelete) && (
                  <th className="w-24 uppercase tracking-wider text-xs">İşlemler</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={totalColumns} className="text-center py-8 text-primary-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={totalColumns} className="text-center py-8 text-primary-500">
                    Ürün bulunamadı
                  </td>
                </tr>
              ) : (
                sortedProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 rounded border-primary-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                      />
                    </td>
                    <td className="font-medium font-mono text-sm">{product.code}</td>
                    <td className="font-mono text-sm text-primary-600">{product.shortCode || '-'}</td>
                    <td>
                      <p className="font-medium">{product.name}</p>
                    </td>
                    <td>{product.brand?.name || '-'}</td>
                    <td className="text-sm text-primary-600">{product.model || '-'}</td>
                    <td>{product.category?.name || '-'}</td>
                    <td className="text-right tabular-nums">
                      {formatPrice(product.listPrice, product.currency)}
                    </td>
                    {canViewCosts && (
                      <td className="text-right tabular-nums">
                        {formatPrice(product.costPrice, product.currency)}
                      </td>
                    )}
                    <td>
                      <Badge variant={product.isActive ? 'success' : 'default'}>
                        {product.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    {(canEditProducts || canDelete) && (
                      <td>
                        <div className="flex items-center gap-1">
                          {canEditProducts && (
                            <button
                              onClick={() => handleEdit(product)}
                              className="p-1.5 rounded hover:bg-primary-100 text-primary-600 cursor-pointer"
                              title="Düzenle"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeletingProduct(product)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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
              Toplam {pagination.total} ürün
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => fetchProducts(pagination.page - 1)}
              >
                Önceki
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchProducts(pagination.page + 1)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Form Modal */}
      {canEditProducts && (
        <ProductForm
          isOpen={isFormOpen}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
          initialData={editingProduct}
          canViewCosts={canViewCosts}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingProduct}
        onClose={() => {
          setDeletingProduct(null);
          setDeleteError('');
        }}
        title="Ürünü Sil"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeletingProduct(null);
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
            <strong>{deletingProduct?.name}</strong> ürününü silmek istediğinize emin misiniz?
            Bu işlem geri alınamaz.
          </p>
        )}
      </Modal>

      {/* Product Import Modal */}
      {canEditProducts && (
        <ProductImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => {
            setIsImportModalOpen(false);
            fetchProducts();
          }}
        />
      )}

      {/* Brand Coefficient Modal */}
      {canViewCosts && (
        <Modal
          isOpen={isCoefficientModalOpen}
          onClose={() => setIsCoefficientModalOpen(false)}
          title="Marka Katsayı Yönetimi"
          size="lg"
        >
          <BrandCoefficientTable canEdit={canEditProducts} />
        </Modal>
      )}

      {/* Bulk Price Update Modal */}
      {isBulkPriceModalOpen && selectedProductsForBulk.length > 0 && (
        <BulkPriceUpdateModal
          products={selectedProductsForBulk}
          onClose={() => setIsBulkPriceModalOpen(false)}
          onSuccess={() => {
            setIsBulkPriceModalOpen(false);
            setSelectedProducts(new Set());
            fetchProducts();
          }}
        />
      )}
    </div>
  );
}
