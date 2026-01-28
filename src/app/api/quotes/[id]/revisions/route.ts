import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/quotes/[id]/revisions
 * Returns all revisions of a quote (including the quote itself and all parent/child versions)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    // Get the quote to check if it exists and get its version info
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        quoteNumber: true,
        version: true,
        parentQuoteId: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Find the root quote (the original version without a parent)
    let rootQuoteId = quote.id;
    let currentQuote = quote;

    // Walk up the parent chain to find the root
    while (currentQuote.parentQuoteId) {
      const parent = await db.quote.findUnique({
        where: { id: currentQuote.parentQuoteId },
        select: {
          id: true,
          parentQuoteId: true,
        },
      });
      if (!parent) break;
      rootQuoteId = parent.id;
      currentQuote = parent as typeof quote;
    }

    // Get all revisions - the root and all its descendants
    // We need to get all quotes that share the same quoteNumber base
    const revisions = await db.quote.findMany({
      where: {
        OR: [
          { id: rootQuoteId },
          { parentQuoteId: rootQuoteId },
          // Also include any quotes that have this quote as a parent (children)
          { parentQuoteId: quote.id },
        ],
      },
      select: {
        id: true,
        quoteNumber: true,
        version: true,
        status: true,
        grandTotal: true,
        currency: true,
        parentQuoteId: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { version: 'desc' },
    });

    // If we only got one or zero revisions, try to get the full chain another way
    // Get all quotes with the same base quote number
    const baseQuoteNumber = quote.quoteNumber.split('-R')[0];
    const allRelatedQuotes = await db.quote.findMany({
      where: {
        quoteNumber: {
          startsWith: baseQuoteNumber,
        },
      },
      select: {
        id: true,
        quoteNumber: true,
        version: true,
        status: true,
        grandTotal: true,
        currency: true,
        parentQuoteId: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { version: 'desc' },
    });

    // Use whichever set has more revisions
    const finalRevisions = allRelatedQuotes.length > revisions.length
      ? allRelatedQuotes
      : revisions;

    return NextResponse.json({
      revisions: finalRevisions,
      currentVersion: quote.version,
      currentQuoteId: quote.id,
    });
  } catch (error) {
    console.error('Revisions GET error:', error);
    return NextResponse.json(
      { error: 'Revizyon listesi alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
