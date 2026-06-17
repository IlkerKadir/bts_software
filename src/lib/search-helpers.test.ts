import { describe, it, expect } from 'vitest';
import { expandTurkishVariants, buildTokenizedSearchAND, escapeLike } from './search-helpers';

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

describe('buildTokenizedSearchAND', () => {
  const FIELDS = ['code', 'name', 'brand.name'];

  it('returns empty array for empty / whitespace query', () => {
    expect(buildTokenizedSearchAND('', FIELDS)).toEqual([]);
    expect(buildTokenizedSearchAND('   ', FIELDS)).toEqual([]);
  });

  it('produces one AND group per whitespace-separated token', () => {
    const clause = buildTokenizedSearchAND('dts 5', FIELDS);
    expect(clause).toHaveLength(2); // "dts" and "5"
    expect(clause[0]).toHaveProperty('OR');
    expect(clause[1]).toHaveProperty('OR');
  });

  it('each token matches any field via contains (OR within a token)', () => {
    // "5" has no i-like chars -> single variant -> one matcher per field
    const clause = buildTokenizedSearchAND('5', FIELDS);
    expect(clause).toHaveLength(1);
    expect(clause[0].OR).toEqual([
      { code: { contains: '5', mode: 'insensitive' } },
      { name: { contains: '5', mode: 'insensitive' } },
      { brand: { name: { contains: '5', mode: 'insensitive' } } },
    ]);
  });

  it('builds nested matchers for dotted relation paths', () => {
    const clause = buildTokenizedSearchAND('smart', ['brand.name']);
    expect(clause[0].OR).toContainEqual({
      brand: { name: { contains: 'smart', mode: 'insensitive' } },
    });
  });

  it('expands each token into Turkish-i variants', () => {
    // "ii" => 9 variants; one field => 9 matchers in the single token group
    const clause = buildTokenizedSearchAND('ii', ['name']);
    expect(clause).toHaveLength(1);
    expect(clause[0].OR).toHaveLength(9);
  });

  it('single-token query reduces to one OR group (back-compat with old search)', () => {
    const clause = buildTokenizedSearchAND('dts', ['code', 'name']);
    expect(clause).toHaveLength(1);
    // "dts" has no i-like chars -> 1 variant * 2 fields = 2 matchers
    expect(clause[0].OR).toHaveLength(2);
  });

  it('caps the number of tokens to bound query size', () => {
    const clause = buildTokenizedSearchAND('a b c d e f g h', ['name'], 6);
    expect(clause).toHaveLength(6);
  });

  it('collapses repeated whitespace between tokens', () => {
    const clause = buildTokenizedSearchAND('  dts    5  ', FIELDS);
    expect(clause).toHaveLength(2);
  });

  it('keeps single-char numeric tokens (the "DTS 2" use case)', () => {
    const clause = buildTokenizedSearchAND('dts 2', ['name']);
    expect(clause).toHaveLength(2);
    expect(clause[1].OR).toContainEqual({ name: { contains: '2', mode: 'insensitive' } });
  });

  it('escapes LIKE wildcards in tokens so they match literally', () => {
    const clause = buildTokenizedSearchAND('50%', ['name']);
    expect(clause[0].OR).toContainEqual({ name: { contains: '50\\%', mode: 'insensitive' } });
  });
});

describe('escapeLike', () => {
  it('leaves ordinary terms untouched', () => {
    expect(escapeLike('DTS 5KM')).toBe('DTS 5KM');
    expect(escapeLike('smart')).toBe('smart');
  });

  it('escapes percent, underscore and backslash', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});
