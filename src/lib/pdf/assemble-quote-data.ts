/**
 * Shared helper for assembling QuoteDataForPdf from the database.
 * Used by both the PDF export route and the preview/editor routes.
 */
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import type { QuoteDataForPdf } from '@/lib/pdf/quote-template';

function loadImageBase64(relativePath: string): string | undefined {
  try {
    const filePath = path.join(process.cwd(), relativePath);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a quote from the database and return its data in the format
 * expected by `generateQuoteHtml()`. Returns null if the quote is not found.
 * Does NOT perform authorization — caller is responsible for that.
 */
export async function assembleQuoteDataForPdf(quoteId: string): Promise<QuoteDataForPdf | null> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      company: true,
      project: true,
      items: {
        include: { product: true },
        orderBy: { sortOrder: 'asc' },
      },
      commercialTerms: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!quote) return null;

  // Use the quote's persisted totals
  const subtotal = Number(quote.subtotal);
  const totalDiscount = Number(quote.discountTotal);
  const totalVat = Number(quote.vatTotal);
  const grandTotal = Number(quote.grandTotal);

  // Separate NOTLAR from commercial terms for the legacy notes array
  const notlarTerms = quote.commercialTerms.filter(term => term.category === 'NOTLAR');
  const allTerms = quote.commercialTerms;

  // Map item to PDF format
  const mapItemForPdf = (item: typeof quote.items[0]) => {
    const meta = item.serviceMeta as Record<string, unknown> | null;
    const headerColor = meta && typeof meta.headerColor === 'string' ? meta.headerColor : undefined;
    const customPozNo = meta && typeof meta.customPozNo === 'string' ? meta.customPozNo : undefined;

    return {
      itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL',
      code: item.code,
      brand: item.brand,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      totalPrice: Number(item.totalPrice),
      vatRate: Number(item.vatRate),
      headerColor,
      customPozNo,
      priceLabel: item.priceLabel,
    };
  };

  // All items except sub-items go into the PDF
  const mainItems = quote.items.filter(item => !item.parentItemId);

  // Load header banner image
  const headerBase64 = loadImageBase64('public/header/BTS_teklif_form.png') || loadImageBase64('pdf/header/BTS_teklif_form.png');
  const logoBase64 = headerBase64 ? undefined : loadImageBase64('public/btslogo.png');

  return {
    quote: {
      quoteNumber: quote.quoteNumber,
      refNo: quote.refNo,
      subject: quote.subject,
      createdAt: quote.createdAt,
      validUntil: quote.validUntil,
      currency: quote.currency,
      language: quote.language,
      notes: quote.notes,
    },
    description: quote.description,
    company: {
      name: quote.company.name,
      address: quote.company.address,
      taxId: quote.company.taxNumber,
    },
    project: quote.project ? {
      name: quote.project.name,
      location: null,
    } : null,
    items: mainItems.map(item => mapItemForPdf(item)),
    totals: {
      subtotal,
      totalDiscount,
      totalVat,
      grandTotal,
    },
    commercialTerms: allTerms.map(term => ({
      category: term.category,
      content: term.value,
      highlight: term.highlight,
    })),
    notes: notlarTerms.map(term => ({
      text: term.value,
      sortOrder: term.sortOrder,
      highlight: term.highlight,
    })),
    discountPct: Number(quote.discountPct),
    discountLabel: (() => {
      const pm = quote.protectionMap as Record<string, unknown> | null;
      return typeof pm?.__discountLabel === 'string' ? pm.__discountLabel : 'İskonto';
    })(),
    headerBase64,
    logoBase64,
  };
}

/**
 * Authorization check shared between PDF and preview routes.
 * Returns true if the user can export/preview the quote.
 */
export function canAccessQuoteForExport(
  quote: { createdById: string },
  user: { id: string; role: { canExport: boolean } }
): boolean {
  return quote.createdById === user.id || user.role.canExport;
}
