import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { fetchTcmbDirectRates } from '@/lib/services/tcmb-service';

/**
 * GET /api/exchange-rates/tcmb
 *
 * Returns ForexSelling (Döviz Satış) and BanknoteSelling (Efektif Satış)
 * rates for EUR, USD, GBP directly from TCMB.
 * Uses in-memory cache with 1-hour TTL.
 */
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await fetchTcmbDirectRates();

    if (!result) {
      return NextResponse.json(
        { error: 'TCMB\'den kur bilgisi alınamadı. Lütfen daha sonra tekrar deneyin.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      rates: result.rates,
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    console.error('TCMB direct rate API error:', error);
    return NextResponse.json(
      { error: 'TCMB kur bilgisi alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
