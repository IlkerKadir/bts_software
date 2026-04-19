/**
 * Shared helper for assembling QuoteDataForPdf from the database.
 * Used by both the PDF export route and the preview/editor routes.
 */
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import type { QuoteDataForPdf } from '@/lib/pdf/quote-template';
import { convertToQuoteCurrency, type QuoteCurrencyContext } from '@/lib/quote-calculations';

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

  // Build a currency context only when the quote has at least one
  // SET row with a non-null currency override. Without mixed-currency
  // SETs, every item already sits in the quote's currency and the
  // section-sum helper reads the raw `totalPrice` as before.
  const hasMixedCurrency = quote.items.some(
    (i) => i.currency && i.currency !== quote.currency
  );
  let ctx: QuoteCurrencyContext | undefined;
  if (hasMixedCurrency) {
    const protectionPct = Number(quote.protectionPct || 0);
    const protectedRate = Number(quote.exchangeRate || 1);
    const baseForeignRate = protectionPct > 0
      ? protectedRate / (1 + protectionPct / 100)
      : protectedRate;
    ctx = { quoteCurrency: quote.currency, baseForeignRate };
  }

  // Map item to PDF format
  const mapItemForPdf = (item: typeof quote.items[0]) => {
    const meta = item.serviceMeta as Record<string, unknown> | null;
    const headerColor = meta && typeof meta.headerColor === 'string' ? meta.headerColor : undefined;
    const customPozNo = meta && typeof meta.customPozNo === 'string' ? meta.customPozNo : undefined;

    const rawTotal = Number(item.totalPrice);
    // For section-sum aggregation the PDF template needs the total in
    // quote currency. We pre-compute it here once per item so the
    // template stays pure.
    let totalPriceInQuoteCurrency: number | undefined;
    if (ctx && item.currency && item.currency !== ctx.quoteCurrency) {
      totalPriceInQuoteCurrency = convertToQuoteCurrency(rawTotal, item.currency, ctx);
    }

    return {
      id: item.id,
      itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL',
      code: item.code,
      brand: item.brand,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
      totalPrice: rawTotal,
      vatRate: Number(item.vatRate),
      headerColor,
      customPozNo,
      priceLabel: item.priceLabel,
      currency: item.currency ?? null,
      totalPriceInQuoteCurrency,
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
