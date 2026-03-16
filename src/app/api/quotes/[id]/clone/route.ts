import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateQuoteNumber, getCurrentYearPrefix, getNextSequence } from '@/lib/quote-number';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getNextQuoteNumber(): Promise<string> {
  const prefix = getCurrentYearPrefix();

  const lastQuote = await db.quote.findFirst({
    where: {
      quoteNumber: { startsWith: prefix },
      // Exclude revision numbers (e.g. BTS-2026-0010-R2) so we find the true last sequence
      NOT: { quoteNumber: { contains: '-R' } },
    },
    orderBy: { quoteNumber: 'desc' },
  });

  const nextSequence = getNextSequence(lastQuote?.quoteNumber || null);
  return generateQuoteNumber(nextSequence);
}

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
        items: {
          orderBy: { sortOrder: 'asc' },
        },
        commercialTerms: {
          orderBy: { sortOrder: 'asc' },
        },
        ekMaliyetler: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!sourceQuote) {
      return NextResponse.json({ error: 'Kaynak teklif bulunamadi' }, { status: 404 });
    }

    // Generate new quote number
    const quoteNumber = await getNextQuoteNumber();

    // Get current exchange rate
    const exchangeRate = await db.exchangeRate.findFirst({
      where: {
        fromCurrency: sourceQuote.currency,
        toCurrency: 'TRY',
      },
      orderBy: { fetchedAt: 'desc' },
    });

    // Create the cloned quote
    const newQuote = await db.quote.create({
      data: {
        quoteNumber,
        companyId: sourceQuote.companyId,
        projectId: sourceQuote.projectId,
        subject: sourceQuote.subject,
        currency: sourceQuote.currency,
        exchangeRate: exchangeRate?.rate || sourceQuote.exchangeRate,
        protectionPct: sourceQuote.protectionPct,
        subtotal: sourceQuote.subtotal,
        discountTotal: sourceQuote.discountTotal,
        discountPct: sourceQuote.discountPct,
        vatTotal: sourceQuote.vatTotal,
        grandTotal: sourceQuote.grandTotal,
        status: 'TASLAK',
        validityDays: sourceQuote.validityDays,
        version: 1,
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
        action: 'CLONE',
        changes: {
          sourceQuoteId: sourceQuote.id,
          sourceQuoteNumber: sourceQuote.quoteNumber,
        },
      },
    });

    return NextResponse.json({ quote: newQuote }, { status: 201 });
  } catch (error) {
    console.error('Quote clone error:', error);
    return NextResponse.json(
      { error: 'Teklif kopyalanirken bir hata olustu' },
      { status: 500 }
    );
  }
}
