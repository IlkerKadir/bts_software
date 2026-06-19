import { describe, it, expect } from 'vitest';
import { footerDefaultsFromTerms } from './stf-footer-defaults';

describe('footerDefaultsFromTerms', () => {
  it('maps the real (Turkish) category keys to footer fields', () => {
    const r = footerDefaultsFromTerms([
      { category: 'odeme', value: '30 gün' },
      { category: 'garanti', value: '2 yıl' },
      { category: 'kdv', value: 'KDV dahil değildir' },
      { category: 'teslim_yeri', value: 'İstanbul' },
      { category: 'teslimat', value: '8-10 hafta' },
      { category: 'NOTLAR', value: 'Bir bütün halinde geçerlidir' },
    ]);
    expect(r.paymentTerms).toBe('30 gün');
    expect(r.warranty).toBe('2 yıl');
    expect(r.vatNote).toBe('KDV dahil değildir');
    expect(r.deliveryPlace).toBe('İstanbul');
    expect(r.deliveryTime).toBe('8-10 hafta');
    expect(r.notes).toBe('Bir bütün halinde geçerlidir');
  });

  it('joins multiple NOTLAR terms with newlines', () => {
    const r = footerDefaultsFromTerms([
      { category: 'NOTLAR', value: 'Not 1' },
      { category: 'NOTLAR', value: 'Not 2' },
    ]);
    expect(r.notes).toBe('Not 1\nNot 2');
  });

  it('parses uretici_firmalar JSON into "BRAND - systems" lines', () => {
    const r = footerDefaultsFromTerms([
      { category: 'uretici_firmalar', value: '{"SENSITRON":["CCTV Sistemi"],"TYCO ZETTLER":["Yangın","Söndürme"]}' },
    ]);
    expect(r.manufacturers).toBe('SENSITRON - CCTV Sistemi\nTYCO ZETTLER - Yangın, Söndürme');
  });

  it('renders a brand with no systems as just the brand name', () => {
    const r = footerDefaultsFromTerms([
      { category: 'uretici_firmalar', value: '{"BTS":[]}' },
    ]);
    expect(r.manufacturers).toBe('BTS');
  });

  it('falls back to raw text when uretici_firmalar is not JSON', () => {
    const r = footerDefaultsFromTerms([
      { category: 'uretici_firmalar', value: 'GLT ZETA' },
    ]);
    expect(r.manufacturers).toBe('GLT ZETA');
  });

  it('falls back to delivery when teslim_yeri is absent', () => {
    const r = footerDefaultsFromTerms([{ category: 'delivery', value: 'BTS depo' }]);
    expect(r.deliveryPlace).toBe('BTS depo');
  });

  it('joins multiple terms in the same category with newlines', () => {
    const r = footerDefaultsFromTerms([
      { category: 'odeme', value: 'A' },
      { category: 'odeme', value: 'B' },
    ]);
    expect(r.paymentTerms).toBe('A\nB');
  });

  it('returns all-null for empty input', () => {
    expect(footerDefaultsFromTerms([])).toEqual({
      manufacturers: null, paymentTerms: null, deliveryPlace: null,
      deliveryTime: null, warranty: null, vatNote: null, notes: null,
    });
  });
});
