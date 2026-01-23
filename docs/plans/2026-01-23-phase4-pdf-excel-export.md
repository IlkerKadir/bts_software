# Phase 4: PDF/Excel Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate professional PDF quotes and Excel exports with Turkish localization and company branding.

**Architecture:** Server-side generation using Puppeteer for HTML-to-PDF rendering (pixel-perfect with Turkish character support) and ExcelJS for Excel exports. API routes handle generation, returning downloadable files.

**Tech Stack:** Puppeteer, ExcelJS, Next.js API Routes, React (for PDF template)

---

## Task 4.1: PDF Service Foundation

**Files:**
- Create: `src/lib/pdf/pdf-service.ts`
- Create: `src/lib/pdf/pdf-service.test.ts`
- Modify: `package.json` (add puppeteer dependency)

**Step 1: Install Puppeteer**

Run:
```bash
npm install puppeteer
```

**Step 2: Write failing test for PDF service initialization**

```typescript
// src/lib/pdf/pdf-service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PdfService } from './pdf-service';

describe('PdfService', () => {
  describe('generatePdf', () => {
    it('generates PDF buffer from HTML content', async () => {
      const service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF magic bytes: %PDF
      expect(result.slice(0, 4).toString()).toBe('%PDF');
    });

    it('supports A4 page format', async () => {
      const service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html, { format: 'A4' });

      expect(result).toBeInstanceOf(Buffer);
    });

    it('supports custom margins', async () => {
      const service = new PdfService();
      const html = '<html><body><h1>Test</h1></body></html>';

      const result = await service.generatePdf(html, {
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
      });

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test src/lib/pdf/pdf-service.test.ts`
Expected: FAIL with "Cannot find module './pdf-service'"

**Step 4: Write minimal implementation**

```typescript
// src/lib/pdf/pdf-service.ts
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

export class PdfService {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
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
    }
  }

  async close(): Promise<void> {
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
```

**Step 5: Run test to verify it passes**

Run: `npm test src/lib/pdf/pdf-service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/pdf/pdf-service.ts src/lib/pdf/pdf-service.test.ts package.json package-lock.json
git commit -m "feat: add PDF service with Puppeteer for HTML-to-PDF generation"
```

---

## Task 4.2: Quote PDF Template

**Files:**
- Create: `src/lib/pdf/quote-template.ts`
- Create: `src/lib/pdf/quote-template.test.ts`

**Step 1: Write failing test for quote template generation**

```typescript
// src/lib/pdf/quote-template.test.ts
import { describe, it, expect } from 'vitest';
import { generateQuoteHtml, QuoteDataForPdf } from './quote-template';

describe('Quote PDF Template', () => {
  const mockQuoteData: QuoteDataForPdf = {
    quote: {
      quoteNumber: 'BTS-2026-0001',
      subject: 'Yangın Algılama Sistemi',
      createdAt: new Date('2026-01-15'),
      validUntil: new Date('2026-02-15'),
      currency: 'EUR',
      notes: 'Montaj dahildir.',
    },
    company: {
      name: 'ABC İnşaat A.Ş.',
      address: 'İstanbul, Türkiye',
      taxId: '1234567890',
    },
    project: {
      name: 'Merkez Ofis Binası',
      location: 'Maslak, İstanbul',
    },
    items: [
      {
        itemType: 'HEADER',
        description: 'Algılama Ekipmanları',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        discountPct: 0,
        totalPrice: 0,
        vatRate: 0,
      },
      {
        itemType: 'PRODUCT',
        code: 'SD-001',
        brand: 'Siemens',
        description: 'Duman Dedektörü',
        quantity: 50,
        unit: 'Adet',
        unitPrice: 85.50,
        discountPct: 10,
        totalPrice: 3847.50,
        vatRate: 20,
      },
    ],
    totals: {
      subtotal: 3847.50,
      totalDiscount: 427.50,
      totalVat: 769.50,
      grandTotal: 4617.00,
    },
    commercialTerms: [
      { category: 'payment', content: 'Sipariş ile %50, teslimde %50' },
      { category: 'delivery', content: '4-6 hafta' },
    ],
  };

  describe('generateQuoteHtml', () => {
    it('generates valid HTML with quote number', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('BTS-2026-0001');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('includes company information', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('ABC İnşaat A.Ş.');
      expect(html).toContain('1234567890');
    });

    it('includes project information', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Merkez Ofis Binası');
      expect(html).toContain('Maslak, İstanbul');
    });

    it('renders product items with pricing', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Duman Dedektörü');
      expect(html).toContain('Siemens');
      expect(html).toContain('50');
    });

    it('renders header items without pricing columns', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Algılama Ekipmanları');
    });

    it('includes totals section', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('4.617');  // grandTotal formatted
    });

    it('includes commercial terms', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Sipariş ile %50');
      expect(html).toContain('4-6 hafta');
    });

    it('formats dates in Turkish locale', () => {
      const html = generateQuoteHtml(mockQuoteData);

      // Turkish date format: 15 Ocak 2026 or 15.01.2026
      expect(html).toMatch(/15[.\s]*(Ocak|01)[.\s]*2026/i);
    });

    it('formats currency correctly for EUR', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('€');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/lib/pdf/quote-template.test.ts`
