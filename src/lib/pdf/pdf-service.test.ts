import { describe, it, expect, afterAll } from 'vitest';
import { PdfService, getPdfService } from './pdf-service';

describe('PdfService', () => {
  let service: PdfService;

  afterAll(async () => {
    // Clean up browser instance
    const svc = getPdfService();
    await svc.close();
  });

  describe('generatePdf', () => {
    it('generates PDF buffer from HTML content', async () => {
      service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html);
      await service.close();

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF magic bytes: %PDF
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    }, 30000);

    it('supports A4 page format', async () => {
      service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html, { format: 'A4' });
      await service.close();

      expect(result).toBeInstanceOf(Buffer);
    }, 30000);

    it('supports custom margins', async () => {
      service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html, {
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
      });
      await service.close();

      expect(result).toBeInstanceOf(Buffer);
    }, 30000);
  });

  describe('singleton pattern', () => {
    it('returns same instance via getPdfService', () => {
      const instance1 = getPdfService();
      const instance2 = getPdfService();

      expect(instance1).toBe(instance2);
    });
  });
});
