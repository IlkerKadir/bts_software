import { describe, it, expect } from 'vitest';
import { expandTurkishVariants } from './search-helpers';

describe('expandTurkishVariants', () => {
  it('returns empty array for empty query', () => {
    expect(expandTurkishVariants('')).toEqual([]);
    expect(expandTurkishVariants('   ')).toEqual([]);
  });

  it('returns single-element array for query with no i-like characters', () => {
    expect(expandTurkishVariants('hello')).toEqual(['hello']);
    expect(expandTurkishVariants('ABC')).toEqual(['ABC']);
    expect(expandTurkishVariants('çağrı')).toContain('çağrı');
  });

  it('expands a single Latin lowercase i into three variants', () => {
    const variants = expandTurkishVariants('altinay');
    expect(variants).toHaveLength(3);
    expect(variants).toEqual(expect.arrayContaining(['altinay', 'altınay', 'altİnay']));
  });

  it('treats Latin uppercase I the same as Latin lowercase i (ILIKE folds them)', () => {
    // 'I' is i-like; we expand to {i, ı, İ} just like lowercase. ILIKE handles I↔i.
    const variants = expandTurkishVariants('IBM');
    expect(variants).toHaveLength(3);
    expect(variants).toEqual(expect.arrayContaining(['iBM', 'ıBM', 'İBM']));
  });

  it('expands a single dotless ı into three variants', () => {
    const variants = expandTurkishVariants('altınay');
    expect(variants).toHaveLength(3);
    expect(variants).toEqual(expect.arrayContaining(['altinay', 'altınay', 'altİnay']));
  });

  it('expands a single dotted İ into three variants', () => {
    const variants = expandTurkishVariants('İstanbul');
    expect(variants).toHaveLength(3);
    expect(variants).toEqual(expect.arrayContaining(['istanbul', 'ıstanbul', 'İstanbul']));
  });

  it('produces 3^N variants for N i-like characters when below cap', () => {
    // "iı" has 2 i-likes → 3^2 = 9 variants
    const variants = expandTurkishVariants('iı');
    expect(variants).toHaveLength(9);
    // Sanity-check a few
    expect(variants).toEqual(expect.arrayContaining(['ii', 'iı', 'iİ', 'ıi', 'ıı', 'ıİ', 'İi', 'İı', 'İİ']));
  });

  it('falls back to single original when 3^N exceeds the variant cap', () => {
    // 4 i-likes → 3^4 = 81 variants, exceeds default cap of 16
    const original = 'iiiİ';
    const variants = expandTurkishVariants(original);
    expect(variants).toEqual([original]);
  });

  it('respects custom maxVariants cap', () => {
    // 2 i-likes → 9 variants. With cap=8, falls back.
    expect(expandTurkishVariants('iı', 8)).toEqual(['iı']);
    // With cap=9, all 9 fit.
    expect(expandTurkishVariants('iı', 9)).toHaveLength(9);
  });

  it('preserves casing of non-i-like characters', () => {
    const variants = expandTurkishVariants('AltInAy');
    expect(variants).toEqual(expect.arrayContaining(['AltinAy', 'AltınAy', 'AltİnAy']));
  });

  it('deduplicates variants', () => {
    // Just sanity — set construction in the helper should drop duplicates if any arise.
    const variants = expandTurkishVariants('a');
    expect(new Set(variants).size).toBe(variants.length);
  });
});
