import { describe, it, expect } from 'vitest';
import { buildStfExportFilename, sanitizeFilenamePart } from './filename';

describe('sanitizeFilenamePart', () => {
  it('transliterates Turkish letters and replaces spaces', () => {
    expect(sanitizeFilenamePart('Ana Fabrika İş')).toBe('Ana_Fabrika_Is');
  });
  it('strips unsafe filesystem characters', () => {
    expect(sanitizeFilenamePart('a/b:c*?"<>|d')).toBe('abcd');
  });
  it('returns empty for null/whitespace', () => {
    expect(sanitizeFilenamePart(null)).toBe('');
    expect(sanitizeFilenamePart('   ')).toBe('');
  });
});

describe('buildStfExportFilename', () => {
  it('joins order number, project and company (Turkish transliterated)', () => {
    expect(
      buildStfExportFilename(
        { orderNumber: 'STF-6000', projectName: 'Ana Fabrika', companyName: 'Duran Doğan A.Ş' },
        'pdf'
      )
    ).toBe('STF-6000-Ana_Fabrika-Duran_Dogan_A.S.pdf');
  });

  it('keeps the .N revision suffix in the order number', () => {
    expect(
      buildStfExportFilename({ orderNumber: 'STF-6000.1', projectName: 'X', companyName: 'Y' }, 'xlsx')
    ).toBe('STF-6000.1-X-Y.xlsx');
  });

  it('drops empty project/company parts (no trailing dashes)', () => {
    expect(
      buildStfExportFilename({ orderNumber: 'STF-6001', projectName: null, companyName: '  ' }, 'pdf')
    ).toBe('STF-6001.pdf');
  });
});
