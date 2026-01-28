import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const revertSchema = z.object({
  sourceQuoteId: z.string().min(1, 'Kaynak teklif ID gerekli'),
  note: z.string().optional(),
});

/**
 * POST /api/quotes/[id]/revert
 * Creates a new revision by copying data from a previous version
 * The new revision becomes a child of the current quote
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: currentQuoteId } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
    }

    const validation = revertSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { sourceQuoteId, note } = validation.data;

    // Get the current quote to verify it exists
    const currentQuote = await db.quote.findUnique({
      where: { id: currentQuoteId },
      select: {
        id: true,
        quoteNumber: true,
        version: true,
        status: true,
      },
    });

    if (!currentQuote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Get the source quote (the version to revert to) with all data
    const sourceQuote = await db.quote.findUnique({
      where: { id: sourceQuoteId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sourceQuote) {
      return NextResponse.json({ error: 'Kaynak teklif bulunamadı' }, { status: 404 });
    }

    // Create a new revision based on the source quote
    const newVersion = currentQuote.version + 1;
    const newQuoteNumber = `${currentQuote.quoteNumber.split('-R')[0]}-R${newVersion - 1}`;

    // Create the new quote in a transaction
    const newQuote = await db.$transaction(async (tx) => {
      // Create the new quote
      const quote = await tx.quote.create({
        data: {
          quoteNumber: newQuoteNumber,
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
          status: 'TASLAK', // New revision starts as draft
          validUntil: sourceQuote.validUntil,
          validityDays: sourceQuote.validityDays,
          version: newVersion,
          parentQuoteId: currentQuoteId, // Link to current quote as parent
          createdById: user.id,
          notes: sourceQuote.notes,
        },
      });

      // Copy items
      if (sourceQuote.items.length > 0) {
        await tx.quoteItem.createMany({
          data: sourceQuote.items.map((item) => ({
            quoteId: quote.id,
            productId: item.productId,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
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
          })),
        });
      }

      // Copy commercial terms
      if (sourceQuote.commercialTerms.length > 0) {
        await tx.quoteCommercialTerm.createMany({
          data: sourceQuote.commercialTerms.map((term) => ({
            quoteId: quote.id,
            category: term.category,
            value: term.value,
            sortOrder: term.sortOrder,
          })),
        });
      }

      // Create history entry
      await tx.quoteHistory.create({
        data: {
          quoteId: quote.id,
          userId: user.id,
          action: 'CREATE',
          changes: {
            revertedFrom: {
              quoteId: sourceQuoteId,
              version: sourceQuote.version,
              quoteNumber: sourceQuote.quoteNumber,
            },
            note: note || `Versiyon ${sourceQuote.version} baz alınarak oluşturuldu`,
          },
        },
      });

      return quote;
    });

    // Fetch the complete new quote with relations
    const completeQuote = await db.quote.findUnique({
      where: { id: newQuote.id },
      include: {
        company: true,
        project: true,
        createdBy: { select: { id: true, fullName: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json({
      quote: completeQuote,
      message: `Versiyon ${sourceQuote.version} baz alınarak yeni revizyon oluşturuldu`,
    }, { status: 201 });
  } catch (error) {
    console.error('Revert quote error:', error);
    return NextResponse.json(
      { error: 'Teklif geri alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
