import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { calculateServiceCost, ServiceCostInput, ServiceCostConfig } from '@/lib/service-cost';

const serviceInputSchema = z.object({
  teamSize: z.union([z.literal(1), z.literal(2)]),
  days: z.number().int().min(1).max(15),
  locationType: z.enum(['IN_CITY', 'OFFICE', 'OUT_CITY', 'sehir_ici', 'ofis', 'sehir_disi']),
  distanceKm: z.number().min(0).optional(),
  liftingEquipment: z.object({
    rateId: z.string().optional(),
    days: z.number().int().min(1).optional(),
    dailyRate: z.number().min(0).optional(),
    transportCost: z.number().min(0).optional(),
    rentalDays: z.number().int().min(1).optional(),
  }).optional(),
  serviceType: z.string().optional(),
  description: z.string().optional(),
});

// Map frontend location types to calculator format
const locationTypeMap: Record<string, 'sehir_ici' | 'ofis' | 'sehir_disi'> = {
  IN_CITY: 'sehir_ici',
  OFFICE: 'ofis',
  OUT_CITY: 'sehir_disi',
  sehir_ici: 'sehir_ici',
  ofis: 'ofis',
  sehir_disi: 'sehir_disi',
};

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

    // Validate request body
    const validation = serviceInputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Geçersiz hizmet verisi', details: validation.error.format() },
        { status: 400 }
      );
    }
    const validatedBody = validation.data;

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

    // Build config for calculator - use .toNumber() for proper Prisma Decimal conversion
    const config: ServiceCostConfig = {
      dailySalary: dbConfig.dailySalary.toNumber(),
      dailyHotel: dbConfig.dailyHotel.toNumber(),
      dailyMealsOutCity: dbConfig.dailyMealsOutCity.toNumber(),
      dailyMealsOffice: dbConfig.dailyMealsOffice.toNumber(),
      dailyVehicle: dbConfig.dailyVehicle.toNumber(),
      perKmCost: dbConfig.perKmCost.toNumber(),
      distanceBrackets: dbConfig.distanceBrackets as number[],
    };

    // Map location type from frontend format to calculator format
    const mappedLocationType = locationTypeMap[validatedBody.locationType] || 'sehir_ici';

    // Resolve lifting equipment - frontend sends rateId, need to look up dailyRate
    let liftingEquipment: ServiceCostInput['liftingEquipment'];
    if (validatedBody.liftingEquipment) {
      if (validatedBody.liftingEquipment.rateId) {
        // Frontend format: { rateId, days } - look up rate from DB
        const rate = await db.liftingEquipmentRate.findUnique({
          where: { id: validatedBody.liftingEquipment.rateId },
        });
        if (rate) {
          liftingEquipment = {
            dailyRate: rate.dailyRate.toNumber(),
            transportCost: 0,
            rentalDays: validatedBody.liftingEquipment.days || 1,
          };
        }
      } else if (validatedBody.liftingEquipment.dailyRate !== undefined) {
        // Direct format: { dailyRate, transportCost, rentalDays }
        liftingEquipment = {
          dailyRate: validatedBody.liftingEquipment.dailyRate,
          transportCost: validatedBody.liftingEquipment.transportCost || 0,
          rentalDays: validatedBody.liftingEquipment.rentalDays || 1,
        };
      }
    }

    // Build input for calculator
    const input: ServiceCostInput = {
      teamSize: validatedBody.teamSize,
      days: validatedBody.days,
      locationType: mappedLocationType,
      distanceKm: validatedBody.distanceKm,
      liftingEquipment,
    };

    // Calculate (result is in TRY)
    const breakdown = calculateServiceCost(input, config);

    // Convert from TRY to quote currency
    const exchangeRate = quote.exchangeRate.toNumber();
    const protectionPct = quote.protectionPct.toNumber();
    const quoteCurrency = quote.currency;

    let convertedTotal = breakdown.grandTotal;
    if (quoteCurrency !== 'TRY' && exchangeRate > 0) {
      // Convert TRY to foreign currency: TRY / rate = foreign currency
      convertedTotal = breakdown.grandTotal / exchangeRate;
      // Apply protection percentage
      if (protectionPct > 0) {
        convertedTotal = convertedTotal * (1 + protectionPct / 100);
      }
    }
    // Round to 2 decimal places
    convertedTotal = Math.round(convertedTotal * 100) / 100;

    // Get next sort order
    const lastItem = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { sortOrder: 'desc' },
    });

    // Build description
    const serviceTypeLabels: Record<string, string> = {
      SUPERVISION: 'Supervizyon',
      TEST_COMMISSIONING: 'Test ve Devreye Alma',
      TRAINING: 'Egitim',
    };
    const serviceTypeLabel = serviceTypeLabels[validatedBody.serviceType || ''] || validatedBody.serviceType || 'Muhendislik Hizmeti';
    const locationLabels: Record<string, string> = {
      sehir_ici: 'Sehir Ici',
      ofis: 'Ofis',
      sehir_disi: 'Sehir Disi',
    };
    const description = `${serviceTypeLabel} - ${input.teamSize} Kisi, ${input.days} Gun, ${locationLabels[input.locationType] || input.locationType}${input.distanceKm ? ` (${input.distanceKm}km)` : ''}`;

    // Create SERVICE-type QuoteItem (price stored in quote currency)
    const item = await db.quoteItem.create({
      data: {
        quoteId,
        itemType: 'SERVICE',
        sortOrder: (lastItem?.sortOrder || 0) + 1,
        description,
        quantity: 1,
        unitPrice: convertedTotal,
        totalPrice: convertedTotal,
        isManualPrice: true,
        serviceMeta: {
          ...breakdown,
          // Store conversion info for reference
          originalTotalTRY: breakdown.grandTotal,
          convertedTotal,
          conversionRate: exchangeRate,
          protectionPct,
          quoteCurrency,
          input: {
            teamSize: input.teamSize,
            days: input.days,
            locationType: input.locationType,
            distanceKm: input.distanceKm,
            liftingEquipment: input.liftingEquipment,
            serviceType: validatedBody.serviceType,
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
