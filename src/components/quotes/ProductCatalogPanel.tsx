'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Package } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ProductSearchCard, type ProductForQuote } from './ProductSearchCard';

// ── Types ────────────────────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
  brandDiscount?: { coefficient: number } | null;
}

interface Category {
  id: string;
  name: string;
}

interface PriceHistoryEntry {
  unitPrice: number;
  katsayi: number;
  currency: string;
  quotedAt: string;
}

export interface ProductCatalogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  companyId?: string | null;
  quoteLanguage: string;
  onAddProduct: (product: ProductForQuote) => void;
  title?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProductCatalogPanel({
  isOpen,
  onClose,
  companyId,
  quoteLanguage,
  onAddProduct,
  title,
}: ProductCatalogPanelProps) {
  // Search & filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  // Data state
  const [products, setProducts] = useState<ProductForQuote[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryEntry>>({});

  // Loading state
  const [isSearching, setIsSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Debounce search term ─────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Fetch brands & categories on mount ───────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const fetchFilters = async () => {
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          fetch('/api/products/brands'),
          fetch('/api/products/categories'),
        ]);

        if (brandsRes.ok) {
          const data = await brandsRes.json();
          setBrands(data.brands || []);
        }

        if (categoriesRes.ok) {
          const data = await categoriesRes.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('Failed to fetch filters:', error);
      }
    };

    fetchFilters();
  }, [isOpen]);

  // ── Focus search input when panel opens ──────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      // Small delay to allow transition to complete
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ── Escape key handler ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── Search products ──────────────────────────────────────────────────────

  const searchProducts = useCallback(async () => {
    if (debouncedTerm.length < 2 && !selectedBrandId && !selectedCategoryId) {
      setProducts([]);
      setTotalCount(0);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);

    try {
      const params = new URLSearchParams();
      if (debouncedTerm) params.set('q', debouncedTerm);
      if (selectedBrandId) params.set('brandId', selectedBrandId);
      if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
      params.set('limit', '50');

      const response = await fetch(`/api/products/search?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) return;

      const data = await response.json();
      const rawProducts = data.products || [];

      // Map to ProductForQuote with brand coefficient
      const mapped: ProductForQuote[] = rawProducts.map((p: any) => {
        const brand = brands.find((b) => b.id === p.brandId);
        const coefficient = brand?.brandDiscount?.coefficient
          ? Number(brand.brandDiscount.coefficient)
          : 1.0;

        return {
          id: p.id,
          code: p.code,
          shortCode: p.shortCode,
          name: p.name,
          nameTr: p.nameTr,
          nameEn: p.nameEn,
          brandId: p.brandId,
          brandName: p.brand?.name || null,
          model: p.model,
          listPrice: Number(p.listPrice),
          costPrice: p.costPrice != null ? Number(p.costPrice) : null,
          currency: p.currency,
          unit: p.unit,
          pricingType: p.pricingType,
          defaultKatsayi: coefficient,
          minKatsayi: p.minKatsayi != null ? Number(p.minKatsayi) : null,
          maxKatsayi: p.maxKatsayi != null ? Number(p.maxKatsayi) : null,
        };
      });

      setProducts(mapped);
      setTotalCount(mapped.length);

      // Fetch price history if companyId is set
      if (companyId && mapped.length > 0) {
        fetchPriceHistory(mapped.map((p) => p.id));
      } else {
        setPriceHistory({});
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Product search error:', error);
      }
    } finally {
      setIsSearching(false);
    }
  }, [debouncedTerm, selectedBrandId, selectedCategoryId, brands, companyId]);

  useEffect(() => {
    searchProducts();
  }, [searchProducts]);

  // ── Fetch price history for products ─────────────────────────────────────

  const fetchPriceHistory = async (productIds: string[]) => {
    if (!companyId || productIds.length === 0) return;

    try {
      const params = new URLSearchParams({
        companyId,
        productIds: productIds.join(','),
      });

      const response = await fetch(`/api/products/price-history/by-company?${params.toString()}`);
      if (!response.ok) return;

      const data = await response.json();
      const history: Record<string, PriceHistoryEntry> = {};

      if (data.priceHistory) {
        for (const [productId, entry] of Object.entries(data.priceHistory)) {
          const e = entry as any;
          history[productId] = {
            unitPrice: Number(e.unitPrice),
            katsayi: Number(e.katsayi),
            currency: e.currency,
            quotedAt: e.quotedAt,
          };
        }
      }

      setPriceHistory(history);
    } catch (error) {
      console.error('Failed to fetch price history:', error);
    }
  };

  // ── Reset state when panel closes ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow close animation to finish
      const timer = setTimeout(() => {
        setSearchTerm('');
        setDebouncedTerm('');
        setSelectedBrandId('');
        setSelectedCategoryId('');
        setProducts([]);
        setPriceHistory({});
        setTotalCount(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-[40vw] min-w-[400px] max-w-[720px]',
          'bg-white shadow-2xl z-50 flex flex-col',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Ürün Kataloğu"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-primary-200">
          {/* Title bar */}
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-lg font-semibold text-primary-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-primary-600" />
              {title || 'Ürün Kataloğu'}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Search input */}
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ürün kodu, adı veya marka ile ara..."
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm text-primary-900',
                  'placeholder:text-primary-400',
                  'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                  'transition-shadow duration-200'
                )}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
                  aria-label="Aramayı temizle"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter row */}
          <div className="flex gap-3 px-5 pb-4">
            <div className="flex-1">
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white appearance-none cursor-pointer',
                  'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                  'transition-shadow duration-200'
                )}
              >
                <option value="">Tüm Markalar</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white appearance-none cursor-pointer',
                  'border-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
                  'transition-shadow duration-200'
                )}
              >
                <option value="">Tüm Kategoriler</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Results Section ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-primary-500">Ürünler aranıyor...</p>
            </div>
          )}

          {/* Empty state - no search yet */}
          {!isSearching && products.length === 0 && !debouncedTerm && !selectedBrandId && !selectedCategoryId && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-primary-400">
              <Search className="w-10 h-10 opacity-40" />
              <p className="text-sm">Aramaya başlamak için en az 2 karakter girin</p>
            </div>
          )}

          {/* Empty state - no results */}
          {!isSearching && products.length === 0 && (debouncedTerm || selectedBrandId || selectedCategoryId) && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-primary-400">
              <Package className="w-10 h-10 opacity-40" />
              <p className="text-sm font-medium text-primary-600">Ürün bulunamadı</p>
              <p className="text-xs text-primary-400">
                Arama terimini veya filtreleri değiştirmeyi deneyin
              </p>
            </div>
          )}

          {/* Results list */}
          {!isSearching && products.length > 0 && (
            <>
              {/* Count header */}
              <div className="px-5 py-2 bg-accent-50 border-b border-primary-200">
                <p className="text-xs font-medium text-accent-600">
                  {totalCount} ürün bulundu
                </p>
              </div>

              {/* Product cards */}
              <div>
                {products.map((product) => (
                  <ProductSearchCard
                    key={product.id}
                    product={product}
                    quoteLanguage={quoteLanguage}
                    lastPrice={priceHistory[product.id] || null}
                    onAdd={() => onAddProduct(product)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
