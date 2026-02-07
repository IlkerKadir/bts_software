import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { fetchTcmbRates, calculateAllExchangeRates } from '@/lib/services/tcmb-service';

export async function POST() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch rates from TCMB
    const tcmbRates = await fetchTcmbRates();

    if (tcmbRates.length === 0) {
      return NextResponse.json(
        { error: 'TCMB\'den döviz kuru alınamadı' },
        { status: 502 }
      );
    }

    // Calculate all cross rates (USD/EUR, EUR/GBP, TRY/USD, etc.)
    const allRates = calculateAllExchangeRates(tcmbRates);

    const now = new Date();
    const createdRates = [];

    // Store each rate in the database
    for (const rateData of allRates) {
      const rate = await db.exchangeRate.create({
        data: {
          fromCurrency: rateData.fromCurrency,
          toCurrency: rateData.toCurrency,
          rate: rateData.rate,
          source: 'TCMB',
          isManual: false,
          fetchedAt: now,
        },
      });

      createdRates.push({
        id: rate.id,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rate: Number(rate.rate),
        source: rate.source,
        fetchedAt: rate.fetchedAt,
      });
    }

    return NextResponse.json({
      message: `${createdRates.length} döviz kuru TCMB'den güncellendi (tüm çapraz kurlar dahil)`,
      rates: createdRates,
      syncedAt: now,
    });
  } catch (error) {
    console.error('TCMB sync error:', error);

    if (error instanceof Error && error.message.includes('TCMB')) {
      return NextResponse.json(
        { error: error.message },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Döviz kurları güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// GET - Check last sync status
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the most recent TCMB rate
    const lastSync = await db.exchangeRate.findFirst({
      where: { source: 'TCMB' },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });

    // Get latest rates for each currency pair
    const latestRates = await db.exchangeRate.findMany({
      orderBy: { fetchedAt: 'desc' },
      distinct: ['fromCurrency', 'toCurrency'],
    });

    // Group rates for easier reading
    const ratesByBase: Record<string, Record<string, number>> = {};
    for (const rate of latestRates) {
      if (!ratesByBase[rate.fromCurrency]) {
        ratesByBase[rate.fromCurrency] = {};
      }
      ratesByBase[rate.fromCurrency][rate.toCurrency] = Number(rate.rate);
    }

    return NextResponse.json({
      lastSyncAt: lastSync?.fetchedAt || null,
      rates: latestRates.map(rate => ({
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rate: Number(rate.rate),
        source: rate.source,
        fetchedAt: rate.fetchedAt,
      })),
      rateMatrix: ratesByBase,
    });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json(
      { error: 'Senkronizasyon durumu alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
