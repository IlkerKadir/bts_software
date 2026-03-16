import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

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

    // Fetch the source quote with items, commercial terms, and ek maliyet
    const sourceQuote = await db.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        commercialTerms: { orderBy: { sortOrder: 'asc' } },
        ekMaliyetler: { orderBy: { sortOrder: 'asc' } },
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

    // Copy all QuoteItems (two passes: parent items first, then sub-items with remapped parentItemId)
    if (sourceQuote.items.length > 0) {
      const oldToNewId = new Map<string, string>();

      // First pass: create parent items (no parentItemId)
      const parentItems = sourceQuote.items.filter(item => !item.parentItemId);
      for (const item of parentItems) {
        const created = await db.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            code: item.code,
            brand: item.brand,
            model: item.model,
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
          },
        });
        oldToNewId.set(item.id, created.id);
      }

      // Second pass: create sub-items with remapped parentItemId
      const subItems = sourceQuote.items.filter(item => item.parentItemId);
      for (const item of subItems) {
        const newParentId = oldToNewId.get(item.parentItemId!);
        const created = await db.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            code: item.code,
            brand: item.brand,
            model: item.model,
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
            parentItemId: newParentId ?? null,
          },
        });
        oldToNewId.set(item.id, created.id);
      }
    }

    // Copy all QuoteCommercialTerms
    if (sourceQuote.commercialTerms.length > 0) {
      await db.quoteCommercialTerm.createMany({
        data: sourceQuote.commercialTerms.map((term) => ({
          quoteId: newQuote.id,
          category: term.category,
          value: term.value,
          sortOrder: term.sortOrder,
          highlight: term.highlight,
        })),
      });
    }

    // Copy QuoteEkMaliyet entries
    if (sourceQuote.ekMaliyetler.length > 0) {
      await db.quoteEkMaliyet.createMany({
        data: sourceQuote.ekMaliyetler.map((em) => ({
          quoteId: newQuote.id,
          title: em.title,
          amount: em.amount,
          sortOrder: em.sortOrder,
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

    // Get all revisions by matching the exact base quote number and its -R revisions
    const baseQuoteNumber = quote.quoteNumber.split('-R')[0];
    const revisions = await db.quote.findMany({
      where: {
        OR: [
          { quoteNumber: baseQuoteNumber },
          { quoteNumber: { startsWith: `${baseQuoteNumber}-R` } },
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

    return NextResponse.json({
      revisions,
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
