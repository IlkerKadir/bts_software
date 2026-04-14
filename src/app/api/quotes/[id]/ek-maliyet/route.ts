import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ekMaliyetPutSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().min(1, 'Başlık gerekli'),
      amount: z.number().min(0, 'Tutar negatif olamaz'),
    })
  ),
  /**
   * Currency that every line's `amount` is denominated in. Modal
   * stamps this on Apply so rate-update flows can redistribute later.
   * Optional for backwards-compatibility: omitting it leaves
   * sourceCurrency as NULL on the row (treated as TRY on read).
   */
  sourceCurrency: z.enum(['TRY', 'EUR', 'USD', 'GBP']).optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const items = await db.quoteEkMaliyet.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      items: items.map(item => ({
        ...item,
        amount: Number(item.amount),
        sourceCurrency: item.sourceCurrency,
      })),
    });
  } catch (error) {
    console.error('Ek maliyet GET error:', error);
    return NextResponse.json(
      { error: 'Ek maliyetler yüklenirken bir hata oluştu' },
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

    const validation = ekMaliyetPutSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }

    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const sourceCurrency = validation.data.sourceCurrency ?? null;

    // Replace all entries in a transaction
    const items = await db.$transaction(async (tx) => {
      await tx.quoteEkMaliyet.deleteMany({ where: { quoteId } });

      const created = [];
      for (let i = 0; i < validation.data.items.length; i++) {
        const entry = validation.data.items[i];
        const item = await tx.quoteEkMaliyet.create({
          data: {
            quoteId,
            title: entry.title,
            amount: entry.amount,
            // Stamp the entry currency so Phase 4's Kurları Güncelle
            // flow can redistribute this line correctly when rates
            // move. Null here = legacy row (modal never sent it).
            sourceCurrency,
            sortOrder: i,
          },
        });
        created.push(item);
      }

      return created;
    });

    return NextResponse.json({
      items: items.map(item => ({
        ...item,
        amount: Number(item.amount),
      })),
    });
  } catch (error) {
    console.error('Ek maliyet PUT error:', error);
    return NextResponse.json(
      { error: 'Ek maliyetler kaydedilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
