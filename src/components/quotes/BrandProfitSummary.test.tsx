/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrandProfitSummary } from './BrandProfitSummary';
import type { QuoteItemData } from './QuoteItemRow';

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
