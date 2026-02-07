import puppeteer, { Browser, PDFOptions } from 'puppeteer';

export interface PdfOptions {
  format?: 'A4' | 'Letter';
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  landscape?: boolean;
}

const IDLE_TIMEOUT_MS = 60_000; // 60 seconds

export class PdfService {
  private browser: Browser | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.close().catch((err) => {
        console.warn('PdfService: Error closing idle browser:', err);
      });
    }, IDLE_TIMEOUT_MS);
  }

  async generatePdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfOptions: PDFOptions = {
        format: options.format || 'A4',
        printBackground: true,
        margin: options.margin || {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
        landscape: options.landscape || false,
      };

      const pdfBuffer = await page.pdf(pdfOptions);
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
      this.resetIdleTimer();
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Singleton instance for reuse
let pdfServiceInstance: PdfService | null = null;

export function getPdfService(): PdfService {
  if (!pdfServiceInstance) {
    pdfServiceInstance = new PdfService();
  }
  return pdfServiceInstance;
}

// Close browser on process exit
const handleExit = () => {
  if (pdfServiceInstance) {
    pdfServiceInstance.close().catch(() => {});
  }
};

process.on('exit', handleExit);
process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
process.on('uncaughtException', handleExit);
