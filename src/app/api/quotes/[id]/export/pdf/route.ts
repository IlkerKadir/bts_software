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
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    // Use the quote's persisted totals (computed by recalculateAndPersistQuoteTotals)
    const subtotal = Number(quote.subtotal);
    const totalDiscount = Number(quote.discountTotal);
    const totalVat = Number(quote.vatTotal);
    const grandTotal = Number(quote.grandTotal);

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
        taxId: quote.company.taxNumber,
      },
      project: quote.project ? {
        name: quote.project.name,
        location: null,
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
        content: term.value,
      })),
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
