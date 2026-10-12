import { describe, it, expect } from 'vitest';
import {
  istanbulMonthKey, lastMonths, toEur, makeEurRateLookup, familyKey,
  familyDecisions, monthlyWonEur, monthlyWinRate, sentThisMonth, sentInPeriod, wonInPeriod,
  isSummaryPeriod, type DashQuote,
} from './dashboard-metrics';

const q = (over: Partial<DashQuote> & { id: string }): DashQuote => ({
  companyId: 'c1', quoteNumber: over.id, parentQuoteId: null, status: 'TASLAK', currency: 'EUR',
  grandTotal: 1000, rateSnapshot: null, createdAt: new Date('2026-09-01T09:00:00Z'),
  updatedAt: new Date('2026-09-01T09:00:00Z'), events: [], ...over,
});
const noRate = () => null;

describe('dashboard-metrics', () => {
  it('buckets by Istanbul month (UTC+3)', () => {
    expect(istanbulMonthKey(new Date('2026-09-30T21:30:00Z'))).toBe('2026-10'); // 00:30 TR on 1 Oct
    expect(istanbulMonthKey(new Date('2026-09-30T20:30:00Z'))).toBe('2026-09');
    expect(lastMonths(new Date('2026-10-10T12:00:00Z'), 3).map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('converts to EUR via the quote snapshot, then the rate table, never 1:1', () => {
    const snap = { TRY: { EUR: 0.02 } };
    expect(toEur(1_000_000, 'TRY', snap, new Date(), noRate)).toBe(20_000);
    const lookup = makeEurRateLookup([
      { fromCurrency: 'USD', rate: 0.9, fetchedAt: new Date('2026-01-01') },
      { fromCurrency: 'USD', rate: 0.85, fetchedAt: new Date('2026-06-01') },
    ]);
    expect(toEur(100, 'USD', null, new Date('2026-03-01'), lookup)).toBeCloseTo(90);
    expect(toEur(100, 'USD', null, new Date('2026-07-01'), lookup)).toBeCloseTo(85);
    expect(toEur(100, 'GBP', null, new Date(), lookup)).toBeNull();
    expect(toEur(100, 'EUR', null, new Date(), noRate)).toBe(100);
  });

  it('groups revisions into one family (dot revisions, legacy parent-linked, revert -R)', () => {
    const root = familyKey({ companyId: 'c', quoteNumber: 'FP0150' });
    expect(familyKey({ companyId: 'c', quoteNumber: 'FP0150.2' })).toBe(root);
    expect(familyKey({ companyId: 'c', quoteNumber: 'FP0150.1.3' })).toBe(root);
    expect(familyKey({ companyId: 'c', quoteNumber: 'FP0150-R2' })).toBe(root);
    expect(familyKey({ companyId: 'other', quoteNumber: 'FP0150' })).not.toBe(root);
  });

  it('a legacy root + parent-linked revisions form one family (won once, no phantom loss)', () => {
    const quotes = [
      q({ id: 'r', quoteNumber: 'FP0150', status: 'REVIZYON' }),
      q({ id: 'r1', quoteNumber: 'FP0150.1', parentQuoteId: 'r', status: 'KAYBEDILDI',
          events: [{ to: 'KAYBEDILDI', at: new Date('2026-05-03T10:00:00Z') }] }),
      q({ id: 'r2', quoteNumber: 'FP0150.2', status: 'KAZANILDI',
          events: [{ to: 'KAZANILDI', at: new Date('2026-05-10T10:00:00Z') }] }),
    ];
    const d = familyDecisions(quotes);
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe('won');
  });

  it('derives X→EUR from X→TRY ÷ EUR→TRY when no direct row exists', () => {
    const at = new Date('2026-06-01T08:00:00Z');
    const lookup = makeEurRateLookup([
      { fromCurrency: 'EUR', toCurrency: 'TRY', rate: 50, fetchedAt: at },
      { fromCurrency: 'USD', toCurrency: 'TRY', rate: 40, fetchedAt: at },
    ]);
    expect(lookup('TRY', at)).toBeCloseTo(0.02);
    expect(lookup('USD', at)).toBeCloseTo(0.8);
  });

  it('counts a won family once, at the win date, in EUR', () => {
    const quotes = [
      q({ id: 'A', status: 'KAZANILDI', events: [{ to: 'KAZANILDI', at: new Date('2026-09-10T10:00:00Z') }] }),
      q({ id: 'A.2', status: 'KAZANILDI', grandTotal: 1200, events: [{ to: 'KAZANILDI', at: new Date('2026-09-20T10:00:00Z') }] }),
      q({ id: 'B', status: 'KAZANILDI', currency: 'TRY', grandTotal: 500_000, rateSnapshot: { TRY: { EUR: 0.02 } },
          createdAt: new Date('2026-06-01T10:00:00Z'), events: [{ to: 'KAZANILDI', at: new Date('2026-10-02T10:00:00Z') }] }),
    ];
    const decisions = familyDecisions(quotes);
    const months = lastMonths(new Date('2026-10-10T12:00:00Z'), 2);
    const won = monthlyWonEur(decisions, months, (qq, at) => toEur(qq.grandTotal, qq.currency, qq.rateSnapshot, at, noRate));
    expect(won).toEqual([1200, 10_000]); // A family once (latest win), B in October (win month), TRY→EUR
  });

  it('win rate = won/(won+lost) families decided that month; null when none', () => {
    const quotes = [
      q({ id: 'W', status: 'KAZANILDI', events: [{ to: 'KAZANILDI', at: new Date('2026-10-02T10:00:00Z') }] }),
      q({ id: 'L', status: 'KAYBEDILDI', events: [{ to: 'KAYBEDILDI', at: new Date('2026-10-03T10:00:00Z') }] }),
      // Lost first, then revised and still open → no decision
      q({ id: 'R', status: 'KAYBEDILDI', events: [{ to: 'KAYBEDILDI', at: new Date('2026-10-04T10:00:00Z') }] }),
      q({ id: 'R.2', status: 'GONDERILDI', createdAt: new Date('2026-10-05T10:00:00Z') }),
    ];
    const months = lastMonths(new Date('2026-10-10T12:00:00Z'), 2);
    expect(monthlyWinRate(familyDecisions(quotes), months)).toEqual([null, 50]);
  });

  it('sent this month: one per family, regardless of current status', () => {
    const quotes = [
      q({ id: 'S', status: 'KAZANILDI', events: [
        { to: 'GONDERILDI', at: new Date('2026-10-01T10:00:00Z') },
        { to: 'KAZANILDI', at: new Date('2026-10-05T10:00:00Z') },
      ] }),
      q({ id: 'T', status: 'REVIZYON', events: [{ to: 'GONDERILDI', at: new Date('2026-10-02T10:00:00Z') }] }),
      q({ id: 'T.2', status: 'GONDERILDI', grandTotal: 900, events: [{ to: 'GONDERILDI', at: new Date('2026-10-08T10:00:00Z') }] }),
      q({ id: 'Old', status: 'GONDERILDI', events: [{ to: 'GONDERILDI', at: new Date('2026-09-15T10:00:00Z') }],
          updatedAt: new Date('2026-10-09T10:00:00Z') }), // edited this month, sent last month → not counted
    ];
    const sent = sentThisMonth(quotes, '2026-10');
    expect(sent.map((s) => s.quote.id).sort()).toEqual(['S', 'T.2']);
  });

  it('period helpers: sent and won over several months, one per family', () => {
    const quotes = [
      q({ id: 'A', status: 'KAZANILDI', events: [
        { to: 'GONDERILDI', at: new Date('2026-08-10T10:00:00Z') },
        { to: 'KAZANILDI', at: new Date('2026-09-05T10:00:00Z') },
      ] }),
      q({ id: 'B', status: 'GONDERILDI', events: [{ to: 'GONDERILDI', at: new Date('2026-10-02T10:00:00Z') }] }),
      q({ id: 'C', status: 'KAZANILDI', events: [{ to: 'KAZANILDI', at: new Date('2026-05-01T10:00:00Z') }] }),
    ];
    const last3 = new Set(lastMonths(new Date('2026-10-10T12:00:00Z'), 3).map((m) => m.key)); // Aug–Oct
    expect(sentInPeriod(quotes, last3).map((s) => s.quote.id).sort()).toEqual(['A', 'B']);
    expect(wonInPeriod(familyDecisions(quotes), last3).map((d) => d.quote.id)).toEqual(['A']); // C won in May
    expect(isSummaryPeriod('6m')).toBe(true);
    expect(isSummaryPeriod('2y')).toBe(false);
    expect(isSummaryPeriod('toString')).toBe(false);
    expect(isSummaryPeriod('constructor')).toBe(false);
  });
});
