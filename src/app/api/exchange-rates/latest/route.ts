import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fromCurrency = searchParams.get('from');
    const toCurrency = searchParams.get('to');

    if (!fromCurrency || !toCurrency) {
      return NextResponse.json(
        { error: 'from ve to parametreleri gereklidir' },
        { status: 400 }
      );
    }

    const rate = await db.exchangeRate.findFirst({
      where: {
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
      },
      orderBy: { fetchedAt: 'desc' },
    });

    if (!rate) {
      return NextResponse.json(
        { error: `${fromCurrency}/${toCurrency} için döviz kuru bulunamadı` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      rate: {
        id: rate.id,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rate: Number(rate.rate),
        source: rate.source,
        isManual: rate.isManual,
        fetchedAt: rate.fetchedAt,
      }
    });
  } catch (error) {
    console.error('Latest exchange rate GET error:', error);
    return NextResponse.json(
      { error: 'Döviz kuru alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
