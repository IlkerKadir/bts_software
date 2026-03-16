'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { QuoteItemData } from './QuoteItemRow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BrandProfitSummaryProps {
  items: QuoteItemData[];
  discountPct: number;
  currency: string;
  canViewCosts: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(value: number, currency: string): string {
  return (
    new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) +
    ' ' +
    currency
  );
}

function formatPct(value: number): string {
  return `%${value.toFixed(1)}`;
}

interface BrandSummary {
  brand: string;
  itemCount: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
  totalListPrice: number;
  discountFromList: number;
}

// ---------------------------------------------------------------------------
// BrandProfitSummary
// ---------------------------------------------------------------------------

export function BrandProfitSummary({
  items,
  discountPct,
  currency,
  canViewCosts,
}: BrandProfitSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const { brands, totals } = useMemo(() => {
    const grouped: Record<string, { revenue: number; cost: number; listPrice: number; count: number }> = {};

    for (const item of items) {
      if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL') continue;
      if (item.parentItemId) continue;

      const brandKey = item.brand || 'Diğer';
      if (!grouped[brandKey]) {
        grouped[brandKey] = { revenue: 0, cost: 0, listPrice: 0, count: 0 };
      }

      const qty = Number(item.quantity) || 0;
      const up = Number(item.unitPrice) || 0;
      const lp = Number(item.listPrice) || 0;
      const disc = Number(item.discountPct) || 0;
      const itemRevenue = qty * up * (1 - disc / 100);

      grouped[brandKey].revenue += itemRevenue;
      grouped[brandKey].listPrice += lp * qty;
      grouped[brandKey].count += 1;

      if (item.costPrice != null) {
        grouped[brandKey].cost += Number(item.costPrice) * qty;
      }
    }

    // Apply overall discount
    const discountMult = 1 - discountPct / 100;

    const brandList: BrandSummary[] = Object.entries(grouped)
      .map(([brand, data]) => {
        const revenue = data.revenue * discountMult;
        const cost = data.cost;
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const totalListPrice = data.listPrice;
        const discountFromList = totalListPrice > 0
          ? ((totalListPrice - revenue) / totalListPrice) * 100
          : 0;
        return {
          brand,
          itemCount: data.count,
          totalRevenue: revenue,
          totalCost: cost,
          profit,
          margin,
          totalListPrice,
          discountFromList,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totalRevenue = brandList.reduce((s, b) => s + b.totalRevenue, 0);
    const totalCost = brandList.reduce((s, b) => s + b.totalCost, 0);
    const totalProfit = totalRevenue - totalCost;
    const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalItems = brandList.reduce((s, b) => s + b.itemCount, 0);
    const totalListPrice = brandList.reduce((s, b) => s + b.totalListPrice, 0);
    const totalDiscountFromList = totalListPrice > 0
      ? ((totalListPrice - totalRevenue) / totalListPrice) * 100
      : 0;

    return {
      brands: brandList,
      totals: {
        itemCount: totalItems,
        totalRevenue,
        totalCost,
        profit: totalProfit,
        margin: totalMargin,
        totalListPrice,
        discountFromList: totalDiscountFromList,
      },
    };
  }, [items, discountPct]);

  if (brands.length === 0) return null;

  // Find max value for bar scaling (margin for managers, discount for sales reps)
  const maxBarValue = canViewCosts
    ? Math.max(...brands.map((b) => Math.abs(b.margin)), 1)
    : Math.max(...brands.map((b) => Math.abs(b.discountFromList)), 1);

  // Color helpers for sales rep discount bars
  const discountColor = (pct: number) =>
    pct > 25 ? 'text-red-600' : pct > 15 ? 'text-amber-600' : 'text-blue-700';
  const discountBadge = (pct: number) =>
    pct > 25
      ? 'bg-red-100 text-red-700'
      : pct > 15
        ? 'bg-amber-100 text-amber-700'
        : 'bg-blue-100 text-blue-700';
  const discountBar = (pct: number) =>
    pct > 25 ? 'bg-red-500' : pct > 15 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="rounded-lg border border-accent-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-accent-50 hover:bg-accent-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-accent-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-accent-500" />
          )}
          <span className="text-sm font-semibold text-accent-800">
            {canViewCosts ? 'Marka Kar Özeti' : 'Marka Satış Özeti'}
          </span>
          <span className="text-xs text-accent-500">
            ({brands.length} marka, {totals.itemCount} kalem)
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {canViewCosts ? (
            <>
              <span className="text-accent-600">
                Toplam Kar:{' '}
                <span
                  className={cn(
                    'font-semibold',
                    totals.profit < 0 ? 'text-red-600' : 'text-green-700'
                  )}
                >
                  {formatPrice(totals.profit, currency)}
                </span>
              </span>
              <span
                className={cn(
                  'font-semibold px-2 py-0.5 rounded',
                  totals.margin < 15
                    ? 'bg-red-100 text-red-700'
                    : totals.margin < 30
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                )}
              >
                {formatPct(totals.margin)}
              </span>
            </>
          ) : (
            <>
              <span className="text-accent-600">
                Liste&apos;den İndirim:{' '}
                <span className="font-semibold text-blue-700">
                  {formatPrice(totals.totalListPrice - totals.totalRevenue, currency)}
                </span>
              </span>
              <span
                className={cn(
                  'font-semibold px-2 py-0.5 rounded',
                  discountBadge(totals.discountFromList)
                )}
              >
                {formatPct(totals.discountFromList)}
              </span>
            </>
          )}
        </div>
      </button>

      {/* Body */}
      {isExpanded && (
        <div className="px-4 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-accent-500 uppercase tracking-wider border-b border-accent-200">
                <th className="pb-2 text-left font-medium">Marka</th>
                <th className="pb-2 text-right font-medium">Kalem</th>
                {canViewCosts ? (
                  <>
                    <th className="pb-2 text-right font-medium">Toplam Satış</th>
                    <th className="pb-2 text-right font-medium">Toplam Maliyet</th>
                    <th className="pb-2 text-right font-medium">Kar</th>
                    <th className="pb-2 text-right font-medium">Kar %</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 text-right font-medium">Liste Fiyat Top.</th>
                    <th className="pb-2 text-right font-medium">Satış Toplamı</th>
                    <th className="pb-2 text-right font-medium">İndirim</th>
                    <th className="pb-2 text-right font-medium">İndirim %</th>
                  </>
                )}
                <th className="pb-2 pl-3 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent-100">
              {brands.map((b) => {
                const barValue = canViewCosts ? b.margin : b.discountFromList;
                return (
                  <tr key={b.brand} className="hover:bg-accent-50 transition-colors">
                    <td className="py-1.5 font-medium text-accent-800">{b.brand}</td>
                    <td className="py-1.5 text-right tabular-nums text-accent-600">
                      {b.itemCount}
                    </td>
                    {canViewCosts ? (
                      <>
                        <td className="py-1.5 text-right tabular-nums text-accent-700">
                          {formatPrice(b.totalRevenue, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-accent-600">
                          {formatPrice(b.totalCost, currency)}
                        </td>
                        <td
                          className={cn(
                            'py-1.5 text-right tabular-nums font-medium',
                            b.profit < 0 ? 'text-red-600' : 'text-green-700'
                          )}
                        >
                          {formatPrice(b.profit, currency)}
                        </td>
                        <td
                          className={cn(
                            'py-1.5 text-right tabular-nums font-medium',
                            b.margin < 15
                              ? 'text-red-600'
                              : b.margin < 30
                                ? 'text-amber-600'
                                : 'text-green-700'
                          )}
                        >
                          {formatPct(b.margin)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 text-right tabular-nums text-accent-700">
                          {formatPrice(b.totalListPrice, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-accent-700">
                          {formatPrice(b.totalRevenue, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-blue-700">
                          {formatPrice(b.totalListPrice - b.totalRevenue, currency)}
                        </td>
                        <td className={cn('py-1.5 text-right tabular-nums font-medium', discountColor(b.discountFromList))}>
                          {formatPct(b.discountFromList)}
                        </td>
                      </>
                    )}
                    <td className="py-1.5 pl-3">
                      <div className="w-full bg-accent-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            canViewCosts
                              ? (b.margin < 15 ? 'bg-red-500' : b.margin < 30 ? 'bg-amber-500' : 'bg-green-500')
                              : discountBar(b.discountFromList)
                          )}
                          style={{
                            width: `${Math.min(Math.max((Math.abs(barValue) / maxBarValue) * 100, 0), 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-accent-300 font-semibold">
                <td className="py-2 text-accent-900">TOPLAM</td>
                <td className="py-2 text-right tabular-nums text-accent-700">
                  {totals.itemCount}
                </td>
                {canViewCosts ? (
                  <>
                    <td className="py-2 text-right tabular-nums text-accent-900">
                      {formatPrice(totals.totalRevenue, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-accent-700">
                      {formatPrice(totals.totalCost, currency)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        totals.profit < 0 ? 'text-red-600' : 'text-green-700'
                      )}
                    >
                      {formatPrice(totals.profit, currency)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        totals.margin < 15
                          ? 'text-red-600'
                          : totals.margin < 30
                            ? 'text-amber-600'
                            : 'text-green-700'
                      )}
                    >
                      {formatPct(totals.margin)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 text-right tabular-nums text-accent-900">
                      {formatPrice(totals.totalListPrice, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-accent-900">
                      {formatPrice(totals.totalRevenue, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-blue-700">
                      {formatPrice(totals.totalListPrice - totals.totalRevenue, currency)}
                    </td>
                    <td className={cn('py-2 text-right tabular-nums', discountColor(totals.discountFromList))}>
                      {formatPct(totals.discountFromList)}
                    </td>
                  </>
                )}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
