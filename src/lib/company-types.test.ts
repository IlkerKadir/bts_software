import { describe, it, expect } from 'vitest';
import {
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  companyTypeLabel,
  normalizeCompanyType,
} from './company-types';

describe('companyTypeLabel', () => {
  it('returns the Turkish label for every known type', () => {
    expect(companyTypeLabel('CLIENT')).toBe('Müşteri');
    expect(companyTypeLabel('MUTEAHHIT')).toBe('Müteahhit');
    expect(companyTypeLabel('URETICI')).toBe('Üretici');
  });

  it('falls back to the raw value for an unknown type', () => {
    expect(companyTypeLabel('WHATEVER')).toBe('WHATEVER');
  });
});

describe('normalizeCompanyType', () => {
  it('accepts every enum value directly (upper or lower case)', () => {
    for (const t of COMPANY_TYPES) {
      expect(normalizeCompanyType(t)).toBe(t);
      expect(normalizeCompanyType(t.toLowerCase())).toBe(t);
    }
  });

  it('accepts the exact Turkish label (and its upper-case form) for every type', () => {
    for (const t of COMPANY_TYPES) {
      const label = COMPANY_TYPE_LABELS[t];
      expect(normalizeCompanyType(label)).toBe(t);
      expect(normalizeCompanyType(label.toUpperCase())).toBe(t);
    }
  });

  it('accepts legacy ASCII aliases for the original two types', () => {
    expect(normalizeCompanyType('MUSTERI')).toBe('CLIENT');
    expect(normalizeCompanyType('musteri')).toBe('CLIENT');
    expect(normalizeCompanyType('IS ORTAGI')).toBe('PARTNER');
    expect(normalizeCompanyType('İŞ ORTAĞI')).toBe('PARTNER');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCompanyType('  Müteahhit  ')).toBe('MUTEAHHIT');
  });

  it('returns null for an unrecognized value', () => {
    expect(normalizeCompanyType('Tedarikci')).toBeNull();
    expect(normalizeCompanyType('')).toBeNull();
  });
});
