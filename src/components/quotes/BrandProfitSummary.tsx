'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { QuoteItemData } from './QuoteItemRow';
import { getEffectiveCostPrice } from '@/lib/ek-maliyet';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BrandProfitSummaryProps {
  items: QuoteItemData[];
  currency: string;
  /** Quote.exchangeRate (protected TRY rate). Used together with
   *  `protectionPct` to recover the non-protected base rate so TRY
   *  SETs in a non-TRY quote contribute their quote-currency
   *  equivalent to the brand totals instead of their face TRY value. */
  exchangeRate?: number;
  protectionPct?: number;
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

// ---------------------------------------------------------------------------
// Subtotal section detection
// ---------------------------------------------------------------------------

interface SubtotalSection {
  label: string;
  startIndex: number;
  endIndex: number; // exclusive — the SUBTOTAL item itself
}

/**
 * Walk through items in order and identify sections delimited by SUBTOTAL rows.
 * Items with parentItemId are excluded from section computation (they belong
 * to their parent's section).
 */
function getSubtotalSections(items: QuoteItemData[]): SubtotalSection[] {
  const sections: SubtotalSection[] = [];
  let sectionStart = 0;
  let sectionNumber = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.parentItemId) continue; // sub-items belong to their parent
    if (item.itemType === 'SUBTOTAL') {
      sectionNumber++;
      const customDesc = item.description && item.description !== 'Ara Toplam'
        ? item.description
        : null;
      sections.push({
        label: customDesc || `Ara Toplam ${sectionNumber}`,
        startIndex: sectionStart,
        endIndex: i, // exclusive — the SUBTOTAL row itself is excluded
      });
      sectionStart = i + 1;
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Manager mode: cost-based brand summary
// ---------------------------------------------------------------------------

interface BrandCostSummary {
  brand: string;
  itemCount: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
}

// ---------------------------------------------------------------------------
// Sales mode: katsayi-based brand summary
// ---------------------------------------------------------------------------

interface BrandKatsayiSummary {
  brand: string;
  itemCount: number;
  totalRevenue: number;
  /** Revenue-weighted average katsayi */
  avgKatsayi: number;
  /** (avgKatsayi - 1) * 100 — positive = markup, negative = discount */
  markupPct: number;
  /** All items in this brand have listPrice=0 AND katsayi=1 (manual) */
}

// ---------------------------------------------------------------------------
// BrandProfitSummary
// ---------------------------------------------------------------------------

export function BrandProfitSummary({
  items,
  currency,
  exchangeRate = 1,
  protectionPct = 0,
  canViewCosts,
}: BrandProfitSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedSection, setSelectedSection] = useState<string>('all');

  // ---- Detect subtotal sections ----
  const sections = useMemo(() => getSubtotalSections(items), [items]);
  const hasSubtotals = sections.length > 0;

  // ---- Filter items based on selected section ----
  const filteredItems = useMemo(() => {
    if (selectedSection === 'all' || !hasSubtotals) return items;
    const sectionIdx = parseInt(selectedSection, 10);
    const section = sections[sectionIdx];
    if (!section) return items;
    return items.slice(section.startIndex, section.endIndex);
  }, [items, selectedSection, sections, hasSubtotals]);

  // ---- Currency conversion helpers ----
  // Brand totals are displayed in the quote's currency, so every
  // TRY-priced SET (and its TRY-priced children's costs) must be
  // converted to quote currency using the base, non-protected rate.
  // Matches the server-side calculateQuoteProfitSummary ctx and the
  // QuoteItemsTable summary so the three views always agree.
  const baseForeignRate = useMemo(() => {
    if (currency === 'TRY') return 1;
    const r = Number(exchangeRate) || 1;
    const p = Number(protectionPct) || 0;
    return p > 0 ? r / (1 + p / 100) : r;
  }, [currency, exchangeRate, protectionPct]);

  // Pre-index top-level SETs that carry a currency override so
  // children can look up their effective currency in O(1). Built
  // from the full items array (not filteredItems) so a child whose
  // parent SET sits outside the selected section still resolves.
  const setCurrencyByParentId = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      if (it.itemType === 'SET' && !it.parentItemId && it.currency) {
        m.set(it.id, it.currency);
      }
    }
    return m;
  }, [items]);

  const convertRowToQuoteCurrency = (item: QuoteItemData, amount: number): number => {
    const effCur = item.currency
      || (item.parentItemId ? setCurrencyByParentId.get(item.parentItemId) : undefined)
      || currency;
    if (effCur === 'TRY' && currency !== 'TRY' && baseForeignRate > 0) {
      return amount / baseForeignRate;
    }
    return amount;
  };

  // Map every priced top-level item-id → its section's discount %.
  // Walks the full `items` array (not `filteredItems`) because section
  // boundaries are defined by SUBTOTAL rows in the global order, not
  // by the brand/category filter. Items sitting below the last
  // SUBTOTAL (trailing orphans) fall into a pct=0 bucket.
  const itemIdToSectionDiscountPct = useMemo(() => {
    const map = new Map<string, number>();
    const pending: string[] = [];
    for (const it of items) {
      if (it.itemType === 'SUBTOTAL') {
        const pct = Number(it.sectionDiscountPct ?? 0);
        for (const id of pending) map.set(id, pct);
        pending.length = 0;
        continue;
      }
      pending.push(it.id);
    }
    for (const id of pending) map.set(id, 0);
    return map;
  }, [items]);

  // ---- Manager mode computation (cost-based) ----
  const managerData = useMemo(() => {
    if (canViewCosts) {
      const grouped: Record<string, { revenue: number; cost: number; count: number }> = {};

      for (const item of filteredItems) {
        if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
        if (item.priceLabel) continue;

        // Top-level priced rows contribute revenue; children never do
        // (SET parent's totalPrice already includes them). Costs
        // contribute from EVERY priced row except the SET parent
        // itself — children of a TRY-priced SET hold TRY costs, and
        // we need them converted to quote currency here.
        const isTopLevelPriced = !item.parentItemId
          && (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET');
        const isSetParent = item.itemType === 'SET' && !item.parentItemId;

        const brandKey = item.brand || 'Diger';
        if (!grouped[brandKey]) {
          grouped[brandKey] = { revenue: 0, cost: 0, count: 0 };
        }

        if (isTopLevelPriced) {
          const qty = Number(item.quantity) || 0;
          const up = Number(item.unitPrice) || 0;
          const disc = Number(item.discountPct) || 0;
          const sectionPct = itemIdToSectionDiscountPct.get(item.id) ?? 0;
          const itemRevenue = qty * up * (1 - disc / 100) * (1 - sectionPct / 100);
          grouped[brandKey].revenue += convertRowToQuoteCurrency(item, itemRevenue);
          grouped[brandKey].count += 1;
        }

        if (!isSetParent) {
          const qty = Number(item.quantity) || 0;
          const effectiveCost = getEffectiveCostPrice(item);
          if (effectiveCost != null) {
            grouped[brandKey].cost += convertRowToQuoteCurrency(item, effectiveCost * qty);
          }
        }
      }

      const brandList: BrandCostSummary[] = Object.entries(grouped)
        .map(([brand, data]) => {
          const revenue = data.revenue;
          const cost = data.cost;
          const profit = revenue - cost;
          const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
          return { brand, itemCount: data.count, totalRevenue: revenue, totalCost: cost, profit, margin };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      const totalRevenue = brandList.reduce((s, b) => s + b.totalRevenue, 0);
      const totalCost = brandList.reduce((s, b) => s + b.totalCost, 0);
      const totalProfit = totalRevenue - totalCost;
      const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      const totalItems = brandList.reduce((s, b) => s + b.itemCount, 0);

      return {
        brands: brandList,
        totals: { itemCount: totalItems, totalRevenue, totalCost, profit: totalProfit, margin: totalMargin },
      };
    }
    return null;
  }, [filteredItems, canViewCosts, itemIdToSectionDiscountPct, baseForeignRate, currency, setCurrencyByParentId]);

  // ---- Sales mode computation (katsayi-based) ----
  const salesData = useMemo(() => {
    if (!canViewCosts) {
      const grouped: Record<
        string,
        { totalRevenue: number; katsayiWeightedSum: number; revenueWeightSum: number; count: number }
      > = {};

      for (const item of filteredItems) {
        if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
        if (item.priceLabel) continue;
        if (item.parentItemId) continue;

        const brandKey = item.brand || 'Diger';
        if (!grouped[brandKey]) {
          grouped[brandKey] = { totalRevenue: 0, katsayiWeightedSum: 0, revenueWeightSum: 0, count: 0 };
        }

        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        const k = Number(item.katsayi) || 1;
        const sectionPct = itemIdToSectionDiscountPct.get(item.id) ?? 0;
        const rawRevenue = qty * up * (1 - disc / 100) * (1 - sectionPct / 100);
        const itemRevenue = convertRowToQuoteCurrency(item, rawRevenue);

        grouped[brandKey].totalRevenue += itemRevenue;
        grouped[brandKey].count += 1;

        // Weight by (converted) revenue for average katsayi
        grouped[brandKey].katsayiWeightedSum += k * itemRevenue;
        grouped[brandKey].revenueWeightSum += itemRevenue;

      }

      const brandList: BrandKatsayiSummary[] = Object.entries(grouped)
        .map(([brand, data]) => {
          const totalRevenue = data.totalRevenue;
          const avgKatsayi =
            data.revenueWeightSum > 0 ? data.katsayiWeightedSum / data.revenueWeightSum : 1;
          const markupPct = (avgKatsayi - 1) * 100;
          return {
            brand,
            itemCount: data.count,
            totalRevenue,
            avgKatsayi,
            markupPct,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      const totalRevenue = brandList.reduce((s, b) => s + b.totalRevenue, 0);
      const totalItems = brandList.reduce((s, b) => s + b.itemCount, 0);

      // Compute overall weighted katsayi
      let totalWeightedK = 0;
      let totalWeightSum = 0;
      for (const item of filteredItems) {
        if (item.itemType === 'HEADER' || item.itemType === 'NOTE' || item.itemType === 'SUBTOTAL' || item.itemType === 'GRAND_TOTAL') continue;
        if (item.priceLabel) continue;
        if (item.parentItemId) continue;
        const qty = Number(item.quantity) || 0;
        const up = Number(item.unitPrice) || 0;
        const disc = Number(item.discountPct) || 0;
        const k = Number(item.katsayi) || 1;
        const sectionPct = itemIdToSectionDiscountPct.get(item.id) ?? 0;
        const rev = convertRowToQuoteCurrency(item, qty * up * (1 - disc / 100) * (1 - sectionPct / 100));
        totalWeightedK += k * rev;
        totalWeightSum += rev;
      }
      const overallAvgKatsayi = totalWeightSum > 0 ? totalWeightedK / totalWeightSum : 1;
      const overallMarkupPct = (overallAvgKatsayi - 1) * 100;

      return {
        brands: brandList,
        totals: {
          itemCount: totalItems,
          totalRevenue,
          avgKatsayi: overallAvgKatsayi,
          markupPct: overallMarkupPct,
        },
      };
    }
    return null;
  }, [filteredItems, canViewCosts, itemIdToSectionDiscountPct, baseForeignRate, currency, setCurrencyByParentId]);

  const totalItems = canViewCosts ? managerData?.totals.itemCount ?? 0 : salesData?.totals.itemCount ?? 0;
  const brandCount = canViewCosts ? managerData?.brands.length ?? 0 : salesData?.brands.length ?? 0;

  if (brandCount === 0) return null;

  // ---- Color helpers ----

  // Manager: margin-based colors
  const marginColor = (m: number) =>
    m < 15 ? 'text-red-600' : m < 30 ? 'text-amber-600' : 'text-green-700';
  const marginBadge = (m: number) =>
    m < 15 ? 'bg-red-100 text-red-700' : m < 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  const marginBar = (m: number) =>
    m < 15 ? 'bg-red-500' : m < 30 ? 'bg-amber-500' : 'bg-green-500';

  // Sales: markup-based colors (positive = markup/green, negative = discount/red-amber)
  const markupColor = (pct: number) =>
    pct > 0 ? 'text-green-700' : pct < -15 ? 'text-red-600' : pct < 0 ? 'text-amber-600' : 'text-blue-700';
  const markupBadge = (pct: number) =>
    pct > 0 ? 'bg-green-100 text-green-700' : pct < -15 ? 'bg-red-100 text-red-700' : pct < 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
  const markupBar = (pct: number) =>
    pct > 0 ? 'bg-green-500' : pct < -15 ? 'bg-red-500' : pct < 0 ? 'bg-amber-500' : 'bg-blue-500';

  // Bar scaling
  const maxBarValue = canViewCosts
    ? Math.max(...(managerData?.brands.map((b) => Math.abs(b.margin)) ?? [1]), 1)
    : Math.max(...(salesData?.brands.map((b) => Math.abs(b.markupPct)) ?? [1]), 1);

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
            {canViewCosts ? 'Marka Kar Ozeti' : 'Marka Katsayi Ozeti'}
          </span>
          <span className="text-xs text-accent-500">
            ({brandCount} marka, {totalItems} kalem)
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {canViewCosts && managerData ? (
            <>
              <span className="text-accent-600">
                Toplam Kar:{' '}
                <span
                  className={cn(
                    'font-semibold',
                    managerData.totals.profit < 0 ? 'text-red-600' : 'text-green-700'
                  )}
                >
                  {formatPrice(managerData.totals.profit, currency)}
                </span>
              </span>
              <span
                className={cn(
                  'font-semibold px-2 py-0.5 rounded',
                  marginBadge(managerData.totals.margin)
                )}
              >
                {formatPct(managerData.totals.margin)}
              </span>
            </>
          ) : salesData ? (
            <>
              <span className="text-accent-600">
                Ort. Katsayi:{' '}
                <span className="font-semibold text-accent-800">
                  {salesData.totals.avgKatsayi.toFixed(4)}
                </span>
              </span>
              <span
                className={cn(
                  'font-semibold px-2 py-0.5 rounded',
                  markupBadge(salesData.totals.markupPct)
                )}
              >
                {salesData.totals.markupPct > 0 ? '+' : ''}{formatPct(salesData.totals.markupPct)}
              </span>
            </>
          ) : null}
        </div>
      </button>

      {/* Body */}
      {isExpanded && (
        <div className="px-4 py-3">
          {/* Subtotal section filter */}
          {hasSubtotals && (
            <div className="flex items-center gap-2 mb-3">
              <label htmlFor="section-filter" className="text-xs font-medium text-accent-600">
                Bolum:
              </label>
              <select
                id="section-filter"
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="text-xs border border-accent-200 rounded-md px-2 py-1 bg-white text-accent-800 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
              >
                <option value="all">Tumu</option>
                {sections.map((section, idx) => (
                  <option key={idx} value={String(idx)}>
                    {section.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-accent-500 uppercase tracking-wider border-b border-accent-200">
                <th className="pb-2 text-left font-medium">Marka</th>
                <th className="pb-2 text-right font-medium">Kalem</th>
                {canViewCosts ? (
                  <>
                    <th className="pb-2 text-right font-medium">Toplam Satis</th>
                    <th className="pb-2 text-right font-medium">Toplam Maliyet</th>
                    <th className="pb-2 text-right font-medium">Kar</th>
                    <th className="pb-2 text-right font-medium">Kar %</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 text-right font-medium">Satis Toplami</th>
                    <th className="pb-2 text-right font-medium">Ort. Katsayi</th>
                    <th className="pb-2 text-right font-medium">Liste Fiyatina Gore</th>
                  </>
                )}
                <th className="pb-2 pl-3 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent-100">
              {canViewCosts && managerData
                ? managerData.brands.map((b) => (
                    <tr key={b.brand} className="hover:bg-accent-50 transition-colors">
                      <td className="py-1.5 font-medium text-accent-800">{b.brand}</td>
                      <td className="py-1.5 text-right tabular-nums text-accent-600">
                        {b.itemCount}
                      </td>
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
                          marginColor(b.margin)
                        )}
                      >
                        {formatPct(b.margin)}
                      </td>
                      <td className="py-1.5 pl-3">
                        <div className="w-full bg-accent-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', marginBar(b.margin))}
                            style={{
                              width: `${Math.min(Math.max((Math.abs(b.margin) / maxBarValue) * 100, 0), 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                : salesData?.brands.map((b) => {
                    const label = b.markupPct > 0
                      ? `+${formatPct(b.markupPct)}`
                      : b.markupPct === 0
                        ? 'Liste Fiyati'
                        : formatPct(b.markupPct);
                    return (
                      <tr key={b.brand} className="hover:bg-accent-50 transition-colors">
                        <td className="py-1.5 font-medium text-accent-800">{b.brand}</td>
                        <td className="py-1.5 text-right tabular-nums text-accent-600">
                          {b.itemCount}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-accent-700">
                          {formatPrice(b.totalRevenue, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-accent-800">
                          {b.avgKatsayi.toFixed(4)}
                        </td>
                        <td
                          className={cn(
                            'py-1.5 text-right tabular-nums font-medium',
                            markupColor(b.markupPct)
                          )}
                        >
                          {label}
                        </td>
                        <td className="py-1.5 pl-3">
                          <div className="w-full bg-accent-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', markupBar(b.markupPct))}
                              style={{
                                width: `${Math.min(Math.max((Math.abs(b.markupPct) / maxBarValue) * 100, 0), 100)}%`,
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
                  {totalItems}
                </td>
                {canViewCosts && managerData ? (
                  <>
                    <td className="py-2 text-right tabular-nums text-accent-900">
                      {formatPrice(managerData.totals.totalRevenue, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-accent-700">
                      {formatPrice(managerData.totals.totalCost, currency)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        managerData.totals.profit < 0 ? 'text-red-600' : 'text-green-700'
                      )}
                    >
                      {formatPrice(managerData.totals.profit, currency)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        marginColor(managerData.totals.margin)
                      )}
                    >
                      {formatPct(managerData.totals.margin)}
                    </td>
                  </>
                ) : salesData ? (
                  <>
                    <td className="py-2 text-right tabular-nums text-accent-900">
                      {formatPrice(salesData.totals.totalRevenue, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-accent-800">
                      {salesData.totals.avgKatsayi.toFixed(4)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        markupColor(salesData.totals.markupPct)
                      )}
                    >
                      {salesData.totals.markupPct > 0 ? '+' : ''}{formatPct(salesData.totals.markupPct)}
                    </td>
                  </>
                ) : null}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
