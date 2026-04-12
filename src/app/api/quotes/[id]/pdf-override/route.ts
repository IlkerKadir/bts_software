import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
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
 * POST — save a cosmetic PDF override for this quote. The client sends
 * only the editable fragments; the server regenerates the full template
 * from the current quote data and splices them in. This guarantees the
 * stored override is always a valid, fully-formed quote HTML — no client
 * serialization quirk can corrupt the banner image, colgroup, or styles.
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
      select: { createdById: true },
    });
    if (!quoteMeta) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }
    if (!canAccessQuoteForExport(quoteMeta, user)) {
      return NextResponse.json(
        { error: 'Bu teklifi düzenleme yetkiniz bulunmamaktadır' },
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
    const finalHtml = applyPdfEdits(templateHtml, edits);

    // Save without bumping the quote's updatedAt (cosmetic change only).
    // Using raw SQL so Prisma's @updatedAt doesn't trigger.
    await db.$executeRaw`
      UPDATE "Quote"
      SET "pdfOverrideHtml" = ${finalHtml}, "pdfOverrideAt" = NOW()
      WHERE "id" = ${quoteId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PDF override save error:', error);
    return NextResponse.json(
      { error: 'Kaydedilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

/**
 * DELETE — remove the saved PDF override, reverting to the auto-generated version.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quoteMeta = await db.quote.findUnique({
      where: { id: quoteId },
      select: { createdById: true },
    });
    if (!quoteMeta) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }
    if (!canAccessQuoteForExport(quoteMeta, user)) {
      return NextResponse.json(
        { error: 'Bu teklifi düzenleme yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    await db.$executeRaw`
      UPDATE "Quote"
      SET "pdfOverrideHtml" = NULL, "pdfOverrideAt" = NULL
      WHERE "id" = ${quoteId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PDF override delete error:', error);
    return NextResponse.json(
      { error: 'Sıfırlanırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
