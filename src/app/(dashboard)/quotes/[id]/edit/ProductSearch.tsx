'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Package, Tag, Loader2 } from 'lucide-react';

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
  name: string;
  nameTr?: string | null;
  model?: string | null;
  brand: Brand | null;
  category: Category | null;
  listPrice: number;
  costPrice?: number | null;
  unit: string;
  vatRate: number;
}

interface ProductSearchProps {
  onSelect: (product: Product) => void;
}

export function ProductSearch({ onSelect }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search products
  useEffect(() => {
    if (query.length < 2) {
      setProducts([]);
      return;
    }

    const searchProducts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();

        if (response.ok) {
          setProducts(data.products);
          setSelectedIndex(-1);
        }
      } catch (err) {
        console.error('Error searching products:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (products.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, products.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && products[selectedIndex]) {
          onSelect(products[selectedIndex]);
        }
        break;
      case 'Escape':
        setQuery('');
        setProducts([]);
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const formatPrice = (price: number | string | null | undefined) => {
    const numPrice = typeof price === 'number' ? price : (typeof price === 'string' ? parseFloat(price) || 0 : 0);
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(numPrice);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ürün kodu, adı veya marka ile ara..."
          className="w-full pl-10 pr-10 py-3 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400 animate-spin" />
        )}
      </div>

      {/* Help Text */}
      {query.length < 2 && (
        <p className="text-sm text-primary-500">
          En az 2 karakter girerek arama yapabilirsiniz. Ürün kodu, adı, kısa kod veya marka ile arama yapabilirsiniz.
        </p>
      )}

      {/* Results */}
      {query.length >= 2 && (
        <div ref={listRef} className="max-h-96 overflow-y-auto border border-primary-200 rounded-lg divide-y divide-primary-100">
          {products.length === 0 && !isLoading ? (
            <div className="p-8 text-center text-primary-500">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Ürün bulunamadı</p>
              <p className="text-xs mt-1">Farklı bir arama terimi deneyin</p>
            </div>
          ) : (
            products.map((product, index) => (
              <button
                key={product.id}
                onClick={() => onSelect(product)}
                className={`w-full text-left p-3 hover:bg-primary-50 transition-colors cursor-pointer ${
                  index === selectedIndex ? 'bg-accent-50 border-l-2 border-accent-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium text-accent-700">
                        {product.code}
                      </span>
                      {product.shortCode && (
                        <span className="text-xs text-primary-500 bg-primary-100 px-1.5 py-0.5 rounded">
                          {product.shortCode}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-primary-900 truncate">
                      {product.nameTr || product.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-primary-500">
                      {product.brand && (
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {product.brand.name}
                        </span>
                      )}
                      {product.model && (
                        <span>Model: {product.model}</span>
                      )}
                      {product.category && (
                        <span>{product.category.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-primary-900 tabular-nums">
                      {formatPrice(product.listPrice)}
                    </p>
                    <p className="text-xs text-primary-500">
                      {product.unit} • KDV %{product.vatRate}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Keyboard hints */}
      {products.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-primary-400">
          <span>
            <kbd className="px-1.5 py-0.5 bg-primary-100 rounded">↑</kbd>{' '}
            <kbd className="px-1.5 py-0.5 bg-primary-100 rounded">↓</kbd> ile gezin
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-primary-100 rounded">Enter</kbd> ile seçin
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-primary-100 rounded">Esc</kbd> ile temizleyin
          </span>
        </div>
      )}
    </div>
  );
}
