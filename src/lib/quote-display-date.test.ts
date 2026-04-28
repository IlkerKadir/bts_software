import { describe, it, expect } from 'vitest';
import { getQuoteDisplayDate } from './quote-display-date';

const CREATED = new Date('2026-04-12T10:00:00Z');
const APPROVED = new Date('2026-04-26T15:30:00Z');

describe('getQuoteDisplayDate', () => {
  it('returns createdAt for a fresh TASLAK quote with no approvedAt', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: null,
      status: 'TASLAK',
    })).toBe(CREATED);
  });

  it('returns createdAt for ONAY_BEKLIYOR (never approved)', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: null,
      status: 'ONAY_BEKLIYOR',
    })).toBe(CREATED);
  });

  it('returns approvedAt for ONAYLANDI', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: APPROVED,
      status: 'ONAYLANDI',
    })).toBe(APPROVED);
  });

  it('returns approvedAt for GONDERILDI (post-approval)', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: APPROVED,
      status: 'GONDERILDI',
    })).toBe(APPROVED);
  });

  it('returns approvedAt for TAKIPTE, KAZANILDI, KAYBEDILDI, REVIZYON, IPTAL when approved', () => {
    for (const status of ['TAKIPTE', 'KAZANILDI', 'KAYBEDILDI', 'REVIZYON', 'IPTAL']) {
      expect(getQuoteDisplayDate({
        createdAt: CREATED,
        approvedAt: APPROVED,
        status,
      })).toBe(APPROVED);
    }
  });

  it('falls back to createdAt for TASLAK even if a stale approvedAt is present (Onayı Geri Çek case)', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: APPROVED,
      status: 'TASLAK',
    })).toBe(CREATED);
  });

  it('falls back to createdAt for ONAY_BEKLIYOR with stale approvedAt (resubmitted after retract)', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: APPROVED,
      status: 'ONAY_BEKLIYOR',
    })).toBe(CREATED);
  });

  it('returns createdAt for ONAYLANDI when approvedAt happens to be missing (defensive)', () => {
    expect(getQuoteDisplayDate({
      createdAt: CREATED,
      approvedAt: null,
      status: 'ONAYLANDI',
    })).toBe(CREATED);
  });
});
