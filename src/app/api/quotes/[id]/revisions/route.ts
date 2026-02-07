import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/quotes/[id]/revisions
 * Creates a new revision of the quote (copies items + terms, increments version)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the source quote with items and commercial terms
    const sourceQuote = await db.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        commercialTerms: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!sourceQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Build revision quote number: BTS-2025-0001 -> BTS-2025-0001-R2
    const baseNumber = sourceQuote.quoteNumber.split('-R')[0];
    const nextVersion = sourceQuote.version + 1;
    const revisionNumber = `${baseNumber}-R${nextVersion}`;

    // Mark the current quote as REVIZYON status
    await db.quote.update({
      where: { id },
      data: { status: 'REVIZYON' },
    });

    // Create the new revision quote
    const newQuote = await db.quote.create({
      data: {
        quoteNumber: revisionNumber,
        companyId: sourceQuote.companyId,
        projectId: sourceQuote.projectId,
        subject: sourceQuote.subject,
        currency: sourceQuote.currency,
        exchangeRate: sourceQuote.exchangeRate,
        protectionPct: sourceQuote.protectionPct,
        subtotal: sourceQuote.subtotal,
        discountTotal: sourceQuote.discountTotal,
        discountPct: sourceQuote.discountPct,
        vatTotal: sourceQuote.vatTotal,
        grandTotal: sourceQuote.grandTotal,
        status: 'TASLAK',
        validityDays: sourceQuote.validityDays,
        version: nextVersion,
        parentQuoteId: sourceQuote.id,
        notes: sourceQuote.notes,
        language: sourceQuote.language,
        createdById: user.id,
      },
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    // Copy all QuoteItems
    if (sourceQuote.items.length > 0) {
      await db.quoteItem.createMany({
        data: sourceQuote.items.map((item, index) => ({
          quoteId: newQuote.id,
          productId: item.productId,
          itemType: item.itemType,
          sortOrder: index,
          code: item.code,
          brand: item.brand,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          listPrice: item.listPrice,
          katsayi: item.katsayi,
          unitPrice: item.unitPrice,
          discountPct: item.discountPct,
          vatRate: item.vatRate,
          totalPrice: item.totalPrice,
          notes: item.notes,
          isManualPrice: item.isManualPrice,
          costPrice: item.costPrice,
          serviceMeta: item.serviceMeta ?? undefined,
        })),
      });
    }

    // Copy all QuoteCommercialTerms
    if (sourceQuote.commercialTerms.length > 0) {
      await db.quoteCommercialTerm.createMany({
        data: sourceQuote.commercialTerms.map((term) => ({
          quoteId: newQuote.id,
          category: term.category,
          value: term.value,
          sortOrder: term.sortOrder,
        })),
      });
    }

    // Create QuoteHistory entry
    await db.quoteHistory.create({
      data: {
        quoteId: newQuote.id,
        userId: user.id,
        action: 'REVISION_CREATED',
        changes: {
          sourceQuoteId: sourceQuote.id,
          sourceQuoteNumber: sourceQuote.quoteNumber,
          version: nextVersion,
        },
      },
    });

    return NextResponse.json({ quote: newQuote }, { status: 201 });
  } catch (error) {
    console.error('Revision create error:', error);
    return NextResponse.json(
      { error: 'Revizyon oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
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
