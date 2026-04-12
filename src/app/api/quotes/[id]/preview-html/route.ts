import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateQuoteHtml } from '@/lib/pdf/quote-template';
import { assembleQuoteDataForPdf, canAccessQuoteForExport } from '@/lib/pdf/assemble-quote-data';
import { sanitizePdfHtml } from '@/lib/pdf/sanitize-html';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Returns the raw HTML of the quote's PDF template (same as what's
 * rendered by the Puppeteer PDF export). Used by the WYSIWYG preview
 * editor to show an editable version of the quote.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Fetch auth metadata + any saved override
    const quoteMeta = await db.quote.findUnique({
      where: { id: quoteId },
      select: {
        createdById: true,
        pdfOverrideHtml: true,
        pdfOverrideAt: true,
        updatedAt: true,
      },
    });
    if (!quoteMeta) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }
    if (!canAccessQuoteForExport(quoteMeta, user)) {
      return NextResponse.json(
        { error: 'Bu teklifi görüntüleme yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    // If a saved override exists, check for staleness and sanitize on read
    if (quoteMeta.pdfOverrideHtml) {
      const isStale = quoteMeta.pdfOverrideAt
        ? quoteMeta.pdfOverrideAt < quoteMeta.updatedAt
        : false;

      // Sanitize again on read (defense-in-depth)
      const sanitized = sanitizePdfHtml(quoteMeta.pdfOverrideHtml);

      return new NextResponse(sanitized, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:",
          'X-Content-Type-Options': 'nosniff',
          'X-Pdf-Override': 'true',
          'X-Pdf-Override-At': quoteMeta.pdfOverrideAt?.toISOString() || '',
          'X-Pdf-Override-Stale': isStale ? 'true' : 'false',
        },
      });
    }

    const pdfData = await assembleQuoteDataForPdf(quoteId);
    if (!pdfData) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    const html = generateQuoteHtml(pdfData);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Preview HTML error:', error);
    return NextResponse.json(
      { error: 'Önizleme oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
