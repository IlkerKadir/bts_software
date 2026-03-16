import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getPdfService } from '@/lib/pdf/pdf-service';
import { generateQuoteHtml, QuoteDataForPdf } from '@/lib/pdf/quote-template';
import fs from 'fs';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    // Authorization: user must be the quote creator OR have canExport permission
    if (quote.createdById !== user.id && !user.role.canExport) {
      return NextResponse.json(
        { error: 'Bu teklifi dışa aktarma yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    // Use the quote's persisted totals (computed by recalculateAndPersistQuoteTotals)
    const subtotal = Number(quote.subtotal);
    const totalDiscount = Number(quote.discountTotal);
    const totalVat = Number(quote.vatTotal);
    const grandTotal = Number(quote.grandTotal);

    // Separate NOTLAR from commercial terms for the legacy notes array
    const notlarTerms = quote.commercialTerms.filter(term => term.category === 'NOTLAR');
    // All terms (including NOTLAR) go through commercialTerms — the template handles grouping
    const allTerms = quote.commercialTerms;

    // Map item to PDF format
    const mapItemForPdf = (item: typeof quote.items[0]) => ({
      itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL',
      code: item.code,
      brand: item.brand,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      totalPrice: Number(item.totalPrice),
      vatRate: Number(item.vatRate),
    });

    // All items except sub-items (parentItemId set) go into the PDF
    const mainItems = quote.items.filter(item => !item.parentItemId);

    // Load header banner image (full header with logo + company info + badge)
    const headerBase64 = loadImageBase64('pdf/header/BTS_teklif_form.png');
    // Fallback: load just the logo if header banner not found
    const logoBase64 = headerBase64 ? undefined : loadImageBase64('public/btslogo.png');

    // Prepare data for template
    const pdfData: QuoteDataForPdf = {
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

    // Generate HTML and PDF
    const html = generateQuoteHtml(pdfData);
    const pdfService = getPdfService();
    const pdfBuffer = await pdfService.generatePdf(html);

    // Return PDF as download
    const filename = `${quote.quoteNumber}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
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
      { error: 'PDF olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
