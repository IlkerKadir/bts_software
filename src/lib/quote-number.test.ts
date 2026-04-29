import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateQuoteNumber,
  parseQuoteNumber,
  getCurrentYearPrefix,
  getNextSequence,
  getInitials,
  getInitialsPrefix,
} from './quote-number';

describe('Quote Number', () => {
  describe('getInitials', () => {
    it('extracts initials from a two-word name', () => {
      expect(getInitials('Selale Acar')).toBe('SA');
    });

    it('uppercases the result', () => {
      expect(getInitials('ilker ozturk')).toBe('IO');
    });

    it('handles three-word names', () => {
      expect(getInitials('Murat Can Demirhan')).toBe('MCD');
    });

    it('trims and collapses whitespace', () => {
      expect(getInitials('  Selale   Acar  ')).toBe('SA');
    });

    it('returns a single letter for a one-word name', () => {
      expect(getInitials('Cem')).toBe('C');
    });
  });

  describe('generateQuoteNumber', () => {
    it('formats {INITIALS}{NNNN} with padded 4-digit sequence', () => {
      expect(generateQuoteNumber('SA', 1)).toBe('SA0001');
      expect(generateQuoteNumber('SA', 42)).toBe('SA0042');
      expect(generateQuoteNumber('SA', 999)).toBe('SA0999');
      expect(generateQuoteNumber('SA', 1234)).toBe('SA1234');
    });

    it('keeps sequence numbers above 9999 unpadded', () => {
      expect(generateQuoteNumber('SA', 12345)).toBe('SA12345');
    });

    it('appends a system code as `-{SYSTEM}`', () => {
      expect(generateQuoteNumber('SA', 51, 'YAS')).toBe('SA0051-YAS');
      expect(generateQuoteNumber('CC', 4, 'CCTV')).toBe('CC0004-CCTV');
    });

    it('appends a `.{rev}` revision suffix only when > 0', () => {
      expect(generateQuoteNumber('SA', 51, 'YAS', 0)).toBe('SA0051-YAS');
      expect(generateQuoteNumber('SA', 51, 'YAS', 1)).toBe('SA0051-YAS.1');
      expect(generateQuoteNumber('SA', 51, 'YAS', 2)).toBe('SA0051-YAS.2');
    });

    it('ignores revision when system code is absent (no suffix to attach to)', () => {
      expect(generateQuoteNumber('SA', 51, undefined, 2)).toBe('SA0051');
    });
  });

  describe('getCurrentYearPrefix', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns BTS-YYYY- prefix for the current year (legacy helper)', () => {
      vi.setSystemTime(new Date('2025-01-23T10:00:00Z'));
      expect(getCurrentYearPrefix()).toBe('BTS-2025-');
    });

    it('changes with a different year', () => {
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      expect(getCurrentYearPrefix()).toBe('BTS-2026-');
    });
  });

  describe('parseQuoteNumber', () => {
    it('parses the new {INITIALS}{NNNN} form', () => {
      expect(parseQuoteNumber('SA0042')).toEqual({
        initials: 'SA',
        sequence: 42,
        systemCode: '',
        revision: 0,
      });
    });

    it('parses {INITIALS}{NNNN}-{SYSTEM}', () => {
      expect(parseQuoteNumber('SA0051-YAS')).toEqual({
        initials: 'SA',
        sequence: 51,
        systemCode: 'YAS',
        revision: 0,
      });
    });

    it('parses {INITIALS}{NNNN}-{SYSTEM}.{REV}', () => {
      expect(parseQuoteNumber('SA0051-YAS.2')).toEqual({
        initials: 'SA',
        sequence: 51,
        systemCode: 'YAS',
        revision: 2,
      });
    });

    it('parses {INITIALS}{NNNN}.{REV} (revision without system code)', () => {
      // Standalone revisions append `.{rev}` directly to the base
      // number — no `-SYSTEM` between them. Previously this was
      // unrecognized, which corrupted next-sequence calculation when
      // a revision happened to be the lex-largest match in the user's
      // quote list (`LC0014.1` > `LC0014` lexicographically).
      expect(parseQuoteNumber('LC0014.1')).toEqual({
        initials: 'LC',
        sequence: 14,
        systemCode: '',
        revision: 1,
      });
    });

    it('parses the legacy BTS-YYYY-NNNN form for backward compatibility', () => {
      expect(parseQuoteNumber('BTS-2025-0042')).toEqual({
        initials: 'BTS',
        sequence: 42,
        systemCode: '',
        revision: 0,
      });
    });

    it('returns null for unrecognised formats', () => {
      expect(parseQuoteNumber('INVALID')).toBeNull();
      expect(parseQuoteNumber('')).toBeNull();
      expect(parseQuoteNumber(null as unknown as string)).toBeNull();
    });

    it('handles sequence numbers over 9999', () => {
      expect(parseQuoteNumber('SA12345')).toEqual({
        initials: 'SA',
        sequence: 12345,
        systemCode: '',
        revision: 0,
      });
    });

    it('is case-insensitive on the initials block', () => {
      expect(parseQuoteNumber('sa0051-yas')?.initials).toBe('SA');
      expect(parseQuoteNumber('sa0051-yas')?.systemCode).toBe('YAS');
    });
  });

  describe('getInitialsPrefix', () => {
    it('returns the uppercased initials', () => {
      expect(getInitialsPrefix('sa')).toBe('SA');
      expect(getInitialsPrefix('SA')).toBe('SA');
    });
  });

  describe('getNextSequence', () => {
    it('returns 1 when the caller has no previous quote', () => {
      expect(getNextSequence(null)).toBe(1);
    });

    it('increments from the parsed sequence in the new format', () => {
      expect(getNextSequence('SA0042')).toBe(43);
      expect(getNextSequence('SA0051-YAS')).toBe(52);
      expect(getNextSequence('SA0051-YAS.2')).toBe(52);
      // Revisions without a system code (LC0014.1) must yield the
      // base sequence + 1, not 1 (which was the regression that
      // produced unique-constraint failures on new-quote create).
      expect(getNextSequence('LC0014.1')).toBe(15);
    });

    it('increments from the parsed sequence in the legacy BTS format', () => {
      expect(getNextSequence('BTS-2025-0042')).toBe(43);
    });

    it('returns 1 when the input does not parse', () => {
      expect(getNextSequence('INVALID')).toBe(1);
    });

    it('handles high sequence numbers', () => {
      expect(getNextSequence('SA9999')).toBe(10000);
    });
  });
});
