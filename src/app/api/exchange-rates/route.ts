import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

const createExchangeRateSchema = z.object({
  fromCurrency: z.string().min(3).max(3),
  toCurrency: z.string().min(3).max(3),
  rate: z.number().positive(),
  source: z.enum(['MANUAL', 'TCMB']).default('MANUAL'),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fromCurrency = searchParams.get('fromCurrency');
    const toCurrency = searchParams.get('toCurrency');
    const latestOnly = searchParams.get('latestOnly') === 'true';

    const where: Record<string, unknown> = {};
    if (fromCurrency) where.fromCurrency = fromCurrency;
    if (toCurrency) where.toCurrency = toCurrency;

    if (latestOnly) {
      // Get latest rate for each currency pair
      const rates = await db.exchangeRate.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        distinct: ['fromCurrency', 'toCurrency'],
      });

      return NextResponse.json({ rates });
    }

    const rates = await db.exchangeRate.findMany({
      where,
      orderBy: { fetchedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ rates });
  } catch (error) {
    console.error('Exchange rates GET error:', error);
    return NextResponse.json(
      { error: 'Döviz kurları alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createExchangeRateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { fromCurrency, toCurrency, rate, source } = validation.data;

    const exchangeRate = await db.exchangeRate.create({
      data: {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate,
        source,
        isManual: source === 'MANUAL',
        fetchedAt: new Date(),
      },
    });

    return NextResponse.json({ exchangeRate }, { status: 201 });
  } catch (error) {
    console.error('Exchange rates POST error:', error);
    return NextResponse.json(
      { error: 'Döviz kuru eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
