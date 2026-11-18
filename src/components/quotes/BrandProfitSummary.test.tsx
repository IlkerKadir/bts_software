/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrandProfitSummary } from './BrandProfitSummary';
import type { QuoteItemData } from './QuoteItemRow';
import { toBrandSummaryItems, type BrandSummarySourceItem } from './brand-summary-items';

const row = (id: string, brand: string | null, extra: Partial<QuoteItemData> = {}): QuoteItemData =>
  ({
    id, itemType: 'PRODUCT', sortOrder: 1, brand, description: id, quantity: 1, unit: 'Adet',
    listPrice: 100, katsayi: 1.2, unitPrice: 120, discountPct: 0, vatRate: 20, totalPrice: 120,
    costPrice: 80, ...extra,
  }) as QuoteItemData;

// A row of brand A, a row of brand B, and a SET of brand C whose child is brand A.
const items: QuoteItemData[] = [
  row('a1', 'TEKNIM'),
  row('b1', 'BTS'),
  row('s1', 'TYCO', { itemType: 'SET', unitPrice: 120, totalPrice: 120 }),
  row('c1', 'TEKNIM', { parentItemId: 's1' }),
];

describe('BrandProfitSummary — brand filter (client 06.11)', () => {
  for (const canViewCosts of [true, false]) {
    it(`shows only the selected brands (${canViewCosts ? 'manager' : 'sales'} mode)`, () => {
      render(
        <BrandProfitSummary items={items} currency="EUR" canViewCosts={canViewCosts} brandFilter={new Set(['TEKNIM'])} />
      );
      expect(screen.getAllByText('TEKNIM').length).toBeGreaterThan(0);
      expect(screen.queryByText('BTS')).not.toBeInTheDocument();
      expect(screen.queryByText('TYCO')).not.toBeInTheDocument();
    });

    it(`shows every brand without a filter (${canViewCosts ? 'manager' : 'sales'} mode)`, () => {
      render(<BrandProfitSummary items={items} currency="EUR" canViewCosts={canViewCosts} />);
      expect(screen.getAllByText('TEKNIM').length).toBeGreaterThan(0);
      expect(screen.getAllByText('BTS').length).toBeGreaterThan(0);
      expect(screen.getAllByText('TYCO').length).toBeGreaterThan(0);
    });
  }
});

describe('BrandProfitSummary on the quote detail page (client 18.11)', () => {
  // Rows as GET /api/quotes/[id] returns them (decimals as strings).
  const detailRow = (id: string, brand: string, extra: Partial<BrandSummarySourceItem> = {}): BrandSummarySourceItem => ({
    id, itemType: 'PRODUCT', sortOrder: 1, brand, description: id, quantity: '2', unit: 'Adet',
    listPrice: '100', katsayi: '1.2', unitPrice: '120', discountPct: '0', vatRate: '20', totalPrice: '240',
    costPrice: '80', ...extra,
  });
  // One priced row, and two rows whose price cell reads a label — they still
  // carry a unit price and a cost, but are not part of the quote total.
  const detailRows: BrandSummarySourceItem[] = [
    detailRow('p1', 'BTS'),
    detailRow('p2', 'TYCO', { priceLabel: 'Dahildir', unitPrice: '360', totalPrice: '720', costPrice: '300' }),
    detailRow('p3', 'TEKNIM', { priceLabel: 'Tarafınızca Sağlanacaktır', unitPrice: '50', totalPrice: '100', costPrice: null }),
  ];

  for (const canViewCosts of [true, false]) {
    it(`leaves "dahildir" / "tarafınızca" rows out, like the editor (${canViewCosts ? 'manager' : 'sales'} mode)`, () => {
      render(<BrandProfitSummary items={toBrandSummaryItems(detailRows)} currency="EUR" canViewCosts={canViewCosts} />);
      expect(screen.getByText('(1 marka, 1 kalem)')).toBeInTheDocument();
      expect(screen.getAllByText('BTS').length).toBeGreaterThan(0);
      expect(screen.queryByText('TYCO')).not.toBeInTheDocument();
      expect(screen.queryByText('TEKNIM')).not.toBeInTheDocument();
      // 2 × 120 — not 240 + 720 + 100.
      expect(screen.getAllByText('240,00 EUR').length).toBeGreaterThan(0);
      expect(screen.queryByText('1.060,00 EUR')).not.toBeInTheDocument();
    });
  }

  it('carries over every field the summary reads', () => {
    const [out] = toBrandSummaryItems([
      detailRow('c1', 'BTS', {
        parentItemId: 's1', code: 'K-1', priceLabel: 'Dahildir', sectionDiscountPct: '5',
        ekMaliyetDelta: '1.5', currency: 'TRY',
      }),
    ]);
    expect(out).toMatchObject({
      id: 'c1', itemType: 'PRODUCT', brand: 'BTS', description: 'c1', code: 'K-1',
      quantity: 2, unitPrice: 120, discountPct: 0, listPrice: 100, katsayi: 1.2,
      costPrice: 80, ekMaliyetDelta: 1.5, priceLabel: 'Dahildir', parentItemId: 's1',
      currency: 'TRY', sectionDiscountPct: 5,
    });
  });
});
