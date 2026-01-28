import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  parseCurrencyInput,
  getCurrencySymbol,
  convertCurrency,
} from './currency';

describe('Currency Utilities', () => {
  describe('getCurrencySymbol', () => {
    it('returns correct symbol for EUR', () => {
      expect(getCurrencySymbol('EUR')).toBe('€');
    });

    it('returns correct symbol for USD', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
    });

    it('returns correct symbol for GBP', () => {
      expect(getCurrencySymbol('GBP')).toBe('£');
    });

    it('returns correct symbol for TRY', () => {
      expect(getCurrencySymbol('TRY')).toBe('₺');
    });

    it('returns currency code for unknown currencies', () => {
      expect(getCurrencySymbol('JPY')).toBe('JPY');
      expect(getCurrencySymbol('CHF')).toBe('CHF');
    });
  });

  describe('formatCurrency', () => {
    it('formats EUR with symbol and Turkish locale', () => {
      const result = formatCurrency(1234.56, 'EUR');
      expect(result).toBe('€1.234,56');
    });

    it('formats USD correctly', () => {
      const result = formatCurrency(1234.56, 'USD');
      expect(result).toBe('$1.234,56');
    });

    it('formats TRY correctly', () => {
      const result = formatCurrency(1234.56, 'TRY');
      expect(result).toBe('₺1.234,56');
    });

    it('handles zero values', () => {
      const result = formatCurrency(0, 'EUR');
      expect(result).toBe('€0,00');
    });

    it('handles large numbers', () => {
      const result = formatCurrency(1234567.89, 'EUR');
      expect(result).toBe('€1.234.567,89');
    });

    it('rounds to 2 decimal places', () => {
      const result = formatCurrency(123.456, 'EUR');
      expect(result).toBe('€123,46');
    });

    it('handles negative values', () => {
      const result = formatCurrency(-1234.56, 'EUR');
      expect(result).toBe('-€1.234,56');
    });
  });

  describe('parseCurrencyInput', () => {
    it('parses plain numbers', () => {
      expect(parseCurrencyInput('1234.56')).toBe(1234.56);
    });

    it('parses Turkish formatted numbers (comma as decimal)', () => {
      expect(parseCurrencyInput('1234,56')).toBe(1234.56);
    });

    it('parses numbers with thousand separators', () => {
      expect(parseCurrencyInput('1.234,56')).toBe(1234.56);
      expect(parseCurrencyInput('1,234.56')).toBe(1234.56);
    });

    it('removes currency symbols', () => {
      expect(parseCurrencyInput('€1234.56')).toBe(1234.56);
      expect(parseCurrencyInput('$1234.56')).toBe(1234.56);
      expect(parseCurrencyInput('₺1234.56')).toBe(1234.56);
    });

    it('handles whitespace', () => {
      expect(parseCurrencyInput('  1234.56  ')).toBe(1234.56);
    });

    it('returns 0 for empty input', () => {
      expect(parseCurrencyInput('')).toBe(0);
      expect(parseCurrencyInput('   ')).toBe(0);
    });

    it('returns 0 for invalid input', () => {
      expect(parseCurrencyInput('abc')).toBe(0);
      expect(parseCurrencyInput('€')).toBe(0);
    });
  });

  describe('convertCurrency', () => {
    it('converts EUR to TRY', () => {
      const result = convertCurrency(100, 36.85);
      expect(result).toBe(3685);
    });

    it('handles decimal exchange rates', () => {
      const result = convertCurrency(100, 1.08);
      expect(result).toBeCloseTo(108, 2);
    });

    it('handles zero amount', () => {
      const result = convertCurrency(0, 36.85);
      expect(result).toBe(0);
    });

    it('handles rate of 1 (same currency)', () => {
      const result = convertCurrency(100, 1);
      expect(result).toBe(100);
    });
  });
});
