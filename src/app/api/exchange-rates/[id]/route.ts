import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateExchangeRateSchema = z.object({
  rate: z.number().positive().optional(),
  source: z.enum(['MANUAL', 'TCMB']).optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const exchangeRate = await db.exchangeRate.findUnique({
      where: { id },
    });

    if (!exchangeRate) {
      return NextResponse.json({ error: 'Döviz kuru bulunamadı' }, { status: 404 });
    }

    return NextResponse.json({ exchangeRate });
  } catch (error) {
    console.error('Exchange rate GET error:', error);
    return NextResponse.json(
      { error: 'Döviz kuru alınırken bir hata oluştu' },
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

    const { id } = await params;

    const existingRate = await db.exchangeRate.findUnique({
      where: { id },
    });

    if (!existingRate) {
      return NextResponse.json({ error: 'Döviz kuru bulunamadı' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateExchangeRateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { rate, source } = validation.data;

    const exchangeRate = await db.exchangeRate.update({
      where: { id },
      data: {
        ...(rate !== undefined && { rate }),
        ...(source !== undefined && { source, isManual: source === 'MANUAL' }),
      },
    });

    return NextResponse.json({ exchangeRate });
  } catch (error) {
    console.error('Exchange rate PUT error:', error);
    return NextResponse.json(
      { error: 'Döviz kuru güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existingRate = await db.exchangeRate.findUnique({
      where: { id },
    });

    if (!existingRate) {
      return NextResponse.json({ error: 'Döviz kuru bulunamadı' }, { status: 404 });
    }

    await db.exchangeRate.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Döviz kuru silindi' });
  } catch (error) {
    console.error('Exchange rate DELETE error:', error);
    return NextResponse.json(
      { error: 'Döviz kuru silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
