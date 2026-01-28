import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { calculateServiceCost, ServiceCostInput, ServiceCostConfig } from '@/lib/service-cost';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const body = await request.json();

    // Verify quote exists and is editable
    const quote = await db.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    if (quote.status !== 'TASLAK' && quote.status !== 'REVIZYON') {
      return NextResponse.json(
        { error: 'Teklif düzenlenebilir durumda değil' },
        { status: 400 }
      );
    }

    // Get active service cost config
    const dbConfig = await db.serviceCostConfig.findFirst({
      where: { isActive: true },
      orderBy: { validFrom: 'desc' },
    });
    if (!dbConfig) {
      return NextResponse.json(
        { error: 'Hizmet maliyet ayarları bulunamadı' },
        { status: 500 }
      );
    }

    // Build config for calculator
    const config: ServiceCostConfig = {
      dailySalary: Number(dbConfig.dailySalary),
      dailyHotel: Number(dbConfig.dailyHotel),
      dailyMealsOutCity: Number(dbConfig.dailyMealsOutCity),
      dailyMealsOffice: Number(dbConfig.dailyMealsOffice),
      dailyVehicle: Number(dbConfig.dailyVehicle),
      perKmCost: Number(dbConfig.perKmCost),
      distanceBrackets: dbConfig.distanceBrackets as number[],
    };

    // Build input for calculator
    const input: ServiceCostInput = {
      teamSize: body.teamSize,
      days: body.days,
      locationType: body.locationType,
      distanceKm: body.distanceKm,
      liftingEquipment: body.liftingEquipment,
    };

    // Calculate
    const breakdown = calculateServiceCost(input, config);

    // Get next sort order
    const lastItem = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: 'desc' },
    });

    // Build description
    const serviceTypeLabel = body.serviceType || 'Muhendislik Hizmeti';
    const locationLabels: Record<string, string> = {
      sehir_ici: 'Sehir Ici',
      ofis: 'Ofis',
      sehir_disi: 'Sehir Disi',
    };
    const description = `${serviceTypeLabel} - ${input.teamSize} Kisi, ${input.days} Gun, ${locationLabels[input.locationType] || input.locationType}${input.distanceKm ? ` (${input.distanceKm}km)` : ''}`;

    // Create SERVICE-type QuoteItem
    const item = await db.quoteItem.create({
      data: {
        quoteId,
        itemType: 'SERVICE',
        sortOrder: (lastItem?.sortOrder || 0) + 1,
        description,
        quantity: 1,
        unitPrice: breakdown.grandTotal,
        totalPrice: breakdown.grandTotal,
        serviceMeta: {
          ...breakdown,
          input: {
            teamSize: input.teamSize,
            days: input.days,
            locationType: input.locationType,
            distanceKm: input.distanceKm,
            liftingEquipment: input.liftingEquipment,
            serviceType: body.serviceType,
          },
        },
      },
    });

    return NextResponse.json({ item, breakdown }, { status: 201 });
  } catch (error) {
    console.error('Service item creation error:', error);
    return NextResponse.json(
      { error: 'Hizmet kalemi eklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
