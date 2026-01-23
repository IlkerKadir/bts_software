'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Button, Select, Card, Badge, Modal } from '@/components/ui';
import { ProductForm } from './ProductForm';

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
  isActive: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ProductListProps {
  canViewCosts: boolean;
  canEditProducts: boolean;
  canDelete: boolean;
}

export function ProductList({ canViewCosts, canEditProducts, canDelete }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const fetchProducts = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (brandFilter) params.set('brandId', brandFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      params.set('page', page.toString());

      const response = await fetch(`/api/products?${params}`);
      const data = await response.json();

      if (response.ok) {
        setProducts(data.products);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [search, brandFilter, categoryFilter]);

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
    const debounce = setTimeout(() => {
      fetchProducts();
    }, 300);

    return () => clearTimeout(debounce);
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
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(price);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Ürünler</h1>
          <p className="text-primary-500">Ürün kataloğunu yönetin</p>
        </div>
        {canEditProducts && (
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Ürün
          </Button>
        )}
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

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ürün Adı</th>
                <th>Marka</th>
                <th>Kategori</th>
                <th className="text-right">Liste Fiyatı</th>
                {canViewCosts && <th className="text-right">Maliyet</th>}
                <th>Durum</th>
                {(canEditProducts || canDelete) && <th className="w-24">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={canViewCosts ? 8 : 7} className="text-center py-8 text-primary-500">
                    Yükleniyor...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={canViewCosts ? 8 : 7} className="text-center py-8 text-primary-500">
                    Ürün bulunamadı
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td className="font-medium font-mono text-sm">{product.code}</td>
                    <td>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.model && (
                          <p className="text-xs text-primary-500">{product.model}</p>
                        )}
                      </div>
                    </td>
                    <td>{product.brand?.name || '-'}</td>
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
    </div>
  );
}
