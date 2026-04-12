import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getPdfService } from '@/lib/pdf/pdf-service';
import { assembleQuoteDataForPdf, canAccessQuoteForExport } from '@/lib/pdf/assemble-quote-data';
import { generateQuoteHtml } from '@/lib/pdf/quote-template';
import { applyPdfEdits, type PdfEdits } from '@/lib/pdf/apply-pdf-edits';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FRAGMENT_LENGTH = 500_000;

function validateEdits(body: unknown): PdfEdits | null {
  if (!body || typeof body !== 'object') return null;
  const edits = body as Record<string, unknown>;
  const out: PdfEdits = {};
  for (const key of ['tbodyHtml', 'infoLeftHtml', 'infoRightHtml', 'colgroupHtml'] as const) {
    const val = edits[key];
    if (val === undefined) continue;
    if (typeof val !== 'string' || val.length > MAX_FRAGMENT_LENGTH) return null;
    out[key] = val;
  }
  return out;
}

/**
 * Render the quote to PDF with cosmetic edits from the WYSIWYG editor.
 * The client sends only the three editable regions (tbody, info-left,
 * info-right) and the server rebuilds the full document from a fresh
 * template, so structural parts (banner image, colgroup widths, `@page`
 * rules, style block) can never be corrupted by the client.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quoteMeta = await db.quote.findUnique({
      where: { id: quoteId },
      select: { createdById: true, quoteNumber: true },
    });
    if (!quoteMeta) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }
    if (!canAccessQuoteForExport(quoteMeta, user)) {
      return NextResponse.json(
        { error: 'Bu teklifi dışa aktarma yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const edits = validateEdits(body?.edits);
    if (!edits) {
      return NextResponse.json({ error: 'Geçersiz düzenleme verisi' }, { status: 400 });
    }

    const pdfData = await assembleQuoteDataForPdf(quoteId);
    if (!pdfData) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }
    const templateHtml = generateQuoteHtml(pdfData);
    const html = applyPdfEdits(templateHtml, edits);

    const pdfService = getPdfService();
    const pdfBuffer = await pdfService.generatePdf(html, { disableJs: true });

    const filename = `${quoteMeta.quoteNumber}-duzenlenmis.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF download error:', error);
    return NextResponse.json(
      { error: 'PDF oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
