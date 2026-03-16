import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

describe('GET /api/quotes/[id]/compare/[compareId]', () => {
  const mockUser = {
    id: 'user1',
    fullName: 'Test User',
    role: {
      id: 'role1',
      name: 'User',
      canViewCosts: true,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      canOverrideKatsayi: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const makeItem = (overrides: Record<string, unknown> = {}) => ({
    id: 'item1',
    productId: 'prod1',
    code: 'PROD-001',
    brand: 'ZETA',
    description: 'Test Product 1',
    quantity: 10,
    unit: 'Adet',
    katsayi: 1.0,
    unitPrice: 500,
    totalPrice: 5000,
    itemType: 'PRODUCT',
    sortOrder: 0,
    parentItemId: null,
    ...overrides,
  });

  const makeQuote = (overrides: Record<string, unknown> = {}) => ({
    id: 'quote1',
    quoteNumber: 'BTS-2024-001',
    version: 1,
    status: 'GONDERILDI',
    currency: 'EUR',
    subtotal: 9000,
    discountTotal: 0,
    discountPct: 0,
    vatTotal: 1800,
    grandTotal: 10800,
    protectionPct: 0,
    exchangeRate: 1,
    validityDays: 30,
    notes: null,
    createdAt: new Date('2024-01-10'),
    createdBy: { id: 'user1', fullName: 'Test User' },
    items: [makeItem()],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 404 if one quote not found', async () => {
    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(makeQuote() as never)
      .mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(404);
  });

  it('returns comparison data for two quotes', async () => {
    const q1 = makeQuote();
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      status: 'TASLAK',
      subtotal: 10000,
      vatTotal: 2000,
      grandTotal: 12000,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', quantity: 15, totalPrice: 7500 }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.oldQuote.version).toBe(1);
    expect(data.newQuote.version).toBe(2);
    expect(data.headerChanges).toBeDefined();
    expect(data.itemDiffs).toBeDefined();
    expect(data.summary).toBeDefined();
  });

  it('detects item quantity changes', async () => {
    const q1 = makeQuote();
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', quantity: 15, totalPrice: 7500 }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    const modifiedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'modified');
    expect(modifiedItem).toBeDefined();
    expect(modifiedItem.changes.some((c: { field: string }) => c.field === 'Miktar')).toBe(true);
  });

  it('detects katsayi changes', async () => {
    const q1 = makeQuote();
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', katsayi: 1.35 }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    const modifiedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'modified');
    expect(modifiedItem).toBeDefined();
    expect(modifiedItem.changes.some((c: { field: string }) => c.field === 'Katsayi')).toBe(true);
  });

  it('detects added and removed items', async () => {
    const q1 = makeQuote({
      items: [
        makeItem({ id: 'item1', productId: 'prod1', code: 'PROD-001' }),
        makeItem({ id: 'item-old', productId: 'prod-old', code: 'PROD-OLD', description: 'Old Only Item' }),
      ],
    });
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', productId: 'prod1', code: 'PROD-001' }),
        makeItem({ id: 'item-new', productId: 'prod-new', code: 'PROD-NEW', description: 'New Only Item' }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    expect(data.summary.addedItems).toBe(1);
    expect(data.summary.removedItems).toBe(1);

    const addedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'added');
    expect(addedItem).toBeDefined();
    expect(addedItem.newItem.code).toBe('PROD-NEW');

    const removedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'removed');
    expect(removedItem).toBeDefined();
    expect(removedItem.oldItem.code).toBe('PROD-OLD');
  });

  it('matches items by productId first', async () => {
    // Same productId but different codes - should still match
    const q1 = makeQuote({
      items: [
        makeItem({ id: 'item1', productId: 'prod1', code: 'OLD-CODE', quantity: 5 }),
      ],
    });
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', productId: 'prod1', code: 'NEW-CODE', quantity: 10 }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    // Should be a modified item, not added+removed
    expect(data.summary.modifiedItems).toBe(1);
    expect(data.summary.addedItems).toBe(0);
    expect(data.summary.removedItems).toBe(0);
  });

  it('skips HEADER and NOTE items in comparison', async () => {
    const q1 = makeQuote({
      items: [
        makeItem({ id: 'item1' }),
        makeItem({ id: 'header1', itemType: 'HEADER', productId: null, code: null, description: 'Section Header' }),
      ],
    });
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2' }),
        // Header removed in new version - should not appear in diffs
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    // The HEADER item should not appear in diffs
    expect(data.itemDiffs.every((d: { oldItem?: { itemType: string }; newItem?: { itemType: string } }) => {
      const item = d.oldItem || d.newItem;
      return item?.itemType !== 'HEADER';
    })).toBe(true);
  });

  it('detects description changes', async () => {
    const q1 = makeQuote({
      items: [
        makeItem({ id: 'item1', productId: 'prod1' }),
      ],
    });
    const q2 = makeQuote({
      id: 'quote2',
      version: 2,
      createdAt: new Date('2024-01-15'),
      items: [
        makeItem({ id: 'item2', productId: 'prod1', description: 'Updated Product Description' }),
      ],
    });

    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(q1 as never)
      .mockResolvedValueOnce(q2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    const modifiedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'modified');
    expect(modifiedItem).toBeDefined();
    expect(modifiedItem.changes.some((c: { field: string }) => c.field === 'Aciklama')).toBe(true);
  });
});
