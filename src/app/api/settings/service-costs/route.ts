import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await db.serviceCostConfig.findFirst({
      where: { isActive: true },
      orderBy: { validFrom: 'desc' },
    });

    const liftingRates = await db.liftingEquipmentRate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ config, liftingRates });
  } catch (error) {
    console.error('Service cost config GET error:', error);
    return NextResponse.json(
      { error: 'Hizmet maliyet ayarları alınırken bir hata oluştu' },
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

    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { dailySalary, dailyHotel, dailyMealsOutCity, dailyMealsOffice, dailyVehicle, perKmCost, distanceBrackets, validFrom } = body;

    // Validate required fields
    if (!dailySalary || !dailyHotel || !dailyMealsOutCity || !dailyMealsOffice || !dailyVehicle || !perKmCost) {
      return NextResponse.json(
        { error: 'Tüm maliyet alanları doldurulmalıdır' },
        { status: 400 }
      );
    }

    // Deactivate previous active configs
    await db.serviceCostConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new config
    const config = await db.serviceCostConfig.create({
      data: {
        dailySalary,
        dailyHotel,
        dailyMealsOutCity,
        dailyMealsOffice,
        dailyVehicle,
        perKmCost,
        distanceBrackets: distanceBrackets || [75, 150, 200, 250, 500, 750, 1000, 1250],
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        isActive: true,
        createdById: user.id,
      },
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error('Service cost config POST error:', error);
    return NextResponse.json(
      { error: 'Hizmet maliyet ayarları kaydedilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