Expected: FAIL with "Cannot find module './quote-template'"

**Step 3: Write minimal implementation**

```typescript
// src/lib/pdf/quote-template.ts
export interface QuoteDataForPdf {
  quote: {
    quoteNumber: string;
    subject?: string | null;
    createdAt: Date;
    validUntil?: Date | null;
    currency: string;
    notes?: string | null;
  };
  company: {
    name: string;
    address?: string | null;
    taxId?: string | null;
  };
  project?: {
    name: string;
    location?: string | null;
  } | null;
  items: QuoteItemForPdf[];
  totals: {
    subtotal: number;
    totalDiscount: number;
    totalVat: number;
    grandTotal: number;
  };
  commercialTerms: {
    category: string;
    content: string;
  }[];
}

export interface QuoteItemForPdf {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM';
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discountPct: number;
  totalPrice: number;
  vatRate: number;
}

const currencySymbols: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  TRY: '₺',
};

function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency;
  return `${symbol}${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateQuoteHtml(data: QuoteDataForPdf): string {
  const { quote, company, project, items, totals, commercialTerms } = data;
  const currency = quote.currency;

  const itemRows = items.map((item, index) => {
    if (item.itemType === 'HEADER') {
      return `
        <tr class="header-row">
          <td colspan="8" class="header-cell">${escapeHtml(item.description)}</td>
        </tr>
      `;
    }
    if (item.itemType === 'NOTE') {
      return `
        <tr class="note-row">
          <td colspan="8" class="note-cell">${escapeHtml(item.description)}</td>
        </tr>
      `;
    }
    return `
      <tr class="product-row">
        <td class="center">${index + 1}</td>
        <td>${item.code || ''}</td>
        <td>${item.brand || ''}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="center">${item.quantity}</td>
        <td class="center">${item.unit || 'Adet'}</td>
        <td class="right">${formatCurrency(item.unitPrice, currency)}</td>
        <td class="right">${formatCurrency(item.totalPrice, currency)}</td>
      </tr>
    `;
  }).join('');

  const termsHtml = commercialTerms.map(term => {
    const categoryLabels: Record<string, string> = {
      payment: 'Ödeme Koşulları',
      delivery: 'Teslim Süresi',
      warranty: 'Garanti',
      vat: 'KDV',
      teslim_yeri: 'Teslim Yeri',
    };
    return `
      <div class="term">
        <strong>${categoryLabels[term.category] || term.category}:</strong> ${escapeHtml(term.content)}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Teklif - ${escapeHtml(quote.quoteNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      line-height: 1.4;
    }

    .container {
      padding: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #dc2626;
    }

    .logo {
      font-size: 24pt;
      font-weight: 700;
      color: #dc2626;
    }

    .quote-info {
      text-align: right;
    }

    .quote-number {
      font-size: 14pt;
      font-weight: 600;
      color: #dc2626;
      margin-bottom: 5px;
    }

    .quote-date {
      color: #666;
    }

    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 30px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 8pt;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
    }

    .party-name {
      font-size: 12pt;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .subject {
      background: #f8f8f8;
      padding: 15px;
      margin-bottom: 20px;
      border-left: 3px solid #dc2626;
    }

    .subject-label {
      font-size: 8pt;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
    }

    .subject-text {
      font-weight: 500;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    th {
      background: #1a1a1a;
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-weight: 500;
      font-size: 9pt;
    }

    td {
      padding: 8px;
      border-bottom: 1px solid #eee;
    }

    .center { text-align: center; }
    .right { text-align: right; }

    .header-row td {
      background: #f3f4f6;
      font-weight: 600;
      padding: 10px 8px;
    }

    .header-cell {
      font-weight: 600;
    }

    .note-row td {
      font-style: italic;
      color: #666;
    }

    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }

    .totals-table {
      width: 300px;
    }

    .totals-table td {
      padding: 8px 12px;
    }

    .totals-table .label {
      text-align: left;
    }

    .totals-table .value {
      text-align: right;
      font-weight: 500;
    }

    .totals-table .grand-total {
      background: #dc2626;
      color: white;
      font-weight: 700;
      font-size: 12pt;
    }

    .terms {
      margin-bottom: 30px;
    }

    .terms-title {
      font-weight: 600;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }

    .term {
      margin-bottom: 8px;
    }

    .notes {
      background: #fffbeb;
      padding: 15px;
      border-left: 3px solid #f59e0b;
    }

    .notes-title {
      font-weight: 600;
      margin-bottom: 5px;
    }

    .validity {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 9pt;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">BTS</div>
      <div class="quote-info">
        <div class="quote-number">${escapeHtml(quote.quoteNumber)}</div>
        <div class="quote-date">Tarih: ${formatDate(quote.createdAt)}</div>
        ${quote.validUntil ? `<div class="quote-date">Geçerlilik: ${formatDate(quote.validUntil)}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Müşteri</div>
        <div class="party-name">${escapeHtml(company.name)}</div>
        ${company.address ? `<div>${escapeHtml(company.address)}</div>` : ''}
        ${company.taxId ? `<div>VKN: ${escapeHtml(company.taxId)}</div>` : ''}
      </div>
      ${project ? `
        <div class="party">
          <div class="party-label">Proje</div>
          <div class="party-name">${escapeHtml(project.name)}</div>
          ${project.location ? `<div>${escapeHtml(project.location)}</div>` : ''}
        </div>
      ` : ''}
    </div>

    ${quote.subject ? `
      <div class="subject">
        <div class="subject-label">Konu</div>
        <div class="subject-text">${escapeHtml(quote.subject)}</div>
      </div>
    ` : ''}

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 30px">#</th>
          <th style="width: 80px">Kod</th>
          <th style="width: 80px">Marka</th>
          <th>Açıklama</th>
          <th class="center" style="width: 50px">Miktar</th>
          <th class="center" style="width: 50px">Birim</th>
          <th class="right" style="width: 80px">B.Fiyat</th>
          <th class="right" style="width: 100px">Toplam</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr>
          <td class="label">Ara Toplam</td>
          <td class="value">${formatCurrency(totals.subtotal, currency)}</td>
        </tr>
        ${totals.totalDiscount > 0 ? `
          <tr>
            <td class="label">İskonto</td>
            <td class="value">-${formatCurrency(totals.totalDiscount, currency)}</td>
          </tr>
        ` : ''}
        <tr>
          <td class="label">KDV</td>
          <td class="value">${formatCurrency(totals.totalVat, currency)}</td>
        </tr>
        <tr class="grand-total">
          <td class="label">Genel Toplam</td>
          <td class="value">${formatCurrency(totals.grandTotal, currency)}</td>
        </tr>
      </table>
    </div>

    ${commercialTerms.length > 0 ? `
      <div class="terms">
        <div class="terms-title">Ticari Koşullar</div>
        ${termsHtml}
      </div>
    ` : ''}

    ${quote.notes ? `
      <div class="notes">
        <div class="notes-title">Notlar</div>
        <div>${escapeHtml(quote.notes)}</div>
      </div>
    ` : ''}

    ${quote.validUntil ? `
      <div class="validity">
        Bu teklif ${formatDate(quote.validUntil)} tarihine kadar geçerlidir.
      </div>
    ` : ''}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test src/lib/pdf/quote-template.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pdf/quote-template.ts src/lib/pdf/quote-template.test.ts
git commit -m "feat: add quote PDF HTML template with Turkish localization"
```

---

## Task 4.3: PDF Export API Route

**Files:**
- Create: `src/app/api/quotes/[id]/export/pdf/route.ts`
- Modify: `src/components/quotes/quote-detail-header.tsx` (connect button)

**Step 1: Write the API route**

```typescript
// src/app/api/quotes/[id]/export/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getPdfService } from '@/lib/pdf/pdf-service';
import { generateQuoteHtml, QuoteDataForPdf } from '@/lib/pdf/quote-template';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Fetch quote with all related data
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Calculate totals
    const productItems = quote.items.filter(item => item.itemType === 'PRODUCT');
    const subtotal = productItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const totalDiscount = productItems.reduce((sum, item) => {
      const beforeDiscount = Number(item.quantity) * Number(item.unitPrice);
      return sum + (beforeDiscount - Number(item.totalPrice));
    }, 0);
    const totalVat = productItems.reduce((sum, item) => {
      return sum + (Number(item.totalPrice) * Number(item.vatRate) / 100);
    }, 0);
    const grandTotal = subtotal + totalVat;

    // Prepare data for template
    const pdfData: QuoteDataForPdf = {
      quote: {
        quoteNumber: quote.quoteNumber,
        subject: quote.subject,
        createdAt: quote.createdAt,
        validUntil: quote.validUntil,
        currency: quote.currency,
        notes: quote.notes,
      },
      company: {
        name: quote.company.name,
        address: quote.company.address,
        taxId: quote.company.taxId,
      },
      project: quote.project ? {
        name: quote.project.name,
        location: quote.project.location,
      } : null,
      items: quote.items.map(item => ({
        itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
        code: item.code,
        brand: item.brand,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        discountPct: Number(item.discountPct),
        totalPrice: Number(item.totalPrice),
        vatRate: Number(item.vatRate),
      })),
      totals: {
        subtotal,
        totalDiscount,
        totalVat,
        grandTotal,
      },
      commercialTerms: quote.commercialTerms.map(term => ({
        category: term.category,
        content: term.content,
      })),
    };

    // Generate HTML and PDF
    const html = generateQuoteHtml(pdfData);
    const pdfService = getPdfService();
    const pdfBuffer = await pdfService.generatePdf(html);

    // Return PDF as download
    const filename = `${quote.quoteNumber}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'PDF oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
```

**Step 2: Update the UI button handler**

Find the PDF button in `src/components/quotes/quote-detail-header.tsx` and connect it:

```typescript
// Add this handler function
const handleExportPdf = async () => {
  try {
    const response = await fetch(`/api/quotes/${quote.id}/export/pdf`);
    if (!response.ok) {
      throw new Error('PDF oluşturulamadı');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.quoteNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('PDF export error:', error);
    // Show error toast
  }
};

// Connect to the button onClick
<Button onClick={handleExportPdf}>
  <FileText className="h-4 w-4 mr-2" />
  PDF
</Button>
```

**Step 3: Test manually**

Run: `npm run dev`
Navigate to a quote detail page and click the PDF button.
Expected: PDF downloads with quote data.

**Step 4: Commit**

```bash
git add src/app/api/quotes/[id]/export/pdf/route.ts src/components/quotes/quote-detail-header.tsx
git commit -m "feat: add PDF export API route and connect UI button"
```

---

## Task 4.4: Excel Service Foundation

**Files:**
- Create: `src/lib/excel/excel-service.ts`
- Create: `src/lib/excel/excel-service.test.ts`
- Modify: `package.json` (add exceljs dependency)

**Step 1: Install ExcelJS**

Run:
```bash
npm install exceljs
```

**Step 2: Write failing test for Excel service**

```typescript
// src/lib/excel/excel-service.test.ts
import { describe, it, expect } from 'vitest';
import { ExcelService, QuoteDataForExcel } from './excel-service';
import ExcelJS from 'exceljs';

describe('ExcelService', () => {
  const mockQuoteData: QuoteDataForExcel = {
    quoteNumber: 'BTS-2026-0001',
    subject: 'Yangın Algılama Sistemi',
    date: '15.01.2026',
    validUntil: '15.02.2026',
    currency: 'EUR',
    company: 'ABC İnşaat A.Ş.',
    project: 'Merkez Ofis',
    items: [
      {
        itemType: 'HEADER',
        description: 'Algılama Ekipmanları',
      },
      {
        itemType: 'PRODUCT',
        code: 'SD-001',
        brand: 'Siemens',
        description: 'Duman Dedektörü',
        quantity: 50,
        unit: 'Adet',
        listPrice: 95,
        katsayi: 0.9,
        unitPrice: 85.5,
        discountPct: 10,
        totalPrice: 3847.5,
        vatRate: 20,
      },
    ],
    totals: {
      subtotal: 3847.5,
      totalVat: 769.5,
      grandTotal: 4617,
    },
  };

  describe('generateExcel', () => {
    it('generates valid Excel buffer', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('creates workbook with Quote sheet', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      // Read the buffer back to verify content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      expect(workbook.worksheets.length).toBeGreaterThan(0);
      const sheet = workbook.getWorksheet('Teklif');
      expect(sheet).toBeDefined();
    });

    it('includes quote header information', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // Check that quote number is in the sheet
      let foundQuoteNumber = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('BTS-2026-0001')) {
            foundQuoteNumber = true;
          }
        });
      });
      expect(foundQuoteNumber).toBe(true);
    });

    it('includes item data', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundProduct = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('Duman Dedektörü')) {
            foundProduct = true;
          }
        });
      });
      expect(foundProduct).toBe(true);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test src/lib/excel/excel-service.test.ts`
Expected: FAIL with "Cannot find module './excel-service'"

**Step 4: Write minimal implementation**

```typescript
// src/lib/excel/excel-service.ts
import ExcelJS from 'exceljs';

export interface QuoteItemForExcel {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM';
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity?: number;
  unit?: string | null;
  listPrice?: number;
  katsayi?: number;
  unitPrice?: number;
  discountPct?: number;
  totalPrice?: number;
  vatRate?: number;
}

export interface QuoteDataForExcel {
  quoteNumber: string;
  subject?: string | null;
  date: string;
  validUntil?: string | null;
  currency: string;
  company: string;
  project?: string | null;
  items: QuoteItemForExcel[];
  totals: {
    subtotal: number;
    totalVat: number;
    grandTotal: number;
  };
}

export class ExcelService {
  async generateQuoteExcel(data: QuoteDataForExcel): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Teklif');

    // Set column widths
    sheet.columns = [
      { key: 'no', width: 5 },
      { key: 'code', width: 12 },
      { key: 'brand', width: 12 },
      { key: 'description', width: 40 },
      { key: 'quantity', width: 10 },
      { key: 'unit', width: 8 },
      { key: 'listPrice', width: 12 },
      { key: 'katsayi', width: 8 },
      { key: 'unitPrice', width: 12 },
      { key: 'discountPct', width: 8 },
      { key: 'totalPrice', width: 15 },
    ];

    // Header section
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Teklif: ${data.quoteNumber}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.getCell('A3').value = 'Müşteri:';
    sheet.getCell('B3').value = data.company;
    sheet.getCell('A4').value = 'Proje:';
    sheet.getCell('B4').value = data.project || '-';
    sheet.getCell('A5').value = 'Tarih:';
    sheet.getCell('B5').value = data.date;
    sheet.getCell('A6').value = 'Geçerlilik:';
    sheet.getCell('B6').value = data.validUntil || '-';

    if (data.subject) {
      sheet.getCell('A7').value = 'Konu:';
      sheet.getCell('B7').value = data.subject;
    }

    // Table headers
    const headerRow = 9;
    const headers = ['#', 'Kod', 'Marka', 'Açıklama', 'Miktar', 'Birim', 'Liste Fiyatı', 'Katsayı', 'B.Fiyat', 'İsk.%', 'Toplam'];
    headers.forEach((header, index) => {
      const cell = sheet.getCell(headerRow, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Items
    let currentRow = headerRow + 1;
    let itemNumber = 0;

    data.items.forEach((item) => {
      if (item.itemType === 'HEADER') {
        sheet.mergeCells(`A${currentRow}:K${currentRow}`);
        const cell = sheet.getCell(`A${currentRow}`);
        cell.value = item.description;
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
      } else if (item.itemType === 'NOTE') {
        sheet.mergeCells(`A${currentRow}:K${currentRow}`);
        const cell = sheet.getCell(`A${currentRow}`);
        cell.value = item.description;
        cell.font = { italic: true };
      } else {
        itemNumber++;
        sheet.getCell(currentRow, 1).value = itemNumber;
        sheet.getCell(currentRow, 2).value = item.code || '';
        sheet.getCell(currentRow, 3).value = item.brand || '';
        sheet.getCell(currentRow, 4).value = item.description;
        sheet.getCell(currentRow, 5).value = item.quantity;
        sheet.getCell(currentRow, 6).value = item.unit || 'Adet';
        sheet.getCell(currentRow, 7).value = item.listPrice;
        sheet.getCell(currentRow, 8).value = item.katsayi;
        sheet.getCell(currentRow, 9).value = item.unitPrice;
        sheet.getCell(currentRow, 10).value = item.discountPct;
        sheet.getCell(currentRow, 11).value = item.totalPrice;

        // Format number cells
        [7, 9, 11].forEach(col => {
          sheet.getCell(currentRow, col).numFmt = '#,##0.00';
        });
        [8, 10].forEach(col => {
          sheet.getCell(currentRow, col).numFmt = '0.00';
        });
      }
      currentRow++;
    });

    // Totals section
    currentRow += 1;
    sheet.getCell(currentRow, 10).value = 'Ara Toplam:';
    sheet.getCell(currentRow, 11).value = data.totals.subtotal;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';

    currentRow++;
    sheet.getCell(currentRow, 10).value = 'KDV:';
    sheet.getCell(currentRow, 11).value = data.totals.totalVat;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';

    currentRow++;
    sheet.getCell(currentRow, 10).value = 'Genel Toplam:';
    sheet.getCell(currentRow, 10).font = { bold: true };
    sheet.getCell(currentRow, 11).value = data.totals.grandTotal;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';
    sheet.getCell(currentRow, 11).font = { bold: true };
    sheet.getCell(currentRow, 11).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' },
    };
    sheet.getCell(currentRow, 11).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

// Singleton
let excelServiceInstance: ExcelService | null = null;

export function getExcelService(): ExcelService {
  if (!excelServiceInstance) {
    excelServiceInstance = new ExcelService();
  }
  return excelServiceInstance;
}
```

**Step 5: Run test to verify it passes**

Run: `npm test src/lib/excel/excel-service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/excel/excel-service.ts src/lib/excel/excel-service.test.ts package.json package-lock.json
git commit -m "feat: add Excel service with ExcelJS for quote export"
```

---

## Task 4.5: Excel Export API Route

**Files:**
- Create: `src/app/api/quotes/[id]/export/excel/route.ts`
- Modify: `src/components/quotes/quote-detail-header.tsx` (connect Excel button)

**Step 1: Write the API route**

```typescript
// src/app/api/quotes/[id]/export/excel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getExcelService, QuoteDataForExcel } from '@/lib/excel/excel-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Calculate totals
    const productItems = quote.items.filter(item => item.itemType === 'PRODUCT');
    const subtotal = productItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const totalVat = productItems.reduce((sum, item) => {
      return sum + (Number(item.totalPrice) * Number(item.vatRate) / 100);
    }, 0);
    const grandTotal = subtotal + totalVat;

    // Format date
    const formatDate = (date: Date) => date.toLocaleDateString('tr-TR');

    const excelData: QuoteDataForExcel = {
      quoteNumber: quote.quoteNumber,
      subject: quote.subject,
      date: formatDate(quote.createdAt),
      validUntil: quote.validUntil ? formatDate(quote.validUntil) : null,
      currency: quote.currency,
      company: quote.company.name,
      project: quote.project?.name || null,
      items: quote.items.map(item => ({
        itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
        code: item.code,
        brand: item.brand,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        listPrice: Number(item.listPrice),
        katsayi: Number(item.katsayi),
        unitPrice: Number(item.unitPrice),
        discountPct: Number(item.discountPct),
        totalPrice: Number(item.totalPrice),
        vatRate: Number(item.vatRate),
      })),
      totals: {
        subtotal,
        totalVat,
        grandTotal,
      },
    };

    const excelService = getExcelService();
    const buffer = await excelService.generateQuoteExcel(excelData);

    const filename = `${quote.quoteNumber}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Excel export error:', error);
    return NextResponse.json(
      { error: 'Excel oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
```

**Step 2: Update the UI button handler**

Add to `src/components/quotes/quote-detail-header.tsx`:

```typescript
const handleExportExcel = async () => {
  try {
    const response = await fetch(`/api/quotes/${quote.id}/export/excel`);
    if (!response.ok) {
      throw new Error('Excel oluşturulamadı');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.quoteNumber}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Excel export error:', error);
    // Show error toast
  }
};

// Connect to the button onClick
<Button onClick={handleExportExcel}>
  <FileSpreadsheet className="h-4 w-4 mr-2" />
  Excel
</Button>
```

**Step 3: Test manually**

Run: `npm run dev`
Navigate to a quote detail page and click the Excel button.
Expected: Excel file downloads with quote data.

**Step 4: Commit**

```bash
git add src/app/api/quotes/[id]/export/excel/route.ts src/components/quotes/quote-detail-header.tsx
git commit -m "feat: add Excel export API route and connect UI button"
```

---

## Task 4.6: Run All Tests and Final Verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass, including new PDF and Excel tests.

**Step 2: Manual end-to-end test**

1. Start dev server: `npm run dev`
2. Navigate to a quote with items
3. Click PDF button - should download formatted PDF
4. Click Excel button - should download Excel with all data
5. Verify Turkish characters display correctly in both formats

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 4 - PDF and Excel export functionality"
```

---

## Summary

Phase 4 implements:
- **PdfService**: Puppeteer-based HTML-to-PDF generation
- **Quote PDF Template**: Professional Turkish-localized HTML template
- **ExcelService**: ExcelJS-based spreadsheet generation
- **API Routes**: `/api/quotes/[id]/export/pdf` and `/api/quotes/[id]/export/excel`
- **UI Integration**: Connected export buttons in quote detail header

All exports include:
- Quote header info (number, date, validity)
- Company and project details
- Item table with headers, products, notes
- Calculated totals with VAT
- Turkish number/date formatting
- Proper currency symbols
