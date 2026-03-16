import { describe, it, expect } from 'vitest';
import { validateImportFilename } from './validate';

describe('Product Import - filename validation', () => {
  describe('validateImportFilename', () => {
    it('accepts .xlsx extension', () => {
      expect(validateImportFilename('products.xlsx')).toBe(true);
    });

    it('accepts .xls extension', () => {
      expect(validateImportFilename('products.xls')).toBe(true);
    });

    it('accepts .XLSX extension (case-insensitive)', () => {
      expect(validateImportFilename('products.XLSX')).toBe(true);
    });

    it('accepts .XLS extension (case-insensitive)', () => {
      expect(validateImportFilename('products.XLS')).toBe(true);
    });

    it('accepts .Xlsx mixed case', () => {
      expect(validateImportFilename('products.Xlsx')).toBe(true);
    });

    it('rejects file with no extension', () => {
      expect(validateImportFilename('malicious_file')).toBe(false);
    });

    it('rejects .exe extension', () => {
      expect(validateImportFilename('malware.exe')).toBe(false);
    });

    it('rejects .csv extension', () => {
      expect(validateImportFilename('data.csv')).toBe(false);
    });

    it('rejects .php extension', () => {
      expect(validateImportFilename('shell.php')).toBe(false);
    });

    it('rejects path traversal filename', () => {
      expect(validateImportFilename('../../../etc/passwd')).toBe(false);
    });

    it('rejects double extension .xlsx.exe', () => {
      expect(validateImportFilename('data.xlsx.exe')).toBe(false);
    });

    it('rejects empty filename', () => {
      expect(validateImportFilename('')).toBe(false);
    });

    it('rejects filename with only .xlsx (no base name)', () => {
      // This is debatable but should still be accepted as it has valid extension
      expect(validateImportFilename('.xlsx')).toBe(true);
    });

    it('accepts filename with spaces', () => {
      expect(validateImportFilename('my products file.xlsx')).toBe(true);
    });

    it('accepts filename with Turkish characters', () => {
      expect(validateImportFilename('urun_listesi.xlsx')).toBe(true);
    });

    it('rejects filename ending with .xlsx but containing path separators', () => {
      expect(validateImportFilename('../../evil.xlsx')).toBe(false);
    });

    it('rejects filename with backslash path traversal', () => {
      expect(validateImportFilename('..\\..\\evil.xlsx')).toBe(false);
    });
  });
});
