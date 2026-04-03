'use client';

import { useState } from 'react';
import { Clock, Package, Plus } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ProductForQuote {
  id: string;
  code: string;
  shortCode?: string | null;
  name: string;
  nameTr?: string | null;
  nameEn?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  model?: string | null;
  listPrice: number;
  costPrice?: number | null;
  currency: string;
  unit: string;
  pricingType: 'LIST_PRICE' | 'PROJECT_BASED';
  defaultKatsayi: number;
  minKatsayi?: number | null;
  maxKatsayi?: number | null;
}

export interface ProductSearchCardProps {
  product: ProductForQuote;
  quoteLanguage: string;
  lastPrice?: {
    unitPrice: number;
    katsayi: number;
    currency: string;
    quotedAt: string;
  } | null;
  onAdd: (quantity?: number) => void;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function ProductSearchCard({
  product,
  quoteLanguage,
  lastPrice,
  onAdd,
}: ProductSearchCardProps) {
  const displayName =
    quoteLanguage === 'EN'
      ? product.nameEn || product.nameTr || product.name
      : product.nameTr || product.name;

  const isProjectBased = product.pricingType === 'PROJECT_BASED';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-primary-200',
        'hover:bg-accent-50 transition-colors duration-150 group'
      )}
    >
      {/* Product info - left side */}
      <div className="flex-1 min-w-0">
        {/* First row: code + brand + project badge */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <code className="text-xs font-mono text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">
            {product.code}
          </code>
          {product.brandName && (
            <Badge variant="info" className="text-[10px] px-1.5 py-0">
              {product.brandName}
            </Badge>
          )}
          {isProjectBased && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              Proje Bazlı
            </Badge>
          )}
        </div>

        {/* Second row: product name */}
        <p className="text-sm font-medium text-primary-900 truncate">
          {displayName}
        </p>

        {/* Third row: model if available */}
        {product.model && (
          <p className="text-xs text-primary-400 truncate">
            {product.model}
          </p>
        )}

        {/* Fourth row: last price if available */}
        {lastPrice && (
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-accent-400" />
            <span className="text-xs text-accent-600">
              Son fiyat: {formatCurrency(lastPrice.unitPrice, lastPrice.currency)} ({formatDate(lastPrice.quotedAt)})
            </span>
          </div>
        )}
      </div>

      {/* Price + Quantity + Add button - right side */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold text-primary-900 tabular-nums">
            {formatCurrency(product.listPrice, product.currency)}
          </p>
          <p className="text-[10px] text-primary-400">
            {product.currency}
          </p>
        </div>

        <input
          type="number"
          min="1"
          placeholder="1"
          className="w-14 px-1.5 py-1 text-sm text-center border border-primary-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
          title="Adet"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseInt((e.target as HTMLInputElement).value) || undefined;
              onAdd(val);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          ref={(el) => { if (el) el.dataset.qtyInput = 'true'; }}
        />

        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLInputElement>('input[data-qty-input]');
            const qty = input ? parseInt(input.value) || undefined : undefined;
            onAdd(qty);
          }}
          className="opacity-70 group-hover:opacity-100 transition-opacity"
          title="Teklife ekle"
        >
          <Plus className="w-4 h-4" />
          Ekle
        </Button>
      </div>
    </div>
  );
}
