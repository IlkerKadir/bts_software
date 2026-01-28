import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateQuoteNumber,
  getCurrentYearPrefix,
  parseQuoteNumber,
  getNextSequence,
} from './quote-number';

describe('Quote Number', () => {
  describe('generateQuoteNumber', () => {
    beforeEach(() => {
      // Mock date to 2025-01-23
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-23T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('generates format BTS-YYYY-NNNN', () => {
      const result = generateQuoteNumber(1);
      expect(result).toBe('BTS-2025-0001');
    });

    it('pads sequence number to 4 digits', () => {
      expect(generateQuoteNumber(1)).toBe('BTS-2025-0001');
      expect(generateQuoteNumber(42)).toBe('BTS-2025-0042');
      expect(generateQuoteNumber(999)).toBe('BTS-2025-0999');
      expect(generateQuoteNumber(1234)).toBe('BTS-2025-1234');
    });

    it('handles sequence numbers over 9999', () => {
      const result = generateQuoteNumber(12345);
      expect(result).toBe('BTS-2025-12345');
    });

    it('uses current year', () => {
      vi.setSystemTime(new Date('2026-06-15T10:00:00Z'));
      const result = generateQuoteNumber(1);
      expect(result).toBe('BTS-2026-0001');
    });
  });

  describe('getCurrentYearPrefix', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-23T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns BTS-YYYY- prefix for current year', () => {
      const result = getCurrentYearPrefix();
      expect(result).toBe('BTS-2025-');
    });

    it('changes with different year', () => {
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const result = getCurrentYearPrefix();
      expect(result).toBe('BTS-2026-');
    });
  });

  describe('parseQuoteNumber', () => {
    it('extracts prefix, year, and sequence from quote number', () => {
      const result = parseQuoteNumber('BTS-2025-0042');
      expect(result).toEqual({
        prefix: 'BTS',
        year: 2025,
        sequence: 42,
      });
    });

    it('handles different years and sequences', () => {
      expect(parseQuoteNumber('BTS-2024-1234')).toEqual({
        prefix: 'BTS',
        year: 2024,
        sequence: 1234,
      });
    });

    it('returns null for invalid format', () => {
      expect(parseQuoteNumber('INVALID')).toBeNull();
      expect(parseQuoteNumber('BTS2025-0001')).toBeNull(); // Missing dash
      expect(parseQuoteNumber('BTS-20250001')).toBeNull(); // Missing dash
      expect(parseQuoteNumber('TEK-2025-0001')).toBeNull(); // Wrong prefix
      expect(parseQuoteNumber('')).toBeNull();
    });

    it('handles sequence numbers with more than 4 digits', () => {
      const result = parseQuoteNumber('BTS-2025-12345');
      expect(result).toEqual({
        prefix: 'BTS',
        year: 2025,
        sequence: 12345,
      });
    });

    it('returns null for null input', () => {
      expect(parseQuoteNumber(null as unknown as string)).toBeNull();
    });
  });

  describe('getNextSequence', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-23T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns 1 when no previous quote', () => {
      const result = getNextSequence(null);
      expect(result).toBe(1);
    });

    it('increments sequence from last quote in same year', () => {
      const result = getNextSequence('BTS-2025-0042');
      expect(result).toBe(43);
    });

    it('resets to 1 when last quote is from previous year', () => {
      const result = getNextSequence('BTS-2024-0150');
      expect(result).toBe(1);
    });

    it('returns 1 for invalid quote number format', () => {
      const result = getNextSequence('INVALID');
      expect(result).toBe(1);
    });

    it('handles high sequence numbers', () => {
      const result = getNextSequence('BTS-2025-9999');
      expect(result).toBe(10000);
    });
  });
});
