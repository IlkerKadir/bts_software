import { describe, it, expect } from 'vitest';
import {
  generateFileName,
  validateFile,
  getMimeType,
  formatFileSize,
} from './document-service';

describe('Document Service', () => {
  describe('generateFileName', () => {
    it('generates unique filename with timestamp and random string', () => {
      const result = generateFileName('test.pdf');
      expect(result).toMatch(/^\d+-[a-f0-9]+\.pdf$/);
    });

    it('preserves file extension', () => {
      expect(generateFileName('document.docx')).toMatch(/\.docx$/);
      expect(generateFileName('image.PNG')).toMatch(/\.png$/);
    });

    it('generates different names for same input', () => {
      const name1 = generateFileName('test.pdf');
      const name2 = generateFileName('test.pdf');
      expect(name1).not.toBe(name2);
    });
  });

  describe('validateFile', () => {
    it('accepts valid PDF file', () => {
      const result = validateFile('document.pdf', 1024 * 1024);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts valid Excel file', () => {
      const result = validateFile('spreadsheet.xlsx', 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('accepts valid image files', () => {
      expect(validateFile('image.png', 1024).valid).toBe(true);
      expect(validateFile('photo.jpg', 1024).valid).toBe(true);
      expect(validateFile('picture.jpeg', 1024).valid).toBe(true);
    });

    it('rejects unsupported file types', () => {
      const result = validateFile('script.exe', 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Desteklenmeyen dosya türü');
    });

    it('rejects files larger than 10MB', () => {
      const result = validateFile('large.pdf', 11 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dosya boyutu çok büyük');
    });

    it('accepts files exactly 10MB', () => {
      const result = validateFile('exact.pdf', 10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });
  });

  describe('getMimeType', () => {
    it('returns correct mime type for PDF', () => {
      expect(getMimeType('file.pdf')).toBe('application/pdf');
    });

    it('returns correct mime type for Word documents', () => {
      expect(getMimeType('file.doc')).toBe('application/msword');
      expect(getMimeType('file.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('returns correct mime type for Excel files', () => {
      expect(getMimeType('file.xls')).toBe('application/vnd.ms-excel');
      expect(getMimeType('file.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('returns correct mime type for images', () => {
      expect(getMimeType('file.png')).toBe('image/png');
      expect(getMimeType('file.jpg')).toBe('image/jpeg');
      expect(getMimeType('file.jpeg')).toBe('image/jpeg');
      expect(getMimeType('file.gif')).toBe('image/gif');
    });

    it('returns octet-stream for unknown types', () => {
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(2560)).toBe('2.5 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
    });
  });
});
