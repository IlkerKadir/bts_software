import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import {
  calculateUnitPrice,
  calculateItemTotalWithVat,
  calculateQuoteTotals,
  type QuoteItem,
} from '@/lib/quote-calculations';
import { quoteItemSchema, bulkQuoteItemUpdateSchema } from '@/lib/validations/quote';

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

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Fetch items
    const items = await db.quoteItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Quote items GET error:', error);
    return NextResponse.json(
      { error: 'Kalemler yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Validate input using schema
    const validation = quoteItemSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz kalem verisi' },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Get max sort order
    const maxItem = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: 'desc' },
    });
    const nextSortOrder = (maxItem?.sortOrder || 0) + 1;

    // Calculate prices using tested calculation module
    const { listPrice, katsayi, quantity, discountPct, vatRate } = data;

    const unitPrice = calculateUnitPrice(listPrice, katsayi);
    const totalPrice = calculateItemTotalWithVat({
      quantity,
      unitPrice,
      discountPct,
      vatRate,
    });

    const item = await db.quoteItem.create({
      data: {
        quoteId,
        productId: data.productId || null,
        itemType: data.itemType,
        sortOrder: body.sortOrder ?? nextSortOrder,
        code: data.code || null,
        brand: data.brand || null,
        description: data.description,
        quantity,
        unit: data.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct,
        vatRate,
        totalPrice,
        notes: data.notes || null,
      },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
      },
    });

    // Recalculate quote totals
    await recalculateQuoteTotals(quoteId);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Quote item POST error:', error);
    return NextResponse.json(
      { error: 'Kalem eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Validate input using schema
    const validation = bulkQuoteItemUpdateSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz kalem verisi' },
        { status: 400 }
      );
    }
    const { items: validatedItems } = validation.data;

    // Verify quote exists
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    // Update items in a transaction
    await db.$transaction(async (tx) => {
      for (const item of validatedItems) {
        const { listPrice, katsayi, quantity, discountPct, vatRate } = item;

        // Calculate prices using tested calculation module
        const unitPrice = calculateUnitPrice(listPrice, katsayi);
        const totalPrice = calculateItemTotalWithVat({
          quantity,
          unitPrice,
          discountPct,
          vatRate,
        });

        await tx.quoteItem.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            code: item.code || null,
            brand: item.brand || null,
            description: item.description,
            quantity,
            unit: item.unit,
            listPrice,
            katsayi,
            unitPrice,
            discountPct,
            vatRate,
            totalPrice,
            notes: item.notes || null,
          },
        });
      }
    });

    // Recalculate quote totals
    await recalculateQuoteTotals(quoteId);

    // Fetch updated items
    const items = await db.quoteItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
      include: {
        product: {
          include: {
            brand: true,
            category: true,
          },
        },
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Quote items PUT error:', error);
    return NextResponse.json(
      { error: 'Kalemler güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

async function recalculateQuoteTotals(quoteId: string) {
  const items = await db.quoteItem.findMany({
    where: { quoteId },
  });

  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return;

  // Convert DB items to calculation module format
  const quoteItems: QuoteItem[] = items.map((item) => ({
    itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    discountPct: Number(item.discountPct),
    vatRate: Number(item.vatRate),
  }));

  // Use tested calculation module
  const totals = calculateQuoteTotals(quoteItems, Number(quote.discountPct));

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
    },
  });
}
